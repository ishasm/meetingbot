import * as http from "http";
import * as https from "https";
import { URL } from "url";
import { ChildProcessWithoutNullStreams, execSync, spawn } from "child_process";

import { MeetsBot } from "../../meet/src/bot";
import { BotConfig, EventCode } from "../../src/types";

/**
 * Google Meet bot with Gemini Live voice-assistant pipeline.
 *
 * Extends the standard `MeetsBot` and adds:
 *   - A `parec`-based live audio capture that streams PCM chunks to the
 *     orchestrator at `ORCHESTRATOR_URL/audio-chunk` every
 *     AUDIO_CHUNK_SECONDS (default 5s).
 *   - A tiny local HTTP control server (`CONTROL_PORT`, default 7070) so the
 *     orchestrator can tell the bot to mute/unmute its Meet microphone around
 *     TTS playback.
 *   - A `/bots/{id}/start` call to the orchestrator on meeting entry and
 *     `/bots/{id}/stop` on teardown.
 *
 * Recording can be toggled off via `BotConfig.recording.enabled=false`. When
 * disabled we still spawn `parec`, but skip the FFmpeg recording path entirely.
 */
export class MeetsVoiceBot extends MeetsBot {
  private orchestratorUrl: string;
  private botControlPort: number;
  private audioChunkSeconds: number;
  private pulseSource: string;

  private parecProcess: ChildProcessWithoutNullStreams | null = null;
  private controlServer: http.Server | null = null;

  private readonly recordingEnabled: boolean;
  private readonly voiceAssistantEnabled: boolean;

  constructor(
    botSettings: BotConfig,
    onEvent: (eventType: EventCode, data?: any) => Promise<void>
  ) {
    super(botSettings, onEvent);

    this.orchestratorUrl = (
      process.env.ORCHESTRATOR_URL || "http://orchestrator:8080"
    ).replace(/\/$/, "");
    this.botControlPort = Number(process.env.CONTROL_PORT || 7070);
    this.audioChunkSeconds = Number(process.env.AUDIO_CHUNK_SECONDS || 5);
    this.pulseSource = process.env.PULSE_SOURCE || "BotMic";

    this.recordingEnabled = botSettings.recording?.enabled ?? true;
    this.voiceAssistantEnabled =
      botSettings.voiceAssistant?.enabled ?? true;

    if (botSettings.voiceAssistant?.orchestratorUrl) {
      this.orchestratorUrl = botSettings.voiceAssistant.orchestratorUrl.replace(
        /\/$/,
        ""
      );
    }
  }

  /**
   * Ensure a capture sink exists for Chromium's audio output when recording
   * is disabled. When recording is enabled the base class will create its own
   * `virtual_speaker` null sink inside `startRecording`, so we skip this.
   */
  private ensureCaptureSink(): void {
    const sinkName = process.env.MEET_CAPTURE_SINK || "virtual_speaker";
    try {
      const sinks = execSync("pactl list short sinks", { encoding: "utf8" });
      if (!sinks.split("\n").some((line) => line.split("\t")[1] === sinkName)) {
        console.log(`[voice-bot] Creating capture sink '${sinkName}'...`);
        execSync(
          `pactl load-module module-null-sink sink_name=${sinkName} sink_properties=device.description="Meet_Capture"`,
          { encoding: "utf8" }
        );
      }
      execSync(`pactl set-default-sink ${sinkName}`, { encoding: "utf8" });
    } catch (err) {
      console.warn("[voice-bot] Could not ensure capture sink:", err);
    }
  }

  async run(): Promise<void> {
    if (this.voiceAssistantEnabled) {
      this.startControlServer();
      await this.startVoiceSession().catch((err) => {
        console.error("[voice-bot] Failed to start orchestrator session:", err);
      });
    }
    try {
      await super.run();
    } finally {
      await this.stopVoicePipeline();
    }
  }

  async startRecording(): Promise<void> {
    // Route Chrome's audio output to virtual_speaker BEFORE we start capturing
    // so both ffmpeg (recording) and parec (Gemini input) get meeting audio.
    // Stream-restore can otherwise pin Chromium to BotSpeaker, which would
    // both silence the recording AND feed meeting audio back into BotMic
    // (echo loop).
    if (this.voiceAssistantEnabled) {
      this.ensureCaptureSink();
      this.routeChromiumToCaptureSink();
    }

    if (this.recordingEnabled) {
      await super.startRecording();
    } else {
      console.log("[voice-bot] Recording disabled via BotConfig; skipping FFmpeg.");
    }
    if (this.voiceAssistantEnabled) {
      // Chromium may create new sink-inputs after login / joining the call,
      // so re-route once more after ffmpeg is up.
      this.routeChromiumToCaptureSink();
      this.startParecStream();
      // The base MeetsBot always joins muted; for voice-assistant mode we
      // need the mic live so BotMic reaches other participants. Orchestrator
      // will still mute around TTS via handleMicAction("mute").
      await this.unmuteForVoiceAssistant();
    }
  }

