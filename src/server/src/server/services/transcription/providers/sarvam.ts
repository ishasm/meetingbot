/**
 * Sarvam batch speech-to-text provider.
 *
 * Uses Sarvam's batch workflow so it can handle longer meeting recordings:
 * 1) Create job
 * 2) Request upload URL
 * 3) Upload file
 * 4) Start job
 * 5) Poll status
 * 6) Request download URL and parse result
 */
import {
  type ITranscriptionProvider,
  type TranscriptionResult,
  type TranscriptionOptions,
  type TranscriptionSegment,
  type TranscriptionWord,
  TranscriptionError,
  generateSrt,
} from "../types";

const SARVAM_API_URL = "https://api.sarvam.ai";
const MAX_POLL_ATTEMPTS = 240; // 20 minutes @ 5s interval
const POLL_INTERVAL_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapLanguageToSarvam(language?: string): string | undefined {
  if (!language) return undefined;

  const normalized = language.toLowerCase();
  if (normalized === "en") return "en-IN";
  if (normalized === "hi") return "hi-IN";
  if (normalized === "bn") return "bn-IN";
  if (normalized === "kn") return "kn-IN";
  if (normalized === "ml") return "ml-IN";
  if (normalized === "mr") return "mr-IN";
  if (normalized === "od") return "od-IN";
  if (normalized === "pa") return "pa-IN";
  if (normalized === "ta") return "ta-IN";
  if (normalized === "te") return "te-IN";
  if (normalized === "gu") return "gu-IN";
  if (language.includes("-")) return language;
  return undefined;
}

type SarvamJobInitResponse = {
  job_id: string;
  job_state: string;
};

type SarvamSignedFile = {
  file_url: string;
  file_metadata?: Record<string, unknown> | null;
};

type SarvamUploadLinksResponse = {
  upload_urls: Record<string, SarvamSignedFile>;
};

type SarvamTaskFileDetails = {
  file_name: string;
  file_id?: string;
};

type SarvamTaskDetail = {
  outputs?: SarvamTaskFileDetails[];
  state?: string;
  error_message?: string | null;
};

type SarvamStatusResponse = {
  job_state: string;
  error_message?: string;
  job_details?: SarvamTaskDetail[];
};

type SarvamDownloadLinksResponse = {
  download_urls: Record<string, SarvamSignedFile>;
};

type SarvamResultJson = {
  transcript?: string;
  language_code?: string | null;
  timestamps?: {
    words?: string[];
    start_time_seconds?: number[];
    end_time_seconds?: number[];
  } | null;
  diarized_transcript?: {
    entries?: Array<{
      transcript?: string;
      start_time_seconds?: number;
      end_time_seconds?: number;
      speaker_id?: string;
    }>;
  } | null;
};

