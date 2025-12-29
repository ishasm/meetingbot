/**
 * Transcription Service
 * 
 * Provides a unified interface for transcribing audio using multiple providers:
 * - OpenAI Whisper API
 * - AssemblyAI
 * - Self-hosted Whisper (faster-whisper-server, whisper.cpp, etc.)
 */

import {
  type TranscriptionProvider,
  type TranscriptionOptions,
  type TranscriptionResult,
  type ITranscriptionProvider,
  TranscriptionError,
} from "./types";
import { OpenAIProvider } from "./providers/openai";
import { AssemblyAIProvider } from "./providers/assemblyai";
import { WhisperSelfHostedProvider } from "./providers/whisper-self-hosted";

// Re-export types
export * from "./types";

/**
 * Get the default transcription provider based on environment configuration
 */
function getDefaultProvider(): TranscriptionProvider {
  // Check environment variable for explicit default
  const envProvider = process.env.TRANSCRIPTION_PROVIDER?.toLowerCase();
  if (envProvider === "openai" || envProvider === "assemblyai" || envProvider === "whisper-self-hosted") {
    return envProvider;
  }

  // Auto-detect based on available API keys
  if (process.env.WHISPER_API_URL) {
    return "whisper-self-hosted";
  }
  if (process.env.ASSEMBLYAI_API_KEY) {
    return "assemblyai";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  // Default to OpenAI
  return "openai";
}

/**
 * Create a transcription provider instance
 */
function createProvider(provider: TranscriptionProvider): ITranscriptionProvider {
  switch (provider) {
    case "openai":
      return new OpenAIProvider();
    case "assemblyai":
      return new AssemblyAIProvider();
    case "whisper-self-hosted":
      return new WhisperSelfHostedProvider();
    default:
      throw new TranscriptionError(
        `Unknown transcription provider: ${provider}`,
        provider,
        "UNKNOWN_PROVIDER"
      );
  }
}

/**
 * Transcription service class
 */
export class TranscriptionService {
  private providers: Map<TranscriptionProvider, ITranscriptionProvider> = new Map();

  constructor() {
    // Initialize providers lazily
  }

  private getProvider(name: TranscriptionProvider): ITranscriptionProvider {
    if (!this.providers.has(name)) {
      this.providers.set(name, createProvider(name));
    }
    return this.providers.get(name)!;
  }

  /**
   * Check which transcription providers are available
   */
  async getAvailableProviders(): Promise<TranscriptionProvider[]> {
    const providers: TranscriptionProvider[] = ["openai", "assemblyai", "whisper-self-hosted"];
    const available: TranscriptionProvider[] = [];

    for (const name of providers) {
      try {
        const provider = this.getProvider(name);
        if (await provider.isAvailable()) {
          available.push(name);
        }
      } catch {
        // Provider not available
      }
    }

    return available;
  }

  /**
   * Transcribe audio from a buffer
   * 
   * @param audioBuffer - The audio data as a buffer (MP3 recommended)
   * @param options - Transcription options including provider selection
   * @returns Transcription result
   * 
   * @example
   * ```ts
   * const service = new TranscriptionService();
   * 
   * // Use default provider
   * const result = await service.transcribe(audioBuffer);
   * 
   * // Use specific provider
   * const result = await service.transcribe(audioBuffer, { provider: "assemblyai" });
   * 
   * // With options
   * const result = await service.transcribe(audioBuffer, {
   *   provider: "openai",
   *   language: "en",
   *   wordTimestamps: true,
   * });
   * ```
   */
  async transcribe(
    audioBuffer: Buffer,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const providerName = options.provider ?? getDefaultProvider();
    const provider = this.getProvider(providerName);

    if (!(await provider.isAvailable())) {
      throw new TranscriptionError(
        `Transcription provider "${providerName}" is not available. Check API key configuration.`,
        providerName,
        "PROVIDER_UNAVAILABLE"
      );
    }

    return provider.transcribe(audioBuffer, options);
  }

  /**
   * Transcribe audio from a URL (supported by some providers)
   * 
   * @param audioUrl - URL to the audio file
   * @param options - Transcription options
   * @returns Transcription result
   */
  async transcribeFromUrl(
    audioUrl: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    const providerName = options.provider ?? getDefaultProvider();
    const provider = this.getProvider(providerName);

    if (!(await provider.isAvailable())) {
      throw new TranscriptionError(
        `Transcription provider "${providerName}" is not available. Check API key configuration.`,
        providerName,
        "PROVIDER_UNAVAILABLE"
      );
    }

    // Check if provider supports URL transcription
    if (provider.transcribeFromUrl) {
      return provider.transcribeFromUrl(audioUrl, options);
    }

    // Fallback: download and transcribe
    console.log(`Provider ${providerName} doesn't support URL transcription, downloading audio...`);
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new TranscriptionError(
        `Failed to download audio from URL: ${response.status}`,
        providerName,
        "DOWNLOAD_FAILED"
      );
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    return provider.transcribe(audioBuffer, options);
  }
}

// Singleton instance for convenience
let transcriptionServiceInstance: TranscriptionService | null = null;

/**
 * Get the shared transcription service instance
 */
export function getTranscriptionService(): TranscriptionService {
  if (!transcriptionServiceInstance) {
    transcriptionServiceInstance = new TranscriptionService();
  }
  return transcriptionServiceInstance;
}

/**
 * Convenience function to transcribe audio
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  return getTranscriptionService().transcribe(audioBuffer, options);
}

/**
 * Convenience function to transcribe audio from URL
 */
export async function transcribeAudioFromUrl(
  audioUrl: string,
  options?: TranscriptionOptions
): Promise<TranscriptionResult> {
  return getTranscriptionService().transcribeFromUrl(audioUrl, options);
}

