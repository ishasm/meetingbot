-- Add speaker_timeframes column to bots table
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "speaker_timeframes" json;