export class SarvamProvider implements ITranscriptionProvider {
  readonly name = "sarvam";
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.SARVAM_API_KEY;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async transcribe(
    audioBuffer: Buffer,
    options: Omit<TranscriptionOptions, "provider"> = {},
  ): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new TranscriptionError(
        "Sarvam API key not configured",
        "sarvam",
        "NO_API_KEY",
      );
    }

    const startTime = Date.now();
    const fileName = `meetingbot-${Date.now()}.mp3`;

    try {
      const numSpeakers =
        options.speakersExpected ??
        (options.speakerTimeframes
          ? new Set(options.speakerTimeframes.map((s) => s.speakerName)).size
          : undefined);

      // 1) Initialize a batch job
      const initResponse = await this.fetchJson<SarvamJobInitResponse>(
        `${SARVAM_API_URL}/speech-to-text/job/v1`,
        {
          method: "POST",
          headers: this.getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            job_parameters: {
              model: "saaras:v3",
              mode: "transcribe",
              with_timestamps: true,
              with_diarization: options.speakerDiarization ?? false,
              num_speakers: numSpeakers,
              language_code: mapLanguageToSarvam(options.language) ?? "unknown",
            },
          }),
        },
      );

      const jobId = initResponse.job_id;
      if (!jobId) {
        throw new TranscriptionError(
          "Sarvam did not return a job ID",
          "sarvam",
          "MISSING_JOB_ID",
        );
      }

      // 2) Get upload URL
      const uploadLinks = await this.fetchJson<SarvamUploadLinksResponse>(
        `${SARVAM_API_URL}/speech-to-text/job/v1/upload-files`,
        {
          method: "POST",
          headers: this.getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            job_id: jobId,
            files: [fileName],
          }),
        },
      );

      const uploadUrl = uploadLinks.upload_urls?.[fileName]?.file_url;
      if (!uploadUrl) {
        throw new TranscriptionError(
          "Sarvam did not return an upload URL",
          "sarvam",
          "MISSING_UPLOAD_URL",
        );
      }

      // 3) Upload audio file to presigned URL
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "audio/mpeg",
          "Content-Length": String(audioBuffer.length),
        },
        body: audioBuffer,
      });
      if (!uploadRes.ok) {
        throw new TranscriptionError(
          `Sarvam upload failed: ${uploadRes.status}`,
          "sarvam",
          `UPLOAD_HTTP_${uploadRes.status}`,
        );
      }

      // 4) Start job
      const startRes = await fetch(
        `${SARVAM_API_URL}/speech-to-text/job/v1/${jobId}/start`,
        {
          method: "POST",
          headers: this.getHeaders(),
        },
      );
      if (!startRes.ok) {
        const errorText = await startRes.text();
        throw new TranscriptionError(
          `Sarvam start job failed: ${startRes.status} - ${errorText}`,
          "sarvam",
          `START_HTTP_${startRes.status}`,
        );
      }

      // 5) Poll status
      const completedStatus = await this.waitForJobCompletion(jobId);
      const outputFiles =
        completedStatus.job_details
          ?.flatMap((detail) => detail.outputs ?? [])
          .map((output) => output.file_name)
          .filter(Boolean) ?? [];

      if (outputFiles.length === 0) {
        throw new TranscriptionError(
          "Sarvam job completed but no output files were found",
          "sarvam",
          "NO_OUTPUT_FILES",
        );
      }

      // 6) Get download URL and parse result JSON
      const downloadLinks = await this.fetchJson<SarvamDownloadLinksResponse>(
        `${SARVAM_API_URL}/speech-to-text/job/v1/download-files`,
        {
          method: "POST",
          headers: this.getHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            job_id: jobId,
            files: outputFiles,
          }),
        },
      );

      const firstOutput = outputFiles[0];
      const outputUrl = firstOutput
        ? downloadLinks.download_urls?.[firstOutput]?.file_url
        : undefined;

      if (!outputUrl) {
        throw new TranscriptionError(
          "Sarvam did not return a download URL for output",
          "sarvam",
          "MISSING_DOWNLOAD_URL",
        );
      }

      const outputResponse = await fetch(outputUrl);
      if (!outputResponse.ok) {
        throw new TranscriptionError(
          `Failed to download Sarvam output: ${outputResponse.status}`,
          "sarvam",
          `DOWNLOAD_HTTP_${outputResponse.status}`,
        );
      }

      const outputJson = (await outputResponse.json()) as SarvamResultJson;
      const parsed = this.parseResult(outputJson);

      return {
        ...parsed,
        provider: "sarvam",
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw error;
      }
      throw new TranscriptionError(
        `Sarvam transcription failed: ${(error as Error).message}`,
        "sarvam",
        "UNKNOWN",
        error as Error,
      );
    }
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    return {
      "api-subscription-key": this.apiKey ?? "",
      ...extraHeaders,
    };
  }

  private async fetchJson<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    if (!response.ok) {
      const errorText = await response.text();
      throw new TranscriptionError(
        `Sarvam API error: ${response.status} - ${errorText}`,
        "sarvam",
        `HTTP_${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  private async waitForJobCompletion(jobId: string): Promise<SarvamStatusResponse> {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      const status = await this.fetchJson<SarvamStatusResponse>(
        `${SARVAM_API_URL}/speech-to-text/job/v1/${jobId}/status`,
        {
          method: "GET",
          headers: this.getHeaders(),
        },
      );

      if (status.job_state === "Completed") {
        return status;
      }

      if (status.job_state === "Failed") {
        throw new TranscriptionError(
          `Sarvam job failed: ${status.error_message ?? "Unknown error"}`,
          "sarvam",
          "JOB_FAILED",
        );
      }

      if (attempt % 6 === 0) {
        console.log(`Sarvam: Job ${jobId} status ${status.job_state} (attempt ${attempt})`);
      }
      await sleep(POLL_INTERVAL_MS);
    }

    throw new TranscriptionError(
      "Sarvam transcription timed out while waiting for batch job completion",
      "sarvam",
      "TIMEOUT",
    );
  }

  private parseResult(
    result: SarvamResultJson,
  ): Omit<TranscriptionResult, "provider" | "processingTimeMs"> {
    const segments: TranscriptionSegment[] =
      result.diarized_transcript?.entries?.map((entry) => ({
        start: entry.start_time_seconds ?? 0,
        end: entry.end_time_seconds ?? entry.start_time_seconds ?? 0,
        text: entry.transcript ?? "",
        speaker: entry.speaker_id ? `Speaker ${entry.speaker_id}` : undefined,
      })) ?? [];

    const words: TranscriptionWord[] = [];
    const ts = result.timestamps;
    if (ts?.words && ts.start_time_seconds && ts.end_time_seconds) {
      const count = Math.min(ts.words.length, ts.start_time_seconds.length, ts.end_time_seconds.length);
      for (let i = 0; i < count; i++) {
        const word = ts.words[i];
        const start = ts.start_time_seconds[i];
        const end = ts.end_time_seconds[i];
        if (word === undefined || start === undefined || end === undefined) continue;
        words.push({ word, start, end });
      }
    }

    const text =
      segments.length > 0
        ? segments.map((seg) => `${seg.speaker ?? "Speaker"}: ${seg.text}`).join("\n\n")
        : result.transcript ?? "";

    return {
      text,
      language: result.language_code ?? undefined,
      segments: segments.length > 0 ? segments : undefined,
      words: words.length > 0 ? words : undefined,
      srt: segments.length > 0 ? generateSrt(segments) : undefined,
    };
  }
}
