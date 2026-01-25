/**
 * AssemblyAI transcription provider
 * 
 * Features:
 * - Speaker diarization with speaker labels
 * - Speaker timeframe matching to assign real names
 * - Word-level timestamps
 * - Custom vocabulary boosting
 */
import {
  type ITranscriptionProvider,
  type TranscriptionResult,
  type TranscriptionOptions,
  type TranscriptionSegment,
  type TranscriptionWord,
  type SpeakerTimeframe,
  TranscriptionError,
  generateSrt,
} from "../types";

const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";

// Retry configuration for transient network errors
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Check if an error is a transient network error that should be retried
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: Error }).cause;
    const errorCode = (cause as Error & { code?: string })?.code;
    
    // DNS resolution failures
    if (errorCode === 'EAI_AGAIN' || errorCode === 'EAI_NODATA' || errorCode === 'EAI_NONAME') {
      return true;
    }
    // Connection reset/timeout errors
    if (errorCode === 'ECONNRESET' || errorCode === 'ETIMEDOUT' || errorCode === 'ECONNREFUSED') {
      return true;
    }
    // Undici timeout errors
    if (errorCode === 'UND_ERR_HEADERS_TIMEOUT' || errorCode === 'UND_ERR_CONNECT_TIMEOUT') {
      return true;
    }
  }
  return false;
}

/**
 * Retry a function with exponential backoff for transient errors
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  operationName: string,
  maxRetries = MAX_RETRIES
): Promise<T> {
  let lastError: Error = new Error("Retry failed with no attempts");
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries && isTransientError(error)) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.log(`AssemblyAI: ${operationName} failed with transient error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        console.log(`AssemblyAI: Error details:`, lastError.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw lastError;
      }
    }
  }
  
  throw lastError;
}

/**
 * Normalizes speaker timeframes to ensure they're in seconds.
 * Bot recordings store timeframes in milliseconds, but AssemblyAI segments are in seconds.
 */
function normalizeTimeframesToSeconds(timeframes: SpeakerTimeframe[]): SpeakerTimeframe[] {
  if (!timeframes.length) return timeframes;
  
  // Heuristic: if start times are > 100000, they're likely in milliseconds
  // (100000 seconds = ~27 hours, which is unlikely for a meeting)
  const firstStart = timeframes[0]?.start ?? 0;
  const needsConversion = firstStart > 100000;
  
  if (needsConversion) {
    console.log(`AssemblyAI: Converting speaker timeframes from ms to seconds`);
    return timeframes.map(tf => ({
      speakerName: tf.speakerName,
      start: tf.start / 1000,
      end: tf.end / 1000,
    }));
  }
  
  return timeframes;
}

/**
 * Maps AssemblyAI speaker labels (A, B, C) to actual participant names
 * using the speaker_timeframes data from meeting recordings.
 * 
 * Algorithm (similar to what tl;dv and other tools use):
 * 1. For each transcription segment, find overlapping speaker timeframes
 * 2. Vote for speaker names based on overlap duration
 * 3. Assign labels to names with highest confidence (most overlap)
 * 4. Use Hungarian algorithm-style assignment to avoid conflicts
 */
