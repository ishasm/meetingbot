import { chromium } from "playwright-extra";
import { Browser, Page } from "playwright";
import {  PageVideoCapture } from "playwright-video";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { setTimeout } from "timers/promises";
import { BotConfig, EventCode, SpeakerTimeframe, WaitingRoomTimeoutError } from "../../src/types";
import { Bot } from "../../src/bot";
import * as fs from 'fs';
import path from "path";
import { ChildProcessWithoutNullStreams, spawn } from "child_process";

// Use Stealth Plugin to avoid detection
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete("iframe.contentWindow");
stealthPlugin.enabledEvasions.delete("media.codecs");
chromium.use(stealthPlugin);

// User Agent Constant -- set Feb 2025
const userAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";

// Constant Selectors
const enterNameField = 'input[type="text"][aria-label="Your name"]';
const askToJoinButton = '//button[.//span[text()="Ask to join"]]';
const joinNowButton = '//button[.//span[text()="Join now"]]';
const gotKickedDetector = '//button[.//span[text()="Return to home screen"]]';
const leaveButton = `//button[@aria-label="Leave call"]`;
const peopleButton = `//button[@aria-label="People"]`;
const onePersonRemainingField = '//span[.//div[text()="Contributors"]]//div[text()="1"]';
const muteButton = `[aria-label*="Turn off microphone"]`; // *= -> conatins
const cameraOffButton = `[aria-label*="Turn off camera"]`;

const infoPopupClick = `//button[.//span[text()="Got it"]]`;

// TODO: pass this in meeting info
const SCREEN_WIDTH = 1920;
const SCREEN_HEIGHT = 1080;

type Participant = {
  id: string;
  name: string;
  observer?: MutationObserver;
};

/**
 * @param amount Milliseconds
 * @returns Random Number within 10% of the amount given, mean at amount
 */
const randomDelay = (amount: number) =>
  (2 * Math.random() - 1) * (amount / 10) + amount;

/**
 * Ensure Typescript doesn't complain about the global exposed 
 * functions that will be setup in the bot.
 */
declare global {
  interface Window {
    saveChunk: (chunk: number[]) => void;
    stopRecording: () => void;

    getParticipants: () => Participant[];
    onParticipantJoin: (participant: Participant) => void;
    onParticipantLeave: (participant: Participant) => void;
    registerParticipantSpeaking: (participant: Participant) => void;
    observeSpeech: (node: any, participant: Participant) => void;
    handleMergedAudio: () => void;

    participantArray: Participant[];
    mergedAudioParticipantArray: Participant[];
    recorder: MediaRecorder | undefined;
  }
}

/**
 * Represents a bot that can join and interact with Google Meet meetings.
 * The bot is capable of joining meetings, performing actions, recording the meeting,
 * monitoring participants, and leaving the meeting based on specific conditions.
 * 
 * @class MeetsBot
 * @extends Bot
 * 
 * @property {string[]} browserArgs - Arguments passed to the browser instance.
 * @property {string} meetingURL - The URL of the Google Meet meeting to join.
 * @property {Browser} browser - The Playwright browser instance used by the bot.
 * @property {Page} page - The Playwright page instance used by the bot.
 * @property {PageVideoCapture | undefined} recorder - The video recorder instance for capturing the meeting.
 * @property {boolean} kicked - Indicates if the bot was kicked from the meeting.
 * @property {string} recordingPath - The file path where the meeting recording is saved.
 * @property {Buffer[]} recordBuffer - Buffer to store video chunks during recording.
 * @property {boolean} startedRecording - Indicates if the recording has started.
 * @property {number} timeAloneStarted - The timestamp when the bot was the only participant in the meeting.
 * @property {ChildProcessWithoutNullStreams | null} ffmpegProcess - The ffmpeg process used for recording.
 * 
 * @constructor
 * @param {BotConfig} botSettings - Configuration settings for the bot, including meeting information.
 * @param {(eventType: EventCode, data?: any) => Promise<void>} onEvent - Callback function to handle events.
 * 
 * @method run - Runs the bot to join the meeting and perform actions.
 * @returns {Promise<void>}
 * 
 * @method getRecordingPath - Retrieves the file path of the recording.
 * @returns {string} The path to the recording file.
 * 
 * @method getSpeakerTimeframes - Retrieves the timeframes of speakers in the meeting.
 * @returns {Array} An array of objects containing speaker names and their respective start and end times.
 * 
 * @method getContentType - Retrieves the content type of the recording file.
 * @returns {string} The content type of the recording file.
 * 
 * @method joinMeeting - Joins the Google Meet meeting and performs necessary setup.
 * @returns {Promise<number>} Returns 0 if the bot successfully joins the meeting, or throws an error if it fails.
 * 
 * @method startRecording - Starts recording the meeting using ffmpeg.
 * @returns {Promise<void>}
 * 
 * @method stopRecording - Stops the ongoing recording if it has been started.
 * @returns {Promise<number>} Returns 0 if the recording was successfully stopped.
 * 
 * @method meetingActions - Performs actions during the meeting, including monitoring participants and recording.
 * @returns {Promise<number>} Returns 0 when the bot finishes its meeting actions.
 * 
 * @method leaveMeeting - Stops the recording and leaves the meeting.
 * @returns {Promise<number>} Returns 0 if the bot successfully leaves the meeting.
 */
export class MeetsBot extends Bot {
  browserArgs: string[];
  meetingURL: string;
  browser!: Browser;
  page!: Page;
  recorder: PageVideoCapture | undefined;
  kicked: boolean = false;
  recordingPath: string;
  participants: Participant[] = [];

  // Memory-efficient speaker tracking using time ranges instead of individual timestamps
  // This prevents memory issues in long meetings (8-10+ hours)
  private speakerTimeRanges: Map<string, Array<{start: number, end: number}>> = new Map();
  private activeSpeakers: Map<string, { startTime: number, lastActivity: number }> = new Map();
  
  // Throttling: track last speaking event per participant to avoid flooding
  private lastSpeakingEventTime: Map<string, number> = new Map();
  private readonly SPEAKING_THROTTLE_MS = 300; // Minimum time between speaking events per participant
  private readonly SILENCE_TIMEOUT_MS = 2000; // Time of no activity to consider speaker stopped
  
