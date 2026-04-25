-- Add voice-assistant toggle columns for the Gemini Live voice bot pipeline.
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "enable_recording" boolean NOT NULL DEFAULT true;
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "enable_voice_assistant" boolean NOT NULL DEFAULT false;