function mapSpeakersToNames(
  segments: TranscriptionSegment[],
  words: TranscriptionWord[] | undefined,
  speakerTimeframes: SpeakerTimeframe[]
): { segments: TranscriptionSegment[]; words?: TranscriptionWord[]; speakerMap: Record<string, string> } {
  if (!speakerTimeframes.length) {
    console.log(`AssemblyAI: No speaker timeframes provided, skipping name mapping`);
    return { segments, words, speakerMap: {} };
  }

  // Normalize timeframes to seconds (bot stores in ms, AssemblyAI uses seconds)
  const normalizedTimeframes = normalizeTimeframesToSeconds(speakerTimeframes);
  
  console.log(`AssemblyAI: Mapping speakers with ${normalizedTimeframes.length} timeframes`);
  console.log(`AssemblyAI: First few timeframes:`, normalizedTimeframes.slice(0, 3));
  console.log(`AssemblyAI: First few segments:`, segments.slice(0, 3).map(s => ({ 
    start: s.start, end: s.end, speaker: s.speaker, text: s.text.substring(0, 50) 
  })));

  // Build a map of AssemblyAI speaker labels to actual names
  // Strategy: For each segment, find the speaker_timeframe that overlaps most
  const speakerVotes: Record<string, Record<string, number>> = {};

  for (const segment of segments) {
    if (!segment.speaker) continue;

    const speakerLabel = segment.speaker;
    speakerVotes[speakerLabel] ??= {};

    // Find overlapping speaker timeframes
    for (const tf of normalizedTimeframes) {
      const overlapStart = Math.max(segment.start, tf.start);
      const overlapEnd = Math.min(segment.end, tf.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > 0) {
        speakerVotes[speakerLabel][tf.speakerName] = 
          (speakerVotes[speakerLabel][tf.speakerName] ?? 0) + overlap;
      }
    }
  }

  console.log(`AssemblyAI: Speaker votes:`, speakerVotes);

  // Assign each speaker label to the name with the most overlap
  const speakerMap: Record<string, string> = {};
  const usedNames = new Set<string>();

  // Sort by total votes to assign most confident mappings first
  const sortedLabels = Object.entries(speakerVotes)
    .map(([label, votes]) => ({
      label,
      votes,
      totalVotes: Object.values(votes).reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.totalVotes - a.totalVotes);

  for (const { label, votes } of sortedLabels) {
    // Find the best name that hasn't been used yet
    const sortedNames = Object.entries(votes)
      .filter(([name]) => !usedNames.has(name))
      .sort((a, b) => b[1] - a[1]);

    if (sortedNames.length > 0 && sortedNames[0]) {
      const bestName = sortedNames[0][0];
      speakerMap[label] = bestName;
      usedNames.add(bestName);
    }
  }

  console.log(`AssemblyAI: Final speaker mapping:`, speakerMap);

  // Apply the mapping to segments
  const mappedSegments = segments.map(seg => ({
    ...seg,
    speaker: seg.speaker ? (speakerMap[seg.speaker] ?? seg.speaker) : seg.speaker,
  }));

  // Apply the mapping to words if present
  const mappedWords = words?.map(word => ({
    ...word,
    speaker: word.speaker ? (speakerMap[word.speaker] ?? word.speaker) : word.speaker,
  }));

  return { segments: mappedSegments, words: mappedWords, speakerMap };
}

/**
 * Get unique speaker names from timeframes
 */
function getUniqueSpeakers(timeframes: SpeakerTimeframe[]): string[] {
  return [...new Set(timeframes.map(tf => tf.speakerName))];
}

export class AssemblyAIProvider implements ITranscriptionProvider {
  readonly name = "assemblyai";
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.ASSEMBLYAI_API_KEY;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async transcribe(
    audioBuffer: Buffer,
    options: Omit<TranscriptionOptions, "provider"> = {}
  ): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new TranscriptionError(
        "AssemblyAI API key not configured",
        "assemblyai",
        "NO_API_KEY"
      );
    }

    const startTime = Date.now();

    try {
      // Step 1: Upload the audio file
      console.log(`AssemblyAI: Uploading audio (${audioBuffer.length} bytes)...`);
      const uploadUrl = await this.uploadAudio(audioBuffer);
      console.log(`AssemblyAI: Upload complete, URL: ${uploadUrl.substring(0, 50)}...`);

      // Step 2: Start transcription
      console.log(`AssemblyAI: Starting transcription...`);
      const transcriptId = await this.startTranscription(uploadUrl, options);
      console.log(`AssemblyAI: Transcription started, ID: ${transcriptId}`);

      // Step 3: Poll for completion
      console.log(`AssemblyAI: Polling for completion...`);
      const result = await this.pollForCompletion(transcriptId, options.speakerTimeframes);
      console.log(`AssemblyAI: Transcription complete, text length: ${result.text.length}`);

      const processingTimeMs = Date.now() - startTime;

      return {
        ...result,
        provider: "assemblyai",
        processingTimeMs,
      };
    } catch (error) {
      console.error(`AssemblyAI error:`, error);
      if (error instanceof TranscriptionError) {
        throw error;
      }
      throw new TranscriptionError(
        `AssemblyAI transcription failed: ${(error as Error).message}`,
        "assemblyai",
        "UNKNOWN",
        error as Error
      );
    }
  }

  async transcribeFromUrl(
    audioUrl: string,
    options: Omit<TranscriptionOptions, "provider"> = {}
  ): Promise<TranscriptionResult> {
    if (!this.apiKey) {
      throw new TranscriptionError(
        "AssemblyAI API key not configured",
        "assemblyai",
        "NO_API_KEY"
      );
    }

    const startTime = Date.now();

    try {
      // Start transcription directly from URL
      const transcriptId = await this.startTranscription(audioUrl, options);

      // Poll for completion
      const result = await this.pollForCompletion(transcriptId, options.speakerTimeframes);

      const processingTimeMs = Date.now() - startTime;

      return {
        ...result,
        provider: "assemblyai",
        processingTimeMs,
      };
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw error;
      }
      throw new TranscriptionError(
        `AssemblyAI transcription failed: ${(error as Error).message}`,
        "assemblyai",
        "UNKNOWN",
        error as Error
      );
    }
  }

  private async uploadAudio(audioBuffer: Buffer): Promise<string> {
    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new TranscriptionError("AssemblyAI API key not configured", "assemblyai", "NO_API_KEY");
    }

    // Wrap the upload in retry logic for transient network errors
    return withRetry(async () => {
      // Use a longer timeout for large file uploads (10 minutes)
      // This prevents UND_ERR_HEADERS_TIMEOUT errors for large audio files
      const controller = new AbortController();
      const timeoutMs = 10 * 60 * 1000; // 10 minutes
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
          method: "POST",
          headers: {
            Authorization: apiKey,
            "Content-Type": "application/octet-stream",
          },
          body: new Uint8Array(audioBuffer),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new TranscriptionError(
            `Failed to upload audio: ${response.status} - ${errorText}`,
            "assemblyai",
            `UPLOAD_HTTP_${response.status}`
          );
        }

        const data: unknown = await response.json();
        return (data as { upload_url: string }).upload_url;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          throw new TranscriptionError(
            `Audio upload timed out after ${timeoutMs / 1000} seconds`,
            "assemblyai",
            "UPLOAD_TIMEOUT"
          );
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    }, "Upload audio");
  }

  private async startTranscription(
    audioUrl: string,
    options: Omit<TranscriptionOptions, "provider">
  ): Promise<string> {
    const requestBody: Record<string, unknown> = {
      audio_url: audioUrl,
    };

    // Language setting
    if (options.language) {
      requestBody.language_code = options.language;
    }

    // Speaker diarization - enable by default if we have speaker timeframes
    // or if explicitly requested
    const enableDiarization = options.speakerDiarization !== false && 
      (options.speakerDiarization ?? (options.speakerTimeframes?.length ?? 0) > 0);
    
    if (enableDiarization) {
      requestBody.speaker_labels = true;
      
      // Calculate expected speakers from timeframes or use provided value
      const speakersExpected = options.speakersExpected ?? 
        (options.speakerTimeframes ? getUniqueSpeakers(options.speakerTimeframes).length : undefined);
      
      if (speakersExpected && speakersExpected > 0) {
        // AssemblyAI accepts speakers_expected as a hint
        const expectedCount = Math.min(speakersExpected, 10); // Max 10 speakers
        requestBody.speakers_expected = expectedCount;
        console.log(`AssemblyAI: Setting speakers_expected to ${expectedCount}`);
      }

      // Use AssemblyAI's Speaker Identification feature if we have speaker names
      // This uses AI to identify speakers by name instead of generic labels (A, B, C)
      // See: https://www.assemblyai.com/docs/speech-understanding/speaker-identification
      if (options.speakerTimeframes?.length) {
        const speakerNames = getUniqueSpeakers(options.speakerTimeframes);
        if (speakerNames.length > 0) {
          // Truncate names to 35 chars max as per API requirement
          const truncatedNames = speakerNames.map(name => name.substring(0, 35));
          requestBody.speech_understanding = {
            request: {
              speaker_identification: {
                speaker_type: "name",
                known_values: truncatedNames,
              },
            },
          };
          console.log(`AssemblyAI: Using Speaker Identification with names: ${truncatedNames.join(", ")}`);
        }
      }
    }

    // Custom vocabulary for better recognition
    if (options.customVocabulary?.length) {
      requestBody.word_boost = options.customVocabulary;
    }

    // Add speaker names as custom vocabulary for better recognition
    if (options.speakerTimeframes?.length) {
      const speakerNames = getUniqueSpeakers(options.speakerTimeframes);
      const existingBoost = (requestBody.word_boost as string[] | undefined) ?? [];
      requestBody.word_boost = [...new Set([...existingBoost, ...speakerNames])];
      console.log(`AssemblyAI: Boosting speaker names: ${speakerNames.join(", ")}`);
    }

    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new TranscriptionError("AssemblyAI API key not configured", "assemblyai", "NO_API_KEY");
    }

    console.log(`AssemblyAI: Request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TranscriptionError(
        `Failed to start transcription: ${response.status} - ${errorText}`,
        "assemblyai",
        `TRANSCRIBE_HTTP_${response.status}`
      );
    }

    const data: unknown = await response.json();
    return (data as { id: string }).id;
  }

  private async pollForCompletion(
    transcriptId: string,
    speakerTimeframes?: SpeakerTimeframe[]
  ): Promise<Omit<TranscriptionResult, "provider" | "processingTimeMs">> {
    const maxAttempts = 180; // 15 minutes max (5 second intervals)
    let attempts = 0;

    const apiKey = this.apiKey;
    if (!apiKey) {
      throw new TranscriptionError("AssemblyAI API key not configured", "assemblyai", "NO_API_KEY");
    }

    while (attempts < maxAttempts) {
      const response = await fetch(
        `${ASSEMBLYAI_API_URL}/transcript/${transcriptId}`,
        {
          headers: {
            Authorization: apiKey,
          },
        }
      );

      if (!response.ok) {
        throw new TranscriptionError(
          `Failed to check transcription status: ${response.status}`,
          "assemblyai",
          `POLL_HTTP_${response.status}`
        );
      }

      const data: unknown = await response.json();
      const statusData = data as { status: string; error?: string };

      if (statusData.status === "completed") {
        return this.parseTranscriptionResult(data, speakerTimeframes);
      }

      if (statusData.status === "error") {
        throw new TranscriptionError(
          `Transcription failed: ${statusData.error ?? "Unknown error"}`,
          "assemblyai",
          "TRANSCRIPTION_ERROR"
        );
      }

      // Log progress
      if (attempts % 6 === 0) { // Every 30 seconds
        console.log(`AssemblyAI: Transcription status: ${statusData.status} (attempt ${attempts + 1})`);
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new TranscriptionError(
      "Transcription timed out after 15 minutes",
      "assemblyai",
      "TIMEOUT"
    );
  }

  private parseTranscriptionResult(
    data: unknown,
    speakerTimeframes?: SpeakerTimeframe[]
  ): Omit<TranscriptionResult, "provider" | "processingTimeMs"> {
    const result = data as {
      text: string;
      words?: Array<{ text: string; start: number; end: number; confidence: number; speaker?: string }>;
      utterances?: Array<{ text: string; start: number; end: number; speaker?: string; confidence: number }>;
      language_code?: string;
      audio_duration?: number;
    };

    // Parse words with speaker info
    let words: TranscriptionWord[] = result.words?.map((w) => ({
      word: w.text,
      start: w.start / 1000, // Convert ms to seconds
      end: w.end / 1000,
      confidence: w.confidence,
      speaker: w.speaker,
    })) ?? [];

    // Create segments from utterances if available (speaker-based)
    let segments: TranscriptionSegment[] = [];

    if (result.utterances?.length) {
      segments = result.utterances.map((u) => ({
        start: u.start / 1000,
        end: u.end / 1000,
        text: u.text,
        speaker: u.speaker,
        confidence: u.confidence,
      }));
    }

    // Check if Speaker Identification already provided real names
    // Real names are typically more than 1 character (vs "A", "B", "C")
    const hasRealSpeakerNames = segments.some(seg => 
      seg.speaker && seg.speaker.length > 1 && !/^Speaker [A-Z]$/.test(seg.speaker)
    );

    // Map speaker labels to actual names if we have speaker timeframes
    // Only do manual mapping if Speaker Identification didn't work
    let speakerMap: Record<string, string> = {};
    if (!hasRealSpeakerNames && speakerTimeframes?.length && segments.length) {
      console.log(`AssemblyAI: Speaker Identification not used or didn't return names, falling back to manual mapping`);
      console.log(`AssemblyAI: Mapping ${segments.length} segments to ${getUniqueSpeakers(speakerTimeframes).length} known speakers`);
      
      const mapped = mapSpeakersToNames(segments, words, speakerTimeframes);
      segments = mapped.segments;
      words = mapped.words ?? words;
      speakerMap = mapped.speakerMap;

      if (Object.keys(mapped.speakerMap).length > 0) {
        console.log(`AssemblyAI: Speaker mapping:`, mapped.speakerMap);
      }
    } else if (hasRealSpeakerNames) {
      console.log(`AssemblyAI: Speaker Identification returned real names, no manual mapping needed`);
      // Log the speakers found
      const uniqueSpeakers = [...new Set(segments.map(s => s.speaker).filter(Boolean))];
      console.log(`AssemblyAI: Identified speakers:`, uniqueSpeakers);
    }

    // Rebuild text with speaker names if we have segments
    let text = result.text;
    if (segments.length > 0 && segments[0]?.speaker) {
      text = segments
        .map(seg => `${seg.speaker}: ${seg.text}`)
        .join("\n\n");
    }

    // Generate SRT format with speaker names (like tl;dv and other tools)
    const srt = segments.length > 0 ? generateSrt(segments) : undefined;

    return {
      text,
      language: result.language_code,
      duration: result.audio_duration,
      segments,
      words: words.length > 0 ? words : undefined,
      srt,
      speakerMap: Object.keys(speakerMap).length > 0 ? speakerMap : undefined,
    };
  }
}