  // Interval handles for cleanup
  private keepPanelOpenInterval?: NodeJS.Timeout;
  private speakerCheckInterval?: NodeJS.Timeout;
  private consolidationInterval?: NodeJS.Timeout;

  private startedRecording: boolean = false;

  private timeAloneStarted: number = Infinity;
  private lastActivity: number | undefined = undefined;
  private recordingStartedAt: number = 0;

  private ffmpegProcess: ChildProcessWithoutNullStreams | null;

  /**
   * 
   * @param botSettings Bot Settings as Passed in the API call.
   * @param onEvent Connection to Backend
   */
  constructor(
    botSettings: BotConfig,
    onEvent: (eventType: EventCode, data?: any) => Promise<void>
  ) {
    super(botSettings, onEvent);
    this.recordingPath = path.resolve(__dirname, "recording.mp4");

    this.browserArgs = [
      "--incognito",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-features=IsolateOrigins,site-per-process",
      "--disable-infobars",
      "--disable-gpu", //disable gpu rendering

      "--use-fake-ui-for-media-stream",// automatically grants screen sharing permissions without a selection dialog.
      "--use-file-for-fake-video-capture=/dev/null",
      // Note: Removed --use-file-for-fake-audio-capture to allow real audio capture
      // The browser needs to output audio to PulseAudio so FFmpeg can record it
      
      // Enable audio output in headless mode
      "--autoplay-policy=no-user-gesture-required", // Allow audio to play without user interaction
      "--disable-features=AudioServiceOutOfProcess", // Keep audio in main process for better capture
      
      '--auto-select-desktop-capture-source="Chrome"' // record the first tab automatically
    ];
    // Fetch
    this.meetingURL = botSettings.meetingInfo.meetingUrl!;
    this.kicked = false; // Flag for if the bot was kicked from the meeting, no need to click exit button.
    this.startedRecording = false; //Flag to not duplicate recording start

    this.ffmpegProcess = null;
  }

  /**
   * Run the bot to join the meeting and perform the meeting actions.
   */
  async run(): Promise<void> {
    await this.joinMeeting();
    await this.meetingActions();
  }

