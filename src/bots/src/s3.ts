import { PutObjectCommand, S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, writeFileSync, existsSync, promises as fsPromises } from "fs";
import { spawn } from "child_process";
import { Bot } from "./bot";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import path from "path";

/**
 * Result of uploading a recording to S3
 */
export interface UploadResult {
    /** S3 key for the video file (MP4) */
    videoKey: string;
    /** S3 key for the extracted audio file (MP3), null if extraction failed */
    audioKey: string | null;
}

/**
 * Creates an S3 Connection to the bucket.
 * 
 * @returns S3Client
 */
export function createS3Client(region: string | undefined, accessKeyId: string | undefined, secretKey: string | undefined): S3Client|null {

    try {

        if (!region)
            throw new Error("Region is required");

        const config: any = {
            region,
        };

        // Add credentials if provided
        if (accessKeyId && secretKey) {
            config.credentials = {
                accessKeyId: accessKeyId,
                secretAccessKey: secretKey,
            };
        }

        // Configure for MinIO when using Docker Compose deployment
        if (process.env.S3_ENDPOINT) {
            config.endpoint = process.env.S3_ENDPOINT;
            config.forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";
        }

        return new S3Client(config);

    } catch (error) {
        console.error("Error creating S3 client:", error);
        return null;
    }
}

/**
 * Extracts audio from a video buffer and returns optimized MP3 audio.
 * Converts to mono, 16kHz, 64kbps - optimal for transcription APIs.
 * 
 * @param videoBuffer - The input video buffer (MP4)
 * @returns Promise resolving to the extracted audio as a Buffer
 */
async function extractAudioFromVideo(videoBuffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];

        // FFmpeg args for optimized transcription audio
        // mono, 16kHz, 64kbps MP3 - optimal for speech recognition
        const ffmpegArgs = [
            "-i", "pipe:0",           // Read from stdin
            "-vn",                    // No video
            "-acodec", "libmp3lame",  // MP3 codec
            "-ar", "16000",           // 16kHz sample rate (optimal for speech)
            "-ac", "1",               // Mono
            "-b:a", "64k",            // 64kbps bitrate
            "-f", "mp3",              // MP3 format
            "pipe:1",                 // Write to stdout
        ];

        const ffmpeg = spawn("ffmpeg", ffmpegArgs);

        ffmpeg.stdout.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
        });

        let stderrOutput = "";
        ffmpeg.stderr.on("data", (data: Buffer) => {
            stderrOutput += data.toString();
        });

        ffmpeg.on("close", (code) => {
            if (code === 0) {
                const audioBuffer = Buffer.concat(chunks);
                console.log("Audio extraction completed successfully");
                
                // Log last part of stderr for debugging
                const stderrLines = stderrOutput.split('\n');
                const relevantLines = stderrLines.filter(line => 
                    line.includes('Audio:') || 
                    line.includes('Stream #') || 
                    line.includes('Duration:') ||
                    line.includes('size=')
                );
                if (relevantLines.length > 0) {
                    console.log('FFmpeg audio info:', relevantLines.slice(-5).join('\n'));
                }
                
                resolve(audioBuffer);
            } else {
                reject(new Error(`FFmpeg exited with code ${code}. stderr: ${stderrOutput.slice(-500)}`));
            }
        });

        ffmpeg.on("error", (err) => {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
        });

        ffmpeg.stdin.on("error", (err) => {
            // Ignore EPIPE errors (FFmpeg may close stdin early)
            if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
                reject(new Error(`FFmpeg stdin error: ${err.message}`));
            }
        });

        ffmpeg.stdin.write(videoBuffer);
        ffmpeg.stdin.end();
    });
}

/**
 * Downloads a video from S3 and extracts audio from it.
 * This is more reliable than extracting from a buffer during upload.
 * 
 * @param s3Client - The S3 client instance
 * @param videoKey - The S3 key of the video file
 * @returns Promise resolving to the extracted audio as a Buffer
 */
async function extractAudioFromS3Video(s3Client: S3Client, videoKey: string): Promise<Buffer> {
    console.log("Downloading video from S3 for audio extraction...");
    
    const getCommand = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME!,
        Key: videoKey,
    });

    const response = await s3Client.send(getCommand);
    
    // Convert the response body stream to a buffer
    const chunks: Uint8Array[] = [];
    const stream = response.Body as Readable;
    
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    
    const videoBuffer = Buffer.concat(chunks);
    console.log(`Downloaded video from S3, size: ${videoBuffer.length} bytes`);
    
    // Now extract audio from the complete video file
    return await extractAudioFromVideo(videoBuffer);
}

/**
 * Concatenates multiple MP4 segments into a single file using FFmpeg's concat demuxer.
 * All segments must have the same codec parameters (which they will since
 * they're all produced by the same FFmpeg configuration).
 * 
 * @param segmentPaths - Array of file paths to the recording segments
 * @returns Path to the concatenated output file
 */
async function concatenateSegments(segmentPaths: string[]): Promise<string> {
    const dir = path.dirname(segmentPaths[0]!);
    const concatListPath = path.join(dir, "segments.txt");
    const outputPath = path.join(dir, "recording_final.mp4");

    const concatContent = segmentPaths
        .map((p) => `file '${p}'`)
        .join("\n");
    writeFileSync(concatListPath, concatContent);

    console.log(`Concatenating ${segmentPaths.length} segments into ${outputPath}`);

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concatListPath,
            "-c", "copy",
            outputPath,
        ]);

        let stderr = "";
        ffmpeg.stderr.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        ffmpeg.on("close", (code) => {
            // Clean up the concat list file
            fsPromises.unlink(concatListPath).catch(() => {});

            if (code === 0) {
                console.log("Segment concatenation completed successfully");
                resolve(outputPath);
            } else {
                reject(new Error(`FFmpeg concat exited with code ${code}: ${stderr.slice(-500)}`));
            }
        });

        ffmpeg.on("error", (err) => {
            reject(new Error(`Failed to spawn FFmpeg for concat: ${err.message}`));
        });
    });
}

