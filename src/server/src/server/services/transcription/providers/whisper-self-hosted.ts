/**
 * Self-hosted Whisper transcription provider
 * 
 * Compatible with:
 * - faster-whisper-server (https://github.com/fedirz/faster-whisper-server)
 * - whisper.cpp server (https://github.com/ggerganov/whisper.cpp)
 * - OpenAI-compatible Whisper APIs
 */
import {
  type ITranscriptionProvider,
  type TranscriptionResult,
  type TranscriptionOptions,
  type TranscriptionSegment,
  type WhisperSelfHostedConfig,
  TranscriptionError,
} from "../types";

export class WhisperSelfHostedProvider implements ITranscriptionProvider {
  readonly name = "whisper-self-hosted" as const;
  private baseUrl: string;
  private apiKey: string | undefined;

  constructor(config?: WhisperSelfHostedConfig) {
    this.baseUrl = config?.baseUrl ?? process.env.WHISPER_API_URL ?? "http://localhost:8000";
    this.apiKey = config?.apiKey ?? process.env.WHISPER_API_KEY;
    
    // Remove trailing slash
    this.baseUrl = this.baseUrl.replace(/\/$/, "");
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Try to reach the health endpoint or root
      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      }).catch(() => 
        fetch(`${this.baseUrl}/`, {
          method: "GET", 
          signal: AbortSignal.timeout(5000),
        })
      );
      
      return response.ok;
    } catch {
      return false;
    }
  }

  async transcribe(
    audioBuffer: Buffer,
    options: Omit<TranscriptionOptions, "provider"> = {}
  ): Promise<TranscriptionResult> {
    const startTime = Date.now();

    try {
      // Try OpenAI-compatible endpoint first (most common)
      const result = await this.transcribeOpenAICompatible(audioBuffer, options);
      return {
        ...result,
        processingTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      // If OpenAI-compatible fails, try alternative endpoints
      try {
        const result = await this.transcribeAlternative(audioBuffer, options);
        return {
          ...result,
          processingTimeMs: Date.now() - startTime,
        };
      } catch {
        // Throw original error
        throw error;
      }
    }
  }

  private async transcribeOpenAICompatible(
    audioBuffer: Buffer,
    options: Omit<TranscriptionOptions, "provider">
  ): Promise<Omit<TranscriptionResult, "processingTimeMs">> {
    // Create form data (OpenAI-compatible format)
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", audioBlob, "audio.mp3");
    formData.append("model", "whisper-1"); // Or "base", "small", "medium", "large"
    formData.append("response_format", "verbose_json");

    if (options.language) {
      formData.append("language", options.language);
    }

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // Try /v1/audio/transcriptions (OpenAI format)
    let response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers,
      body: formData,
    });

    // If not found, try without /v1 prefix
    if (response.status === 404) {
      response = await fetch(`${this.baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers,
        body: formData,
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new TranscriptionError(
        `Self-hosted Whisper API error: ${response.status} - ${errorText}`,
        "whisper-self-hosted",
        `HTTP_${response.status}`
      );
    }

    const data = await response.json();

    // Parse response (OpenAI format)
    const segments: TranscriptionSegment[] = data.segments?.map((seg: any) => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
      confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
    })) ?? [];

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
      provider: "whisper-self-hosted",
    };
  }

  private async transcribeAlternative(
    audioBuffer: Buffer,
    options: Omit<TranscriptionOptions, "provider">
  ): Promise<Omit<TranscriptionResult, "processingTimeMs">> {
    // Try whisper.cpp server format or other alternatives
    const formData = new FormData();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mpeg" });
    formData.append("file", audioBlob, "audio.mp3");
    
    if (options.language) {
      formData.append("language", options.language);
    }

    // Common alternative endpoints
    const endpoints = [
      "/inference",
      "/transcribe", 
      "/asr",
    ];

    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "POST",
          headers,
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          
          // Handle various response formats
          const text = data.text ?? data.transcription ?? data.result ?? "";
          
          return {
            text,
            language: data.language,
            duration: data.duration,
            segments: data.segments,
            provider: "whisper-self-hosted",
          };
        }
      } catch {
        // Try next endpoint
        continue;
      }
    }

    throw new TranscriptionError(
      "Failed to transcribe with self-hosted Whisper - no compatible endpoint found",
      "whisper-self-hosted",
      "NO_ENDPOINT"
    );
  }
}