  /**
   * Ensure every Chromium sink-input is playing to the capture sink
   * (virtual_speaker) rather than BotSpeaker. BotSpeaker is reserved for
   * orchestrator TTS; mixing Chrome output into it causes both silent
   * recordings and a mic-echo feedback loop through BotMic.
   */
  private routeChromiumToCaptureSink(): void {
    const targetSink = process.env.MEET_CAPTURE_SINK || "virtual_speaker";
    try {
      const raw = execSync("pactl list sink-inputs", { encoding: "utf8" });
      // Each sink-input block starts with "Sink Input #<id>". Capture id + sink.
      const blocks = raw.split(/\n(?=Sink Input #)/g);
      let moved = 0;
      for (const block of blocks) {
        if (!/application\.(name|process\.binary)\s*=\s*"(Chromium|chrome)"/i.test(block)) {
          continue;
        }
        const idMatch = block.match(/Sink Input #(\d+)/);
        if (!idMatch) continue;
        const id = idMatch[1];
        try {
          execSync(`pactl move-sink-input ${id} ${targetSink}`, { encoding: "utf8" });
          moved += 1;
        } catch (err) {
          console.warn(
            `[voice-bot] Failed to move Chromium sink-input ${id} → ${targetSink}:`,
            err
          );
        }
      }
      console.log(
        `[voice-bot] Routed ${moved} Chromium sink-input(s) to '${targetSink}'.`
      );
    } catch (err) {
      console.warn("[voice-bot] routeChromiumToCaptureSink failed:", err);
    }
  }

  /**
   * Voice-bot overrides the base ffmpeg audio source so we record the
   * dedicated meeting-audio sink by NAME (not a brittle pulse index that
   * shifts when extra sinks like BotSpeaker exist).
   */
  getFFmpegParams(): string[] {
    const params = super.getFFmpegParams();
    const targetSource =
      process.env.MEET_RECORDING_SOURCE ||
      `${process.env.MEET_CAPTURE_SINK || "virtual_speaker"}.monitor`;
    for (let i = 0; i < params.length - 1; i += 1) {
      if (params[i] === "-f" && params[i + 1] === "pulse") {
        // the very next "-i <value>" is the audio source we want to override
        for (let j = i + 2; j < params.length - 1; j += 1) {
          if (params[j] === "-i") {
            params[j + 1] = targetSource;
            break;
          }
        }
        break;
      }
    }
    console.log(`[voice-bot] FFmpeg audio source overridden → ${targetSource}`);
    return params;
  }

  private async unmuteForVoiceAssistant(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForTimeout(1500);
      await this.handleMicAction("unmute");
      console.log("[voice-bot] Mic unmuted for voice-assistant mode.");
    } catch (err) {
      console.warn("[voice-bot] Failed to unmute mic at meeting entry:", err);
    }
  }

  async stopRecording(): Promise<any> {
    this.stopParecStream();
    if (this.recordingEnabled) {
      return super.stopRecording();
    }
    return 0;
  }

  async endLife(): Promise<any> {
    await this.stopVoicePipeline();
    return super.endLife();
  }

  // ---------------------------------------------------------------------
  // Orchestrator session lifecycle
  // ---------------------------------------------------------------------

  private controlUrl(): string {
    return `http://${process.env.HOSTNAME || "localhost"}:${this.botControlPort}`;
  }

  private async startVoiceSession(): Promise<void> {
    const url = `${this.orchestratorUrl}/bots/${this.settings.id}/start`;
    await this.postJson(url, { control_url: this.controlUrl() });
    console.log("[voice-bot] Orchestrator session started:", url);
  }

  private async stopVoiceSession(): Promise<void> {
    try {
      const url = `${this.orchestratorUrl}/bots/${this.settings.id}/stop`;
      await this.postJson(url, {});
      console.log("[voice-bot] Orchestrator session stopped.");
    } catch (err) {
      console.warn("[voice-bot] Failed to stop orchestrator session:", err);
    }
  }

  private async stopVoicePipeline(): Promise<void> {
    this.stopParecStream();
    await this.stopVoiceSession();
    this.stopControlServer();
  }

  // ---------------------------------------------------------------------
  // parec audio capture → orchestrator /audio-chunk
  // ---------------------------------------------------------------------

  private startParecStream(): void {
    if (this.parecProcess) {
      return;
    }
    const monitorSource = `${process.env.PULSE_SINK || "BotSpeaker"}.monitor`;
    // We capture from the default source so we record the meeting audio,
    // NOT from BotSpeaker.monitor (which would echo the bot's own voice).
    const captureSource = process.env.PAREC_CAPTURE_SOURCE || "@DEFAULT_MONITOR@";

    const args = [
      "--device",
      captureSource,
      "--format=s16le",
      "--rate=16000",
      "--channels=1",
      "--raw",
    ];
    console.log(
      "[voice-bot] Starting parec capture from",
      captureSource,
      "(monitor sink:",
      monitorSource + ")"
    );

    this.parecProcess = spawn("parec", args, { stdio: ["ignore", "pipe", "pipe"] });

    const bytesPerChunk =
      16000 /* rate */ * 2 /* s16 */ * 1 /* mono */ * this.audioChunkSeconds;
    let buffer = Buffer.alloc(0);

    this.parecProcess.stdout.on("data", (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= bytesPerChunk) {
        const slice = buffer.subarray(0, bytesPerChunk);
        buffer = buffer.subarray(bytesPerChunk);
        this.sendAudioChunk(slice).catch((err) => {
          console.warn("[voice-bot] Failed to POST /audio-chunk:", err);
        });
      }
    });

    this.parecProcess.stderr.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) {
        console.log(`[parec] ${msg}`);
      }
    });

    this.parecProcess.on("exit", (code, signal) => {
      console.log(`[voice-bot] parec exited (code=${code}, signal=${signal})`);
      this.parecProcess = null;
    });
  }

  private stopParecStream(): void {
    if (!this.parecProcess) return;
    console.log("[voice-bot] Stopping parec capture...");
    try {
      this.parecProcess.kill("SIGTERM");
    } catch (err) {
      console.warn("[voice-bot] Error killing parec:", err);
    }
    this.parecProcess = null;
  }

  private async sendAudioChunk(pcm: Buffer): Promise<void> {
    const payload = JSON.stringify({
      bot_id: this.settings.id,
      audio_b64: pcm.toString("base64"),
      ts: Date.now() / 1000,
    });
    await this.postJson(`${this.orchestratorUrl}/audio-chunk`, payload, true);
  }

  // ---------------------------------------------------------------------
  // Local HTTP control server: orchestrator -> bot mute/unmute
  // ---------------------------------------------------------------------

  private startControlServer(): void {
    if (this.controlServer) return;

    this.controlServer = http.createServer((req, res) => {
      if (req.method !== "POST" || !req.url || !req.url.endsWith("/control")) {
        res.statusCode = 404;
        res.end();
        return;
      }
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const data = body ? JSON.parse(body) : {};
          const action = String(data.action || "").toLowerCase();
          await this.handleMicAction(action);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ status: "ok", action }));
        } catch (err) {
          console.error("[voice-bot] /control handler failed:", err);
          res.statusCode = 500;
          res.end(JSON.stringify({ status: "error" }));
        }
      });
    });

    this.controlServer.listen(this.botControlPort, "0.0.0.0", () => {
      console.log(
        `[voice-bot] Control server listening on :${this.botControlPort}`
      );
    });
  }

  private stopControlServer(): void {
    if (!this.controlServer) return;
    this.controlServer.close();
    this.controlServer = null;
  }

  private async handleMicAction(action: string): Promise<void> {
    if (!this.page) return;
    const muteSelector = `[aria-label*="Turn off microphone"]`;
    const unmuteSelector = `[aria-label*="Turn on microphone"]`;

    try {
      if (action === "unmute") {
        await this.page.click(unmuteSelector, { timeout: 500 }).catch(() => {});
      } else if (action === "mute") {
        await this.page.click(muteSelector, { timeout: 500 }).catch(() => {});
      }
    } catch (err) {
      console.warn("[voice-bot] mic action failed:", err);
    }
  }

  // ---------------------------------------------------------------------
  // Small HTTP helper (avoid pulling in a new dependency just for this).
  // ---------------------------------------------------------------------

  private postJson(urlStr: string, body: unknown, bodyIsString = false): Promise<void> {
    return new Promise((resolve, reject) => {
      let target: URL;
      try {
        target = new URL(urlStr);
      } catch (err) {
        reject(err);
        return;
      }
      const payload = bodyIsString ? (body as string) : JSON.stringify(body ?? {});
      const options: http.RequestOptions = {
        method: "POST",
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: target.pathname + target.search,
        // Disable keep-alive: Uvicorn's default timeout_keep_alive is 5s which
        // races with our 5s chunk interval and causes intermittent ECONNRESET
        // ("socket hang up") on stale pooled sockets.
        agent: false,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          Connection: "close",
        },
      };
      const mod = target.protocol === "https:" ? https : http;
      const req = mod.request(options, (res) => {
        res.resume();
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
          }
        });
      });
      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}
