import { Readable, PassThrough } from "stream";
import { spawn, type ChildProcess } from "child_process";

/**
 * Options for audio extraction
 */
export interface AudioExtractionOptions {
  /** Audio sample rate in Hz (default: 16000) */
  sampleRate?: number;
  /** Number of audio channels (default: 1 for mono) */
  channels?: number;
  /** Audio bitrate (default: "64k") */
  bitrate?: string;
  /** Output format (default: "mp3") */
  format?: "mp3" | "wav" | "ogg";
}

const DEFAULT_OPTIONS: Required<AudioExtractionOptions> = {
  sampleRate: 16000,
  channels: 1,
  bitrate: "64k",
  format: "mp3",
};

/**
 * Extracts and converts audio from a video buffer to an optimized audio buffer.
 * Uses streaming to handle large files (1-10 hour meetings) memory-efficiently.
 *
 * @param videoBuffer - The input video buffer (MP4 or other FFmpeg-supported format)
 * @param options - Optional configuration for audio output
 * @returns Promise resolving to the extracted audio as a Buffer
 *
 * @example
 * ```ts
 * // Download video from S3
 * const response = await fetch(s3SignedUrl);
 * const videoBuffer = Buffer.from(await response.arrayBuffer());
 *
 * // Extract audio optimized for transcription
 * const audioBuffer = await extractAudioFromVideo(videoBuffer, {
 *   sampleRate: 16000,
 *   channels: 1,
 *   bitrate: "64k",
 *   format: "mp3"
 * });
 *
 * // Send to transcription API
 * const transcription = await openai.audio.transcriptions.create({
 *   file: new File([audioBuffer], "audio.mp3", { type: "audio/mpeg" }),
 *   model: "whisper-1"
 * });
 * ```
 */
