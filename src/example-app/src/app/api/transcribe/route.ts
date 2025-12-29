import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { spawn } from 'child_process';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Extracts audio from a video buffer, optimized for transcription.
 * Converts to mono, 16kHz, 64kbps MP3 for efficient transcription API usage.
 */
async function extractAudioFromVideo(videoBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    // FFmpeg args for optimized transcription audio
    const ffmpegArgs = [
      "-i", "pipe:0",        // Read from stdin
      "-vn",                 // No video
      "-acodec", "libmp3lame",
      "-ar", "16000",        // 16kHz sample rate (optimal for speech)
      "-ac", "1",            // Mono
      "-b:a", "64k",         // 64kbps bitrate
      "-f", "mp3",           // MP3 format
      "pipe:1",              // Write to stdout
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
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
    });

    ffmpeg.stdin.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code !== "EPIPE") {
        reject(new Error(`FFmpeg stdin error: ${err.message}`));
      }
    });

    ffmpeg.stdin.write(videoBuffer);
    ffmpeg.stdin.end();
  });
}

export async function POST(req: Request) {
  try {
    const { recordingUrl } = await req.json();
    
    if (!recordingUrl) {
      return NextResponse.json({ error: 'Recording URL is required' }, { status: 400 });
    }

    // Download the video file from the URL
    const response = await fetch(recordingUrl);
    if (!response.ok) {
      return NextResponse.json({ 
        error: `Failed to download recording: ${response.status}` 
      }, { status: 400 });
    }
    
    const videoBuffer = Buffer.from(await response.arrayBuffer());
    
    // Extract and optimize audio for transcription
    // Converts to mono, 16kHz, 64kbps MP3 - optimal for speech recognition
    let audioBuffer: Buffer;
    try {
      audioBuffer = await extractAudioFromVideo(videoBuffer);
    } catch (error) {
      console.error('Audio extraction failed, falling back to direct video:', error);
      // Fallback: use video directly if FFmpeg fails
      audioBuffer = videoBuffer;
    }

    // Create a File object for the OpenAI API
    const audioFile = new File(
      [audioBuffer], 
      'audio.mp3', 
      { type: 'audio/mpeg' }
    );
    
    // Transcribe with Whisper
    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
    });
    
    const transcription = transcriptionResponse.text;
    
    // Generate summary with GPT-4o
    const summaryResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that summarizes meeting transcripts.'
        },
        {
          role: 'user',
          content: `Please provide a concise summary of this meeting transcript: ${transcription}`
        }
      ],
    });
    
    const summary = summaryResponse.choices[0]?.message?.content;
    
    return NextResponse.json({ transcription, summary }, { status: 200 });
  } catch (error) {
    console.error('Error in transcription or summarization:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unknown error occurred' 
    }, { status: 500 });
  }
}