/**
 * Reads a recording file with retries for busy/missing files.
 */
async function readFileWithRetries(filePath: string, maxRetries: number = 10): Promise<Buffer> {
    let remaining = maxRetries;
    while (true) {
        try {
            const content = readFileSync(filePath);
            console.log(`Successfully read recording file: ${filePath}`);
            return content;
        } catch (error) {
            const err = error as NodeJS.ErrnoException;
            if (err.code === "EBUSY") {
                console.log("File is busy, retrying...");
                await new Promise(r => setTimeout(r, 1000));
            } else if (err.code === "ENOENT") {
                if (remaining <= 0)
                    throw new Error(`File not found after ${maxRetries} retries: ${filePath}`);
                console.log(`File not found, retrying ${remaining--} more times`);
                await new Promise(r => setTimeout(r, 1000));
            } else {
                throw error;
            }
        }
    }
}

/**
 * Uploads a recording to S3, including both video and extracted audio.
 * Handles multi-segment recordings by concatenating segments first.
 * 
 * @param s3Client - The S3 client instance
 * @param bot - The bot instance containing recording info
 * @returns Promise resolving to UploadResult with video and audio keys
 */
export async function uploadRecordingToS3(s3Client: S3Client, bot: Bot): Promise<UploadResult> {

    const segments = bot.getRecordingSegments();
    let filePath: string;
    let cleanupPaths: string[] = [];

    if (segments.length > 1) {
        // Multiple segments: concatenate them first
        console.log(`Found ${segments.length} recording segments, concatenating...`);
        filePath = await concatenateSegments(segments);
        // Clean up all segment files + the concatenated file after upload
        cleanupPaths = [...segments, filePath];
    } else {
        filePath = segments[0] ?? bot.getRecordingPath();
        cleanupPaths = [filePath];
    }

    const fileContent = await readFileWithRetries(filePath);

    // Create UUID and initialize keys
    const uuid = randomUUID();
    const contentType = bot.getContentType();
    const platform = bot.settings.meetingInfo.platform;
    const videoExtension = contentType.split("/")[1];
    
    const videoKey = `recordings/${uuid}-${platform}-recording.${videoExtension}`;
    const audioKey = `recordings/${uuid}-${platform}-audio.mp3`;

    let uploadedVideoKey = '';
    let uploadedAudioKey: string | null = null;

    try {
        // Upload video file
        const videoCommandObjects = {
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: videoKey,
            Body: fileContent,
            ContentType: contentType,
        };

        const videoPutCommand = new PutObjectCommand(videoCommandObjects);
        await s3Client.send(videoPutCommand);
        console.log(`Successfully uploaded video recording to S3: ${videoKey}`);
        uploadedVideoKey = videoKey;

    } catch (error) {
        console.error("Error uploading video to S3:", error);
        // Clean up local file even if upload fails
        await fsPromises.unlink(filePath).catch(() => {});
        return { videoKey: '', audioKey: null };
    }

    // Extract and upload audio - download from S3 first for reliability
    try {
        console.log("Starting audio extraction from S3 video...");
        const audioBuffer = await extractAudioFromS3Video(s3Client, videoKey);
        console.log(`Audio extracted successfully, size: ${audioBuffer.length} bytes`);

        // Check if audio buffer is suspiciously small (likely empty)
        if (audioBuffer.length < 1000) {
            console.warn(`WARNING: Audio buffer is very small (${audioBuffer.length} bytes) - video may not contain audio track`);
            console.warn("This usually means the video was recorded without audio or PulseAudio failed to capture audio");
        }

        const audioCommandObjects = {
            Bucket: process.env.AWS_BUCKET_NAME!,
            Key: audioKey,
            Body: audioBuffer,
            ContentType: "audio/mpeg",
        };

        const audioPutCommand = new PutObjectCommand(audioCommandObjects);
        await s3Client.send(audioPutCommand);
        console.log(`Successfully uploaded audio to S3: ${audioKey}`);
        uploadedAudioKey = audioKey;

    } catch (error) {
        // Audio extraction/upload failed, but video was uploaded successfully
        // Log error but don't fail the entire operation
        console.error("Error extracting/uploading audio:", error);
        console.log("Video upload succeeded, but audio extraction failed. Continuing...");
    }

    // Clean up all local recording files (segments + concatenated)
    for (const cleanupPath of cleanupPaths) {
        try {
            if (existsSync(cleanupPath)) {
                await fsPromises.unlink(cleanupPath);
                console.log(`Cleaned up: ${cleanupPath}`);
            }
        } catch (error) {
            console.error(`Error cleaning up ${cleanupPath}:`, error);
        }
    }

    return {
        videoKey: uploadedVideoKey,
        audioKey: uploadedAudioKey,
    };
}

/**
 * Legacy function signature for backward compatibility.
 * Returns just the video key as a string.
 * 
 * @deprecated Use uploadRecordingToS3 which returns UploadResult
 */
export async function uploadRecordingToS3Legacy(s3Client: S3Client, bot: Bot): Promise<string> {
    const result = await uploadRecordingToS3(s3Client, bot);
    return result.videoKey;
}
