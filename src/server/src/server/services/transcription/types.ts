/**
 * Transcription service types and interfaces
 */

/**
 * Supported transcription providers
 */
export type TranscriptionProvider = "openai" | "assemblyai" | "whisper-self-hosted";

/**
 * Speaker timeframe from meeting bot recordings
 */
export interface SpeakerTimeframe {
  /** Speaker's display name from the meeting */
  speakerName: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
}

/**
 * Options for transcription requests
 */
export interface TranscriptionOptions {
  /** The transcription provider to use */
  provider?: TranscriptionProvider;
  /** Language code (e.g., "en", "es", "fr"). Auto-detect if not specified */
  language?: string;
  /** Whether to include word-level timestamps */
  wordTimestamps?: boolean;
  /** Whether to identify different speakers (diarization) */
  speakerDiarization?: boolean;
  /** Custom vocabulary/terms to help with recognition */
  customVocabulary?: string[];
  /** 
   * Speaker timeframes from meeting bot recordings.
   * Used to:
   * 1. Hint expected number of speakers to improve diarization
   * 2. Map generic speaker labels (Speaker A, B) to actual participant names
   */
  speakerTimeframes?: SpeakerTimeframe[];
  /** Expected number of speakers (auto-calculated from speakerTimeframes if not set) */
  speakersExpected?: number;
}

/**
 * A segment of transcribed text with timing information
 */
export interface TranscriptionSegment {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** The transcribed text for this segment */
  text: string;
  /** Speaker identifier if diarization is enabled */
  speaker?: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
}

/**
 * Word-level timing information
 */
export interface TranscriptionWord {
  /** The word */
  word: string;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Speaker identifier if diarization is enabled */
  speaker?: string;
}

/**
 * Result of a transcription request
 */
export interface TranscriptionResult {
  /** The full transcribed text */
  text: string;
  /** Detected or specified language */
  language?: string;
  /** Duration of the audio in seconds */
  duration?: number;
  /** Transcription segments with timing */
  segments?: TranscriptionSegment[];
  /** Word-level timestamps if requested */
  words?: TranscriptionWord[];
  /** The provider that was used */
  provider: TranscriptionProvider;
  /** Processing time in milliseconds */
  processingTimeMs?: number;
  /** SRT formatted transcription with speaker names */
  srt?: string;
  /** Speaker label to real name mapping used */
  speakerMap?: Record<string, string>;
}

/**
 * Formats seconds to SRT timestamp format: HH:MM:SS,mmm
 */
export function formatSrtTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}

/**
 * Generates SRT formatted transcription from segments.
 * This format is compatible with video players and includes speaker names.
 */
export function generateSrt(segments: TranscriptionSegment[]): string {
  if (!segments.length) return '';
  
  return segments.map((segment, index) => {
    const startTime = formatSrtTimestamp(segment.start);
    const endTime = formatSrtTimestamp(segment.end);
    const speakerPrefix = segment.speaker ? `${segment.speaker}: ` : '';
    
    return `${index + 1}\n${startTime} --> ${endTime}\n${speakerPrefix}${segment.text}\n`;
  }).join('\n');
}

/**
 * Interface that all transcription providers must implement
 */
export interface ITranscriptionProvider {
  /** Provider identifier */
  readonly name: TranscriptionProvider;
  
  /**
   * Check if the provider is available (API key configured, service reachable)
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Transcribe audio from a buffer
   * @param audioBuffer - The audio data as a buffer
   * @param options - Transcription options
   */
  transcribe(
    audioBuffer: Buffer,
    options?: Omit<TranscriptionOptions, "provider">
  ): Promise<TranscriptionResult>;
  
  /**
   * Transcribe audio from a URL
   * @param audioUrl - URL to the audio file
   * @param options - Transcription options
   */
  transcribeFromUrl?(
    audioUrl: string,
    options?: Omit<TranscriptionOptions, "provider">
  ): Promise<TranscriptionResult>;
}

/**
 * Configuration for self-hosted Whisper
 */
export interface WhisperSelfHostedConfig {
  /** Base URL of the Whisper API (e.g., "http://localhost:9000") */
  baseUrl: string;
  /** Optional API key for authentication */
  apiKey?: string;
}

/**
 * Error thrown by transcription services
 */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly provider: TranscriptionProvider,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