  /**
   * Gets a consistant video recording path
   * @returns {string} - Returns the path to the recording file.
   */
  getRecordingPath(): string {

    // Ensure the directory exists
    const dir = path.dirname(this.recordingPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Give Back the path
    return this.recordingPath;
  }

  /**
   * Gets the speaker timeframes.
   * Uses memory-efficient range-based storage that's safe for long meetings.
   * @returns {Array} - Returns an array of objects containing speaker names and their respective start and end times.
   */
  getSpeakerTimeframes(): SpeakerTimeframe[] {
    // Close any still-active speaking ranges
    const endTime = Date.now() - this.recordingStartedAt;
    this.activeSpeakers.forEach((state, speaker) => {
      this.endSpeakerRange(speaker, endTime);
    });
    
    // Final consolidation before returning
    this.consolidateRanges();
    
    // Convert to SpeakerTimeframe format
    const result: SpeakerTimeframe[] = [];
    
    this.speakerTimeRanges.forEach((ranges, speakerName) => {
      for (const range of ranges) {
        // Only include ranges longer than 500ms
        if (range.end - range.start > 500) {
          result.push({
            speakerName,
            start: range.start,
            end: range.end
          });
        }
      }
    });
    
    // Sort by start time
    result.sort((a, b) => a.start - b.start || a.end - b.end);
    
    // Log stats
    console.log(`[Speaker Detection] Generated ${result.length} timeframes for ${this.speakerTimeRanges.size} speakers`);
    this.speakerTimeRanges.forEach((ranges, speaker) => {
      const totalTime = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
      console.log(`  ${speaker}: ${ranges.length} ranges, ${Math.round(totalTime / 1000)}s total speaking time`);
    });
    
    return result;
  }

  /**
   * Start a new speaking range for a participant.
   * Called when we detect someone started speaking.
   */
  private startSpeakerRange(speakerName: string, timestamp: number) {
    if (this.activeSpeakers.has(speakerName)) {
      // Already speaking, just update last activity
      const state = this.activeSpeakers.get(speakerName)!;
      state.lastActivity = timestamp;
      return;
    }
    
    this.activeSpeakers.set(speakerName, { 
      startTime: timestamp, 
      lastActivity: timestamp 
    });
    console.log(`[Speaker] ${speakerName} started speaking at ${Math.round(timestamp / 1000)}s`);
  }

  /**
   * End the current speaking range for a participant.
   * Called when we detect someone stopped speaking.
   */
  private endSpeakerRange(speakerName: string, timestamp: number) {
    const state = this.activeSpeakers.get(speakerName);
    if (!state) {
      return; // Wasn't speaking
    }
    
    this.activeSpeakers.delete(speakerName);
    
    const duration = timestamp - state.startTime;
    // Only save if range is meaningful (>500ms)
    if (duration > 500) {
      if (!this.speakerTimeRanges.has(speakerName)) {
        this.speakerTimeRanges.set(speakerName, []);
      }
      this.speakerTimeRanges.get(speakerName)!.push({ 
        start: state.startTime, 
        end: timestamp 
      });
      console.log(`[Speaker] ${speakerName} stopped: ${Math.round(state.startTime / 1000)}s - ${Math.round(timestamp / 1000)}s (${Math.round(duration / 1000)}s)`);
    }
  }

  /**
   * Update speaker activity - called when we detect speaking activity.
   * Handles throttling and range management.
   */
  private updateSpeakerActivity(speakerName: string, timestamp: number) {
    // Log every speaking event (but not too often)
    const lastLogTime = this.lastSpeakingEventTime.get(`_log_${speakerName}`) || 0;
    if (timestamp - lastLogTime > 5000) { // Log at most every 5 seconds per speaker
      console.log(`[Speaker] Activity detected: ${speakerName} at ${Math.round(timestamp / 1000)}s`);
      this.lastSpeakingEventTime.set(`_log_${speakerName}`, timestamp);
    }
    
    // Throttle: ignore if we just processed an event for this speaker
    const lastEvent = this.lastSpeakingEventTime.get(speakerName) || 0;
    if (timestamp - lastEvent < this.SPEAKING_THROTTLE_MS) {
      // Just update the activity time for the active speaker
      const state = this.activeSpeakers.get(speakerName);
      if (state) {
        state.lastActivity = timestamp;
      }
      return;
    }
    
    this.lastSpeakingEventTime.set(speakerName, timestamp);
    this.startSpeakerRange(speakerName, timestamp);
  }

  /**
   * Check for speakers who have gone silent and end their ranges.
   * Should be called periodically (every second).
   */
  private checkForSilentSpeakers() {
    const now = Date.now() - this.recordingStartedAt;
    
    this.activeSpeakers.forEach((state, speaker) => {
      if (now - state.lastActivity > this.SILENCE_TIMEOUT_MS) {
        this.endSpeakerRange(speaker, state.lastActivity);
      }
    });
  }

  /**
   * Consolidate adjacent time ranges to save memory.
   * Merges ranges that are within 3 seconds of each other.
   */
  private consolidateRanges() {
    const MERGE_GAP_MS = 3000; // Merge ranges within 3 seconds
    
    this.speakerTimeRanges.forEach((ranges, speaker) => {
      if (ranges.length < 2) return;
      
      // Sort by start time
      ranges.sort((a, b) => a.start - b.start);
      
      // Merge adjacent ranges
      const merged: Array<{start: number, end: number}> = [];
      let current = ranges[0]!;
      
      for (let i = 1; i < ranges.length; i++) {
        const next = ranges[i]!;
        if (next.start - current.end < MERGE_GAP_MS) {
          // Merge: extend current range
          current = { start: current.start, end: Math.max(current.end, next.end) };
        } else {
          merged.push(current);
          current = next;
        }
      }
      merged.push(current);
      
      if (merged.length < ranges.length) {
        console.log(`[Consolidate] ${speaker}: ${ranges.length} → ${merged.length} ranges`);
        this.speakerTimeRanges.set(speaker, merged);
      }
    });
  }

  /**
   * Gets the video content type.
   * @returns {string} - Returns the content type of the recording file.
   */
  getContentType(): string {
    return "video/mp4";
  }

  /**
   * Launches the browser and opens a blank page.
   */
  async launchBrowser(headless: boolean = false) {

    // Launch Browser
    this.browser = await chromium.launch({
      headless,
      args: this.browserArgs,
    });

    // Unpack Dimensions
    const vp = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };

    // Create Browser Context
    const context = await this.browser.newContext({
      permissions: ["camera", "microphone"],
      userAgent: userAgent,
      viewport: vp
    });

    // Create Page, Go to
    this.page = await context.newPage();
    
    // Capture browser console logs for debugging
    this.page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      // Only log important messages to avoid spam
      if (type === 'error' || type === 'warning' || 
          text.includes('[Speaker') || text.includes('[DOM]') || 
          text.includes('[SpeechObserver]') || text.includes('Participant') ||
          text.includes('CRITICAL') || text.includes('✓') || text.includes('⚠️')) {
        console.log(`[Browser ${type}] ${text}`);
      }
    });
  }


  /**
   * Calls Launch Browser, then navigates to join the meeting.
   * @returns 0 on success, or throws an error if it fails to join the meeting.
   */
  async joinMeeting() {

    // Launch
    await this.launchBrowser();

    //
    await this.page.waitForTimeout(randomDelay(1000));

    // Inject anti-detection code using addInitScript
    await this.page.addInitScript(() => {

      // Disable navigator.webdriver to avoid detection
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });

      // Override navigator.plugins to simulate real plugins
      Object.defineProperty(navigator, "plugins", {
        get: () => [
          { name: "Chrome PDF Plugin" },
          { name: "Chrome PDF Viewer" },
        ],
      });

      // Override navigator.languages to simulate real languages
      Object.defineProperty(navigator, "languages", {
        get: () => ["en-US", "en"],
      });

      // Override other properties
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 4 }); // Fake number of CPU cores
      Object.defineProperty(navigator, "deviceMemory", { get: () => 8 }); // Fake memory size
      Object.defineProperty(window, "innerWidth", { get: () => SCREEN_WIDTH }); // Fake screen resolution
      Object.defineProperty(window, "innerHeight", { get: () => SCREEN_HEIGHT });
      Object.defineProperty(window, "outerWidth", { get: () => SCREEN_WIDTH });
      Object.defineProperty(window, "outerHeight", { get: () => SCREEN_HEIGHT });
    });

    //Define Bot Name
    const name = this.settings.botDisplayName || "MeetingBot";

    // Go to the meeting URL (Simulate Movement)
    await this.page.mouse.move(10, 672);
    await this.page.mouse.move(102, 872);
    await this.page.mouse.move(114, 1472);
    await this.page.waitForTimeout(300);
    await this.page.mouse.move(114, 100);
    await this.page.mouse.click(100, 100);

    //Go
    await this.page.goto(this.meetingURL, { waitUntil: "networkidle" });
    await this.page.bringToFront(); //ensure active

    console.log("Waiting for the input field to be visible...");
    await this.page.waitForSelector(enterNameField, { timeout: 15000 }); // If it can't find the enter name field in 15 seconds then something went wrong.

    console.log("Found it. Waiting for 1 second...");
    await this.page.waitForTimeout(randomDelay(1000));

    console.log("Filling the input field with the name...");
    await this.page.fill(enterNameField, name);

    console.log('Turning Off Camera and Microphone ...');
    try {
      await this.page.waitForTimeout(randomDelay(500));
      await this.page.click(muteButton, { timeout: 200 });
      await this.page.waitForTimeout(200);

    } catch (e) {
      console.log('Could not turn off Microphone, probably already off.');
    }
    try {
      await this.page.click(cameraOffButton, { timeout: 200 });
      await this.page.waitForTimeout(200);

    } catch (e) {
      console.log('Could not turn off Camera -- probably already off.');
    }

    console.log('Waiting for either the "Join now" or "Ask to join" button to appear...');
    const entryButton = await Promise.race([
      this.page.waitForSelector(joinNowButton, { timeout: 60000 }).then(() => joinNowButton),
      this.page.waitForSelector(askToJoinButton, { timeout: 60000 }).then(() => askToJoinButton),
    ]);

    await this.page.click(entryButton);

    //Should Exit after 1 Minute
    console.log("Awaiting Entry ....");
    const timeout = this.settings.automaticLeave.waitingRoomTimeout; // in milliseconds

    // wait for the leave button to appear (meaning we've joined the meeting)
    try {
      await this.page.waitForSelector(leaveButton, {
        timeout: timeout,
      });
    } catch (e) {
      // Timeout Error: Will get caught by bot/index.ts
      throw new WaitingRoomTimeoutError();
    }

    //Done. Log.
    console.log("Joined Call.");
    await this.onEvent(EventCode.JOINING_CALL);

    //Done.
    return 0;
  }

  /**
   * 
   */
  getFFmpegParams() {

    // For Testing (pnpm test) -- no docker x11 server running.
    if (!fs.existsSync('/tmp/.X11-unix')) {
      console.log('Using test ffmpeg params')
      return [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=blue:s=1280x720:r=30',
        '-video_size', '1280x720',
        '-preset', 'ultrafast',
        '-c:a', 'aac',
        '-c:v', 'libx264',
        this.getRecordingPath()
      ]
    }

    // Creait to @martinezpl for these ffmpeg params.
    console.log('Loading Dockerized FFMPEG Params ...')

    const videoInputFormat = "x11grab";
    const audioInputFormat = "pulse";
    const videoSource = ":99.0";
    // Use the monitor of the virtual speaker to capture browser audio
    // The monitor captures what's being played to the virtual speaker
    // Use index 1 or the full name with proper escaping
    const audioSource = "1"; // Use the PulseAudio source index
    const audioBitrate = "128k";
    const fps = "25";

    console.log(`Audio source: ${audioSource}`);

    return [
      '-v', 'verbose', // Verbose logging for debugging
      "-thread_queue_size", "512", // Increase thread queue size to handle input buffering
      "-video_size", `${SCREEN_WIDTH}x${SCREEN_HEIGHT}`, //full screen resolution
      "-framerate", fps, // Lower frame rate to reduce CPU usage
      "-f", videoInputFormat,
      "-i", videoSource,
      "-thread_queue_size", "512",
      "-f", audioInputFormat,
      "-i", audioSource,
      "-c:v", "libx264", // H.264 codec for browser compatibility
      "-pix_fmt", "yuv420p", // Ensures compatibility with most browsers
      "-preset", "veryfast", // Use a faster preset to reduce CPU usage
      "-crf", "28", // Increase CRF for reduced CPU usage
      "-c:a", "aac", // AAC codec for audio compatibility
      "-b:a", audioBitrate, // Lower audio bitrate for reduced CPU usage
      "-vsync", "2", // Synchronize video and audio
      "-vf", "scale=1280:720", // Ensure the video is scaled to 720p
      "-y", this.getRecordingPath(), // Output file path
    ];
  }

  /**
   * Starts the recording of the call using ffmpeg.
   *
   * This function initializes an ffmpeg process to capture the screen and audio of the meeting.
   * It ensures that only one recording process is active at a time and logs the status of the recording.
   * 
   * @returns {void}
   */
  async startRecording() {

    console.log('Attempting to start the recording ... @', this.getRecordingPath());
    if (this.ffmpegProcess) return console.log('Recording already started.');

    // Check and configure PulseAudio before starting recording
    try {
      const { execSync } = require('child_process');
      
      console.log('=== PulseAudio Diagnostics ===');
      
      // Check if PulseAudio is running
      try {
        const paStatus = execSync('pactl info 2>&1', { encoding: 'utf8' });
        console.log('PulseAudio is running');
        console.log('Server info:', paStatus.split('\n').slice(0, 5).join('\n'));
      } catch (err) {
        console.error('PulseAudio is not running! Starting it...');
        execSync('pulseaudio --start --exit-idle-time=-1 2>&1', { encoding: 'utf8' });
        await new Promise(r => setTimeout(r, 1000)); // Wait for PA to start
      }
      
      // List audio sources
      const paSources = execSync('pactl list sources short 2>&1', { encoding: 'utf8' });
      console.log('Available audio sources:');
      console.log(paSources);
      
      // List audio sinks (outputs)
      const paSinks = execSync('pactl list sinks short 2>&1', { encoding: 'utf8' });
      console.log('Available audio sinks:');
      console.log(paSinks);
      
      // Create a null sink and its monitor for capturing browser audio
      try {
        console.log('Creating null sink for audio capture...');
        execSync('pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description="Virtual_Speaker" 2>&1', { encoding: 'utf8' });
        console.log('Null sink created successfully');
        
        // Set it as default sink so browser outputs to it
        execSync('pactl set-default-sink virtual_speaker 2>&1', { encoding: 'utf8' });
        console.log('Set virtual_speaker as default sink');
      } catch (err) {
        console.log('Note: Could not create null sink (may already exist):', err);
      }
      
      // List sources again to see the monitor
      const paSourcesAfter = execSync('pactl list sources short 2>&1', { encoding: 'utf8' });
      console.log('Audio sources after null sink creation:');
      console.log(paSourcesAfter);
      
      console.log('=== End PulseAudio Diagnostics ===');
    } catch (err) {
      console.warn('Warning: Could not configure PulseAudio:', err);
    }

    this.ffmpegProcess = spawn('ffmpeg', this.getFFmpegParams());

    console.log('Spawned a subprocess to record: pid=', this.ffmpegProcess.pid);

    // Report any data / errors (DEBUG, since it also prints that data is available).
    this.ffmpegProcess.stderr.on('data', (data) => {
      // console.error(`ffmpeg: ${data}`);

      // Log that we got data, and the recording started.
      if (!this.startedRecording) {
        console.log('Recording Started.');
        this.startedRecording = true;
        // Set the recording start timestamp for speaker timeframe calculation
        this.recordingStartedAt = Date.now();
        console.log(`Recording started at timestamp: ${this.recordingStartedAt}`);
      }
    });

    // Log Output of stderr - ALWAYS log for audio debugging
    // Store stderr output for debugging
    let stderrBuffer = '';
    this.ffmpegProcess.stderr.on('data', (data) => {
      const text = data.toString();
      stderrBuffer += text;
      
      // Log important messages
      if (text.includes('error') || text.includes('Error') || text.includes('Invalid') || 
          text.includes('failed') || text.includes('Failed')) {
        console.error(`ffmpeg stderr: ${text}`);
      }
      
      // Log audio stream info
      if (text.includes('Audio:') || text.includes('Stream #')) {
        console.log(`ffmpeg: ${text.trim()}`);
      }
    });

    // Report when the process exits
    this.ffmpegProcess.on('exit', (code) => {
      console.log(`ffmpeg exited with code ${code}`);
      if (code !== 0 && code !== null) {
        console.error(`FFmpeg failed! Last 2000 chars of stderr:\n${stderrBuffer.slice(-2000)}`);
      }
      this.ffmpegProcess = null;
    });

    console.log('Started FFMPEG Process.')
  }

  /**
   * Stops the ongoing recording if it has been started.
   * 
   * This function ensures that the recording process is terminated. It checks if the `ffmpegProcess`
   * exists and, if so, sends a termination signal to stop the recording. If no recording process
   * is active, it logs a message indicating that no recording was in progress.
   * 
   * @returns {Promise<number>} - Returns 0 if the recording was successfully stopped.
   */
  async stopRecording() {

    console.log('Attempting to stop the recording ...');

    // Await encoding result
    const promiseResult = await new Promise((resolve) => {

      // No recording
      if (!this.ffmpegProcess) {
        console.log('No recording in progress, cannot end recording.');
        resolve(1);
        return; // exit early
      }

      // Graceful stop
      console.log('Killing ffmpeg process gracefully ...');
      this.ffmpegProcess.kill('SIGINT'); 
      console.log('Waiting for ffmpeg to finish encoding ...');

      // Modify the exit handler to resolve the promise.
      // This will be called when the video is done encoding
      this.ffmpegProcess.on('exit', (code, signal) => {
        if (code === 0) {
          console.log('Recording stopped and file finalized.');
          resolve(0);
        } else {
          console.error(`FFmpeg exited with code ${code}${signal ? ` and signal ${signal}` : ''}`);
          resolve(1);
        }
      });
  
      // Modify the error handler to resolve the promise.
      this.ffmpegProcess.on('error', (err) => {
        console.error('Error while stopping ffmpeg:', err);
        resolve(1);
      });
    });

    // Continue
    return promiseResult;
  }

  async screenshot(fName: string = 'screenshot.png') {
    try {
      if (!this.page) throw new Error("Page not initialized");
      if (!this.browser) throw new Error("Browser not initialized");

      const screenshot = await this.page.screenshot({
        type: "png",
      });
      
      // Save the screenshot to a file
      const screenshotPath = path.resolve(`/tmp/${fName}`);
      fs.writeFileSync(screenshotPath, screenshot);
      console.log(`Screenshot saved to ${screenshotPath}`);
    } catch (error) {
      console.log('Error taking screenshot:', error);
    }
  }

  /**
   * Check if we got kicked from the meeting.
   * 
   */
  async checkKicked() {

    // Check if "Return to Home Page" button exists (Kick Condition 1)
    if (await this.page.locator(gotKickedDetector).count().catch(() => 0) > 0) {
      return true;
    }

    // console.log('Checking for hidden leave button ...')
    // Hidden Leave Button (Kick Condition 2)
    if (await this.page.locator(leaveButton).isHidden({ timeout: 500 }).catch(() => true)) {
      return true;
    }

    // console.log('Checking for removed from meeting text ...')
    // Removed from Meeting Text (Kick Condition 3)
    if (await this.page.locator('text="You\'ve been removed from the meeting"').isVisible({ timeout: 500 }).catch(() => false)) {
      return true;
    }

    // Did not get kicked if reached here.
    return false;
  }

  /**
   * Check if a pop-up appeared. If so, close it.
   */
  async handleInfoPopup(timeout = 5000) {
    try {
      await this.page.waitForSelector(infoPopupClick, { timeout });
    } catch (e) {
      return;
    }
    console.log("Clicking the popup...");
    await this.page.click(infoPopupClick);
  }

  /**
   * 
   * Meeting actions of the bot.
   * 
   * This function performs the actions that the bot is supposed to do in the meeting.
   * It first waits for the people button to be visible, then clicks on it to open the people panel.
   * It then starts recording the meeting and sets up participant monitoring.
   *  
   * Afterwards, It enters a simple loop that checks for end meeting conditions every X seconds.
   * Once detected it's done, it stops the recording and exits.
   * 
   * @returns 0
   */
  async meetingActions() {

    // Start Recording, Yes by default
    console.log("Starting Recording");
    this.startRecording();

    console.log("Waiting for the 'Others might see you differently' popup...");
    await this.handleInfoPopup();

    // Try to open the participants panel - multiple attempts with proper waiting
    // TESTED: The People button in Google Meet is a div[role="button"] in the top-right corner
    // with text containing "People" and a participant count
    let panelOpened = false;
    const maxAttempts = 5;
    
    for (let attempt = 1; attempt <= maxAttempts && !panelOpened; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxAttempts}: Opening participants panel...`);
        
        // TESTED AND WORKING: Find People button using div[role="button"] with text "People"
        const clickResult = await this.page.evaluate(`(function() {
          var result = { clicked: false, method: '' };
          
          // Method 1 (TESTED): div[role="button"] with aria-haspopup="dialog" containing "People" text
          var roleButtons = document.querySelectorAll('div[role="button"]');
          for (var i = 0; i < roleButtons.length; i++) {
            var btn = roleButtons[i];
            var text = (btn.textContent || '').toLowerCase();
            if (text.indexOf('people') >= 0) {
              btn.click();
              result.clicked = true;
              result.method = 'div[role="button"] with People text';
              return result;
            }
          }
          
          // Method 2: div[role="button"] with aria-haspopup="dialog"
          var dialogButtons = document.querySelectorAll('div[role="button"][aria-haspopup="dialog"]');
          for (var j = 0; j < dialogButtons.length; j++) {
            var btn = dialogButtons[j];
            var text = (btn.textContent || '').toLowerCase();
            // Look for participant count pattern (e.g., "People2" or just numbers)
            if (text.indexOf('people') >= 0 || /\\d+/.test(text)) {
              btn.click();
              result.clicked = true;
              result.method = 'div[role="button"][aria-haspopup="dialog"]';
              return result;
            }
          }
          
          // Method 3: Traditional button element fallback
          var buttons = document.querySelectorAll('button');
          for (var k = 0; k < buttons.length; k++) {
            var label = (buttons[k].getAttribute('aria-label') || '').toLowerCase();
            if (label.indexOf('people') >= 0 || label.indexOf('participant') >= 0) {
              buttons[k].click();
              result.clicked = true;
              result.method = 'button with aria-label';
              return result;
            }
          }
          
          // Method 4: Icon with text "people" or "group" 
          var icons = document.querySelectorAll('i');
          for (var m = 0; m < icons.length; m++) {
            var txt = (icons[m].textContent || '').trim().toLowerCase();
            if (txt === 'people' || txt === 'group' || txt === 'groups') {
              var parentBtn = icons[m].closest('button') || icons[m].closest('[role="button"]');
              if (parentBtn) {
                parentBtn.click();
                result.clicked = true;
                result.method = 'icon "' + txt + '"';
                return result;
              }
            }
          }
          
          return result;
        })()`);
        
        if (clickResult.clicked) {
          console.log(`  ✓ Clicked via ${clickResult.method}`);
        } else {
          console.log("  ✗ No People button found");
        }
        
        // Wait for panel to appear
        console.log("  Waiting for participants panel to appear...");
        await this.page.waitForTimeout(2000);
        
        // Verify the panel is actually open
        panelOpened = await this.page.evaluate(`(function() {
          // Check for participants list
          var participantsList = document.querySelector('[role="list"][aria-label="Participants"]');
          if (participantsList && participantsList.offsetParent !== null) {
            console.log("[DEBUG] Panel open - found [aria-label='Participants']");
            return true;
          }
          
          // Check for any list with role="listitem" and data-participant-id children
          var allLists = document.querySelectorAll('[role="list"]');
          for (var i = 0; i < allLists.length; i++) {
            var items = allLists[i].querySelectorAll('[role="listitem"][data-participant-id]');
            if (items.length > 0 && allLists[i].offsetParent !== null) {
              console.log("[DEBUG] Panel open - found list with " + items.length + " participants");
              return true;
            }
          }
          
          return false;
        })()`);
        
        if (panelOpened) {
          console.log("  ✓ Participants panel confirmed open!");
          break;
        } else {
          console.log("  ✗ Panel not open yet, retrying...");
        }
      } catch (error) {
        console.log(`  ✗ Attempt ${attempt} failed:`, error.message);
      }
    }
    
    if (!panelOpened) {
      console.error("⚠️ Could not open participants panel after", maxAttempts, "attempts");
      console.error("⚠️ Speaker detection will not work!");
    } else {
      console.log("✅ Participants panel is open and ready");
    }

    await this.page.exposeFunction("getParticipants", () => {
      return this.participants;
    });

    await this.page.exposeFunction(
      "onParticipantJoin",
      async (participant: Participant) => {
        this.participants.push(participant);
        await this.onEvent(EventCode.PARTICIPANT_JOIN, participant);
      }
    );

    await this.page.exposeFunction(
      "onParticipantLeave",
      async (participant: Participant) => {
        await this.onEvent(EventCode.PARTICIPANT_LEAVE, participant);
        this.participants = this.participants.filter(
          (p) => p.id !== participant.id
        );
        this.timeAloneStarted =
          this.participants.length === 1 ? Date.now() : Infinity;
      }
    );

    await this.page.exposeFunction(
      "registerParticipantSpeaking",
      (participant: Participant) => {
        this.lastActivity = Date.now();
        const relativeTimestamp = Date.now() - this.recordingStartedAt;
        
        // Use memory-efficient range-based tracking with throttling
        this.updateSpeakerActivity(participant.name, relativeTimestamp);
      }
    );

    // Add mutation observer for participant list
    // TESTED AND VERIFIED GENERIC APPROACH:
    // - Uses role="list" and aria-label="Participants" (standard ARIA)
    // - Uses role="listitem" with data-participant-id (standard + data attribute)
    // - Speaking detection: A div with exactly 3 child divs becomes VISIBLE when speaking
    //   This is a universal pattern - the audio visualizer has 3 bars and shows when active
    
    // CRITICAL: Wait longer for the panel to fully load
    // The panel needs time to render after being clicked
    console.log("Waiting for participants panel to fully load...");
    await this.page.waitForTimeout(3000);
    
    const participantsListFound = await this.page.evaluate(`(function() {
      console.log("[Speaker] === Starting participant detection setup ===");
      
      // Step 1: Find all lists and log them
      var allLists = document.querySelectorAll('[role="list"]');
      console.log("[Speaker] Total lists with role='list':", allLists.length);
      
      for (var j = 0; j < allLists.length; j++) {
        var list = allLists[j];
        var label = list.getAttribute('aria-label');
        var visible = list.offsetParent !== null;
        var itemsCount = list.querySelectorAll('[role="listitem"]').length;
        console.log("[Speaker]   List " + j + ": aria-label='" + label + "', visible=" + visible + ", items=" + itemsCount);
      }
      
      // Step 2: Try to find participants list
      var peopleList = null;
      
      // Try exact match first
      peopleList = document.querySelector('[role="list"][aria-label="Participants"]');
      if (peopleList) {
        console.log("[Speaker] ✓ Found via [aria-label='Participants']");
      }
      
      // Try jsname
      if (!peopleList) {
        peopleList = document.querySelector('[jsname="jrQDbd"]');
        if (peopleList) {
          console.log("[Speaker] ✓ Found via [jsname='jrQDbd']");
        }
      }
      
      // Try finding by looking for list with participant children
      if (!peopleList) {
        console.log("[Speaker] Searching for list containing participant items...");
        for (var k = 0; k < allLists.length; k++) {
          var items = allLists[k].querySelectorAll('[role="listitem"][data-participant-id]');
          if (items.length > 0) {
            console.log("[Speaker] ✓ Found list with " + items.length + " participant items!");
            peopleList = allLists[k];
            break;
          }
        }
      }
      
      if (!peopleList) {
        console.error("[Speaker] ✗ FAILED to find participants list");
        console.error("[Speaker] This means speaker tracking will NOT work");
        return false;
      }
      
      console.log("[Speaker] ✓ Successfully found participants list");

      window.participantArray = [];
      window.speakingState = {};

      // TESTED AND VERIFIED GENERIC DETECTION:
      // The speaking indicator is a div with exactly 3 EMPTY child divs (audio wave bars)
      // When speaking: display = "flex", When silent: display = "none"
      // This is fully generic - no class names used
      function findSpeakingIndicator(participantNode) {
        var allDivs = participantNode.querySelectorAll('div');
        for (var i = 0; i < allDivs.length; i++) {
          var div = allDivs[i];
          var children = div.children;
          if (children.length === 3) {
            // Check if all 3 children are empty divs
            var allEmptyDivs = true;
            for (var j = 0; j < children.length; j++) {
              if (children[j].tagName !== 'DIV' || children[j].textContent.trim() !== '') {
                allEmptyDivs = false;
                break;
              }
            }
            if (allEmptyDivs) {
              return div;
            }
          }
        }
        return null;
      }
      
      function isSpeakingIndicatorActive(participantNode) {
        var indicator = findSpeakingIndicator(participantNode);
        if (!indicator) return false;
        var style = window.getComputedStyle(indicator);
        // Speaking when display is NOT "none" (i.e., "flex" or "block")
        return style.display !== 'none';
      }

      // Speech observer with debouncing
      window.observeSpeech = function(participantNode, participant) {
        console.log("[Speaker] Setting up observer for:", participant.name);
        
        // Initialize state
        window.speakingState[participant.id] = { 
          isSpeaking: false, 
          lastUpdate: 0,
          debounceMs: 300
        };
        
        var activityObserver = new MutationObserver(function(mutations) {
          var now = Date.now();
          var state = window.speakingState[participant.id];
          if (!state) return;
          
          // Debounce
          if (now - state.lastUpdate < state.debounceMs) return;
          
          var speaking = isSpeakingIndicatorActive(participantNode);
          
          if (speaking && !state.isSpeaking) {
            state.isSpeaking = true;
            state.lastUpdate = now;
            console.log("[Speaker] Started:", participant.name);
            window.registerParticipantSpeaking(participant);
          } else if (speaking && state.isSpeaking) {
            state.lastUpdate = now;
            window.registerParticipantSpeaking(participant);
          } else if (!speaking && state.isSpeaking) {
            state.isSpeaking = false;
            console.log("[Speaker] Stopped:", participant.name);
          }
        });
        
        // Watch entire participant node for changes
        activityObserver.observe(participantNode, {
          attributes: true,
          subtree: true,
          childList: true,
          attributeFilter: ["class", "style"]
        });
        
        participant.observer = activityObserver;
      };

      // Polling fallback every 300ms - very reliable
      setInterval(function() {
        if (!window.participantArray || window.participantArray.length === 0) return;
        
        for (var i = 0; i < window.participantArray.length; i++) {
          var participant = window.participantArray[i];
          var state = window.speakingState[participant.id];
          if (!state) continue;
          
          var now = Date.now();
          if (now - state.lastUpdate < state.debounceMs) continue;
          
          var participantNode = document.querySelector('[role="listitem"][data-participant-id="' + participant.id + '"]');
          if (!participantNode) continue;
          
          var speaking = isSpeakingIndicatorActive(participantNode);
          
          if (speaking && !state.isSpeaking) {
            state.isSpeaking = true;
            state.lastUpdate = now;
            console.log("[Speaker] Poll: Started -", participant.name);
            window.registerParticipantSpeaking(participant);
          } else if (speaking && state.isSpeaking) {
            state.lastUpdate = now;
            window.registerParticipantSpeaking(participant);
          } else if (!speaking && state.isSpeaking) {
            state.isSpeaking = false;
            console.log("[Speaker] Poll: Stopped -", participant.name);
          }
        }
      }, 300);

      // Get all participant items
      var participantItems = peopleList.querySelectorAll('[role="listitem"][data-participant-id]');
      console.log("[Speaker] Found " + participantItems.length + " participants");

      // Process initial participants
      for (var idx = 0; idx < participantItems.length; idx++) {
        var node = participantItems[idx];
        var participantId = node.getAttribute("data-participant-id");
        var participantName = node.getAttribute("aria-label");
        
        if (!participantId || !participantName) continue;
        if (participantName.toLowerCase() === "merged audio") continue;
        
        var participant = {
          id: participantId,
          name: participantName
        };
        
        console.log("[Speaker] Tracking:", participantName);
        window.onParticipantJoin(participant);
        window.observeSpeech(node, participant);
        window.participantArray.push(participant);
      }

      // Observer for join/leave events
      var peopleObserver = new MutationObserver(function(mutations) {
        for (var mIdx = 0; mIdx < mutations.length; mIdx++) {
          var mutation = mutations[mIdx];
          
          // Handle added nodes
          for (var aIdx = 0; aIdx < mutation.addedNodes.length; aIdx++) {
            var addedNode = mutation.addedNodes[aIdx];
            if (!addedNode.getAttribute) continue;
            
            var participantId = addedNode.getAttribute("data-participant-id");
            var participantName = addedNode.getAttribute("aria-label");
            
            if (participantId && participantName && participantName.toLowerCase() !== "merged audio") {
              var exists = window.participantArray.find(function(p) { return p.id === participantId; });
              if (!exists) {
                console.log("[Speaker] Joined:", participantName);
                var newParticipant = { id: participantId, name: participantName };
                window.onParticipantJoin(newParticipant);
                window.observeSpeech(addedNode, newParticipant);
                window.participantArray.push(newParticipant);
              }
            }
          }
          
          // Handle removed nodes
          for (var rIdx = 0; rIdx < mutation.removedNodes.length; rIdx++) {
            var removedNode = mutation.removedNodes[rIdx];
            if (!removedNode.getAttribute) continue;
            
            var removedId = removedNode.getAttribute("data-participant-id");
            if (removedId) {
              var existing = window.participantArray.find(function(p) { return p.id === removedId; });
              if (existing) {
                console.log("[Speaker] Left:", existing.name);
                window.onParticipantLeave({ id: removedId, name: existing.name });
                window.participantArray = window.participantArray.filter(function(p) { return p.id !== removedId; });
                delete window.speakingState[removedId];
              }
            }
          }
        }
      });

      peopleObserver.observe(peopleList, { childList: true, subtree: true });
      
      console.log("[Speaker] ✓ Initialized with " + window.participantArray.length + " participants");
      return true;
    })()`);


    if (!participantsListFound) {
      console.error("⚠️ FAILED TO SET UP PARTICIPANT TRACKING");
      console.error("⚠️ Speaker names will appear as A, B, C in transcription");
    } else {
      console.log("✓ Participant tracking set up successfully!");
    }

    // Set up interval to keep participants panel open
    // Google Meet sometimes closes the panel, which breaks speaker detection
    this.keepPanelOpenInterval = setInterval(async () => {
      try {
        const panelOpen = await this.page.evaluate(`(function() {
          // Check if participants list is visible
          var selectors = [
            '[role="list"][aria-label="Participants"]',
            '[aria-label="Participants"]',
            '[jsname="jrQDbd"]'
          ];
          for (var i = 0; i < selectors.length; i++) {
            var selector = selectors[i];
            var el = document.querySelector(selector);
            if (el && el.offsetParent !== null) {
              return true;
            }
          }
          return false;
        })()`);
        
        if (!panelOpen) {
          console.log('[DOM] Participants panel closed, attempting to reopen...');
          
          // Try multiple strategies to reopen
          let reopened = false;
          
          // Strategy 1: Click by aria-label
          try {
            await this.page.click('//button[@aria-label="People"]', { timeout: 1000 });
            reopened = true;
          } catch (e) {
            // Try next strategy
          }
          
          // Strategy 2: Find by icon
          if (!reopened) {
            try {
              await this.page.evaluate(`(function() {
                var peopleIcon = Array.from(document.querySelectorAll('i')).find(
                  function(el) { return el.textContent && el.textContent.trim() === 'people'; }
                );
                if (peopleIcon) {
                  var button = peopleIcon.closest('button');
                  if (button) {
                    button.click();
                    return true;
                  }
                }
                return false;
              })()`);
            } catch (e) {
              // Failed to reopen
            }
          }
        }
      } catch (e) {
        // Page might be navigating, ignore
      }
    }, 10000); // Check every 10 seconds

    // Set up interval to check for speakers who stopped speaking
    this.speakerCheckInterval = setInterval(() => {
      this.checkForSilentSpeakers();
    }, 1000); // Check every second

    // Set up interval for periodic consolidation (memory management for long meetings)
    this.consolidationInterval = setInterval(() => {
      this.consolidateRanges();
      
      // Log memory stats
      let totalRanges = 0;
      this.speakerTimeRanges.forEach((ranges) => {
        totalRanges += ranges.length;
      });
      console.log(`[Memory] ${this.speakerTimeRanges.size} speakers, ${totalRanges} total ranges, ${this.activeSpeakers.size} currently speaking`);
    }, 5 * 60 * 1000); // Every 5 minutes

    // Loop -- check for end meeting conditions every second
    console.log("Waiting until a leave condition is fulfilled..");
    while (true) {

      // Check if it's only me in the meeting
      if (this.participants.length === 1) {

        const leaveMs = this.settings?.automaticLeave?.everyoneLeftTimeout ?? 30000; // Default to 30 seconds if not set
        const msDiff = Date.now() - this.timeAloneStarted;
        console.log(`Only me left in the meeting. Waiting for timeout time to have allocated (${msDiff / 1000} / ${leaveMs / 1000}s) ...`);

        if (msDiff > leaveMs) {
          console.log('Only one participant remaining for more than alocated time, leaving the meeting.');
          break;
        }
      }

      // Got kicked -- no longer in the meeting
      // Check each of the potentials conditions
      if (await this.checkKicked()) {

        console.log('Detected that we were kicked from the meeting.');
        this.kicked = true; //store
        break; //exit loop

      }

      // Check if there has been no activity, case for when only bots stay in the meeting
      if (
        this.participants.length > 1 &&
        this.lastActivity &&
        Date.now() - this.lastActivity > this.settings.automaticLeave.inactivityTimeout
      ) {
        console.log("No Activity for 5 minutes");
        break;
      }

      await this.handleInfoPopup(1000);

      // Reset Loop
      console.log('Waiting 5 seconds.')
      await setTimeout(5000); //5 second loop
    }

    //
    // Exit
    console.log("Starting End Life Actions ...");

    try {
      await this.leaveMeeting();
      return 0;
    } catch (e) {
      await this.endLife();
      return 1;
    }
  }

  /** 
   * Clean up the meeting
   */
  async endLife() {
    // Clear all intervals
    if (this.keepPanelOpenInterval) {
      clearInterval(this.keepPanelOpenInterval);
      this.keepPanelOpenInterval = undefined;
    }
    if (this.speakerCheckInterval) {
      clearInterval(this.speakerCheckInterval);
      this.speakerCheckInterval = undefined;
    }
    if (this.consolidationInterval) {
      clearInterval(this.consolidationInterval);
      this.consolidationInterval = undefined;
    }

    // Close any active speaker ranges before ending
    const endTime = Date.now() - this.recordingStartedAt;
    this.activeSpeakers.forEach((state, speaker) => {
      this.endSpeakerRange(speaker, endTime);
    });
    
    // Final consolidation
    this.consolidateRanges();

    // Log final speaker stats
    console.log('[Speaker Detection] Final stats:');
    let totalRanges = 0;
    this.speakerTimeRanges.forEach((ranges, speaker) => {
      totalRanges += ranges.length;
      const totalTime = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
      console.log(`  ${speaker}: ${ranges.length} ranges, ${Math.round(totalTime / 1000)}s total`);
    });
    console.log(`  Total: ${totalRanges} ranges across ${this.speakerTimeRanges.size} speakers`);

    // Ensure Recording is done
    console.log('Stopping Recording ...')
    await this.stopRecording();
    console.log('Done.')

    // Close my browser
    if (this.browser) {
      await this.browser.close();
      console.log("Closed Browser.");
    }

  }

  /**
   * 
   * Attempts to leave the meeting -- then cleans up.
   * 
   * @returns {Promise<number>} - Returns 0 if the bot successfully leaves the meeting, or 1 if it fails to leave the meeting.
   */
  async leaveMeeting() {

    // Try and Find the leave button, press. Otherwise, just delete the browser.
    console.log("Trying to leave the call ...")
    try {
      await this.page.click(leaveButton, { timeout: 1000 }); //Short Attempt
      console.log('Left Call.');
    } catch (e) {
      console.log('Attempted to Leave Call - couldn\'t (probably aleready left).')
    }

    console.log('Ending Life ...');
    await this.endLife();
    return 0;
  }
}