export async function extractAudioFromVideo(
  videoBuffer: Buffer,
  options: AudioExtractionOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    // Build FFmpeg arguments for audio extraction
    const ffmpegArgs = buildFFmpegArgs(opts);

    // Spawn FFmpeg process
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    // Handle stdout (audio output)
    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    // Handle stderr (FFmpeg logs/progress)
    let stderrOutput = "";
    ffmpeg.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    // Handle process completion
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}. stderr: ${stderrOutput.slice(-1000)}`
          )
        );
      }
    });

    // Handle process errors
    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });

    // Write video buffer to stdin
    ffmpeg.stdin.on("error", (err) => {
      // Ignore EPIPE errors (FFmpeg may close stdin early if it doesn't need more data)
      if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
        reject(new Error(`FFmpeg stdin error: ${err.message}`));
      }
    });

    ffmpeg.stdin.write(videoBuffer);
    ffmpeg.stdin.end();
  });
}

/**
 * Extracts audio from a video stream, useful for processing very large files
 * without loading the entire file into memory.
 *
 * @param videoStream - Readable stream of the input video
 * @param options - Optional configuration for audio output
 * @returns Readable stream of the extracted audio
 *
 * @example
 * ```ts
 * // Stream video from S3
 * const s3Response = await s3Client.send(new GetObjectCommand({ Bucket, Key }));
 * const videoStream = s3Response.Body as Readable;
 *
 * // Extract audio as stream
 * const audioStream = extractAudioFromVideoStream(videoStream, {
 *   sampleRate: 16000,
 *   channels: 1,
 *   format: "mp3"
 * });
 *
 * // Collect to buffer when needed
 * const audioBuffer = await streamToBuffer(audioStream);
 * ```
 */
export function extractAudioFromVideoStream(
  videoStream: Readable,
  options: AudioExtractionOptions = {}
): Readable {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const ffmpegArgs = buildFFmpegArgs(opts);

  const ffmpeg = spawn("ffmpeg", ffmpegArgs);
  const outputStream = new PassThrough();

  // Pipe video stream to FFmpeg stdin
  videoStream.pipe(ffmpeg.stdin);

  // Pipe FFmpeg stdout to output stream
  ffmpeg.stdout.pipe(outputStream);

  // Handle errors
  ffmpeg.stderr.on("data", () => {
    // Suppress FFmpeg progress output, but keep process running
  });

  ffmpeg.on("error", (err) => {
    outputStream.destroy(new Error(`FFmpeg error: ${err.message}`));
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      outputStream.destroy(new Error(`FFmpeg exited with code ${code}`));
    }
  });

  // Handle stream errors
  videoStream.on("error", (err) => {
    ffmpeg.kill();
    outputStream.destroy(err);
  });

  ffmpeg.stdin.on("error", (err) => {
    if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
      outputStream.destroy(err);
    }
  });

  return outputStream;
}

/**
 * Downloads video from a URL and extracts audio.
 * Optimized for S3 signed URLs or any HTTP(S) video source.
 *
 * @param url - URL to the video file
 * @param options - Optional configuration for audio output
 * @returns Promise resolving to the extracted audio as a Buffer
 *
 * @example
 * ```ts
 * const signedUrl = await generateSignedUrl(recordingKey);
 * const audioBuffer = await extractAudioFromUrl(signedUrl);
 * ```
 */
export async function extractAudioFromUrl(
  url: string,
  options: AudioExtractionOptions = {}
): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
  }

  const videoBuffer = Buffer.from(await response.arrayBuffer());
  return extractAudioFromVideo(videoBuffer, options);
}

/**
 * Downloads video from a URL and extracts audio using streaming.
 * More memory-efficient for very large files.
 *
 * @param url - URL to the video file
 * @param options - Optional configuration for audio output
 * @returns Promise resolving to the extracted audio as a Buffer
 */
export async function extractAudioFromUrlStreaming(
  url: string,
  options: AudioExtractionOptions = {}
): Promise<Buffer> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return new Promise((resolve, reject) => {
    // Use FFmpeg's native URL handling for efficient streaming
    const ffmpegArgs = [
      "-i", url,
      "-vn",
      "-acodec", getCodecForFormat(opts.format),
      "-ar", opts.sampleRate.toString(),
      "-ac", opts.channels.toString(),
      "-b:a", opts.bitrate,
      "-f", opts.format,
      "pipe:1",
    ];

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    const chunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    let stderrOutput = "";
    ffmpeg.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(
          new Error(
            `FFmpeg exited with code ${code}. stderr: ${stderrOutput.slice(-1000)}`
          )
        );
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Converts a readable stream to a buffer.
 * Utility function for working with streaming audio extraction.
 *
 * @param stream - Readable stream to convert
 * @returns Promise resolving to the complete buffer
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * Gets audio duration from a video or audio buffer.
 * Useful for validation or progress tracking.
 *
 * @param buffer - The input media buffer
 * @returns Promise resolving to duration in seconds
 */
export async function getMediaDuration(buffer: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      "-i", "pipe:0",
    ]);

    let output = "";
    let stderrOutput = "";

    ffprobe.stdout.on("data", (data: Buffer) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data: Buffer) => {
      stderrOutput += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
          reject(new Error("Could not parse duration from ffprobe output"));
        } else {
          resolve(duration);
        }
      } else {
        reject(new Error(`ffprobe exited with code ${code}: ${stderrOutput}`));
      }
    });

    ffprobe.on("error", (err) => {
      reject(new Error(`Failed to spawn ffprobe: ${err.message}`));
    });

    ffprobe.stdin.write(buffer);
    ffprobe.stdin.end();
  });
}

/**
 * Checks if FFmpeg is available on the system.
 * Useful for graceful degradation or error messages.
 *
 * @returns Promise resolving to true if FFmpeg is available
 */
export async function isFFmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", ["-version"]);

    ffmpeg.on("close", (code) => {
      resolve(code === 0);
    });

    ffmpeg.on("error", () => {
      resolve(false);
    });
  });
}

/**
 * Creates a File object from an audio buffer for use with APIs like OpenAI.
 *
 * @param buffer - The audio buffer
 * @param format - The audio format (default: "mp3")
 * @returns File object suitable for API uploads
 */
export function createAudioFile(
  buffer: Buffer,
  format: "mp3" | "wav" | "ogg" = "mp3"
): File {
  const mimeTypes: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
  };

  const filename = `audio.${format}`;
  const mimeType = mimeTypes[format] ?? "audio/mpeg";

  return new File([buffer], filename, { type: mimeType });
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * Builds FFmpeg command-line arguments for audio extraction
 */
function buildFFmpegArgs(opts: Required<AudioExtractionOptions>): string[] {
  return [
    "-i", "pipe:0",           // Read from stdin
    "-vn",                    // Disable video
    "-acodec", getCodecForFormat(opts.format),
    "-ar", opts.sampleRate.toString(),
    "-ac", opts.channels.toString(),
    "-b:a", opts.bitrate,
    "-f", opts.format,        // Output format
    "pipe:1",                 // Write to stdout
  ];
}

/**
 * Gets the appropriate codec for the output format
 */
function getCodecForFormat(format: "mp3" | "wav" | "ogg"): string {
  switch (format) {
    case "mp3":
      return "libmp3lame";
    case "wav":
      return "pcm_s16le";
    case "ogg":
      return "libvorbis";
    default:
      return "libmp3lame";
  }
}



