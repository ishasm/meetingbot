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
} from "../types";

const ASSEMBLYAI_API_URL = "https://api.assemblyai.com/v2";

/**
 * Maps AssemblyAI speaker labels (A, B, C) to actual participant names
 * using the speaker_timeframes data from meeting recordings
 */
function mapSpeakersToNames(
  segments: TranscriptionSegment[],
  words: TranscriptionWord[] | undefined,
  speakerTimeframes: SpeakerTimeframe[]
): { segments: TranscriptionSegment[]; words?: TranscriptionWord[]; speakerMap: Record<string, string> } {
  if (!speakerTimeframes.length) {
    return { segments, words, speakerMap: {} };
  }

  // Build a map of AssemblyAI speaker labels to actual names
  // Strategy: For each segment, find the speaker_timeframe that overlaps most
  const speakerVotes: Record<string, Record<string, number>> = {};

  for (const segment of segments) {
    if (!segment.speaker) continue;

    const speakerLabel = segment.speaker;
    if (!speakerVotes[speakerLabel]) {
      speakerVotes[speakerLabel] = {};
    }

    // Find overlapping speaker timeframes
    for (const tf of speakerTimeframes) {
      const overlapStart = Math.max(segment.start, tf.start);
      const overlapEnd = Math.min(segment.end, tf.end);
      const overlap = Math.max(0, overlapEnd - overlapStart);

      if (overlap > 0) {
        speakerVotes[speakerLabel][tf.speakerName] = 
          (speakerVotes[speakerLabel][tf.speakerName] ?? 0) + overlap;
      }
    }
  }

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

    if (sortedNames.length > 0) {
      const bestName = sortedNames[0]![0];
      speakerMap[label] = bestName;
      usedNames.add(bestName);
    }
  }

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
  readonly name = "assemblyai" as const;
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
      const uploadUrl = await this.uploadAudio(audioBuffer);

      // Step 2: Start transcription
      const transcriptId = await this.startTranscription(uploadUrl, options);

      // Step 3: Poll for completion
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
    const response = await fetch(`${ASSEMBLYAI_API_URL}/upload`, {
      method: "POST",
      headers: {
        Authorization: this.apiKey!,
        "Content-Type": "application/octet-stream",
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TranscriptionError(
        `Failed to upload audio: ${response.status} - ${errorText}`,
        "assemblyai",
        `UPLOAD_HTTP_${response.status}`
      );
    }

    const data = await response.json();
    return data.upload_url;
  }

  private async startTranscription(
    audioUrl: string,
    options: Omit<TranscriptionOptions, "provider">
  ): Promise<string> {
    const requestBody: Record<string, any> = {
      audio_url: audioUrl,
    };

    // Language setting
    if (options.language) {
      requestBody.language_code = options.language;
    }

    // Speaker diarization - enable by default if we have speaker timeframes
    // or if explicitly requested
    const enableDiarization = options.speakerDiarization !== false && 
      (options.speakerDiarization || options.speakerTimeframes?.length);
    
    if (enableDiarization) {
      requestBody.speaker_labels = true;
      
      // Calculate expected speakers from timeframes or use provided value
      const speakersExpected = options.speakersExpected ?? 
        (options.speakerTimeframes ? getUniqueSpeakers(options.speakerTimeframes).length : undefined);
      
      if (speakersExpected && speakersExpected > 0) {
        // AssemblyAI accepts speakers_expected as a hint
        requestBody.speakers_expected = Math.min(speakersExpected, 10); // Max 10 speakers
        console.log(`AssemblyAI: Setting speakers_expected to ${requestBody.speakers_expected}`);
      }
    }

    // Custom vocabulary for better recognition
    if (options.customVocabulary?.length) {
      requestBody.word_boost = options.customVocabulary;
    }

    // Add speaker names as custom vocabulary for better recognition
    if (options.speakerTimeframes?.length) {
      const speakerNames = getUniqueSpeakers(options.speakerTimeframes);
      const existingBoost = requestBody.word_boost ?? [];
      requestBody.word_boost = [...new Set([...existingBoost, ...speakerNames])];
      console.log(`AssemblyAI: Boosting speaker names: ${speakerNames.join(", ")}`);
    }

    const response = await fetch(`${ASSEMBLYAI_API_URL}/transcript`, {
      method: "POST",
      headers: {
        Authorization: this.apiKey!,
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

    const data = await response.json();
    return data.id;
  }

  private async pollForCompletion(
    transcriptId: string,
    speakerTimeframes?: SpeakerTimeframe[]
  ): Promise<Omit<TranscriptionResult, "provider" | "processingTimeMs">> {
    const maxAttempts = 180; // 15 minutes max (5 second intervals)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(
        `${ASSEMBLYAI_API_URL}/transcript/${transcriptId}`,
        {
          headers: {
            Authorization: this.apiKey!,
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

      const data = await response.json();

      if (data.status === "completed") {
        return this.parseTranscriptionResult(data, speakerTimeframes);
      }

      if (data.status === "error") {
        throw new TranscriptionError(
          `Transcription failed: ${data.error}`,
          "assemblyai",
          "TRANSCRIPTION_ERROR"
        );
      }

      // Log progress
      if (attempts % 6 === 0) { // Every 30 seconds
        console.log(`AssemblyAI: Transcription status: ${data.status} (attempt ${attempts + 1})`);
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
    data: any,
    speakerTimeframes?: SpeakerTimeframe[]
  ): Omit<TranscriptionResult, "provider" | "processingTimeMs"> {
    // Parse words with speaker info
    let words: TranscriptionWord[] = data.words?.map((w: any) => ({
      word: w.text,
      start: w.start / 1000, // Convert ms to seconds
      end: w.end / 1000,
      confidence: w.confidence,
      speaker: w.speaker,
    })) ?? [];

    // Create segments from utterances if available (speaker-based)
    let segments: TranscriptionSegment[] = [];

    if (data.utterances?.length) {
      segments = data.utterances.map((u: any) => ({
        start: u.start / 1000,
        end: u.end / 1000,
        text: u.text,
        speaker: u.speaker,
        confidence: u.confidence,
      }));
    }

    // Map speaker labels to actual names if we have speaker timeframes
    if (speakerTimeframes?.length && segments.length) {
      console.log(`AssemblyAI: Mapping ${segments.length} segments to ${getUniqueSpeakers(speakerTimeframes).length} known speakers`);
      
      const mapped = mapSpeakersToNames(segments, words, speakerTimeframes);
      segments = mapped.segments;
      words = mapped.words ?? words;

      if (Object.keys(mapped.speakerMap).length > 0) {
        console.log(`AssemblyAI: Speaker mapping:`, mapped.speakerMap);
      }
    }

    // Rebuild text with speaker names if we have segments
    let text = data.text;
    if (segments.length > 0 && segments[0]?.speaker) {
      text = segments
        .map(seg => `${seg.speaker}: ${seg.text}`)
        .join("\n\n");
    }

    return {
      text,
      language: data.language_code,
      duration: data.audio_duration,
      segments,
      words: words.length > 0 ? words : undefined,
    };
  }
}
