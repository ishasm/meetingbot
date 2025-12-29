/**
 * OpenAI Whisper transcription provider
 */
import {
  type ITranscriptionProvider,
  type TranscriptionResult,
  type TranscriptionOptions,
  type TranscriptionSegment,
  TranscriptionError,
} from "../types";

export class OpenAIProvider implements ITranscriptionProvider {
  readonly name = "openai" as const;
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY;
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
        "OpenAI API key not configured",
        "openai",
        "NO_API_KEY"
      );
    }

    const startTime = Date.now();

    try {
      // Create form data for the API request
      const formData = new FormData();
      const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
      formData.append("file", audioBlob, "audio.mp3");
      formData.append("model", "whisper-1");
      
      // Request verbose JSON to get segments
      formData.append("response_format", "verbose_json");

      if (options.language) {
        formData.append("language", options.language);
      }

      // Add timestamp granularities if word timestamps requested
      if (options.wordTimestamps) {
        formData.append("timestamp_granularities[]", "word");
        formData.append("timestamp_granularities[]", "segment");
      }

      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new TranscriptionError(
          `OpenAI API error: ${response.status} - ${errorText}`,
          "openai",
          `HTTP_${response.status}`
        );
      }

      const data = await response.json();
      const processingTimeMs = Date.now() - startTime;

      // Parse segments from verbose response
      const segments: TranscriptionSegment[] = data.segments?.map((seg: any) => ({
        start: seg.start,
        end: seg.end,
        text: seg.text,
        confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
      })) ?? [];

      // Parse words if available
      const words = data.words?.map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }));

      return {
        text: data.text,
        language: data.language,
        duration: data.duration,
        segments,
        words,
        provider: "openai",
        processingTimeMs,
      };
    } catch (error) {
      if (error instanceof TranscriptionError) {
        throw error;
      }
      throw new TranscriptionError(
        `OpenAI transcription failed: ${(error as Error).message}`,
        "openai",
        "UNKNOWN",
        error as Error
      );
    }
  }
}

