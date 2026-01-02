-- Add SRT and transcription segments columns to bots table
-- This migration adds:
-- 1. transcription_srt: SRT formatted transcription with speaker names
-- 2. transcription_segments: JSON array of segments with timing and speaker info

ALTER TABLE "bots" ADD COLUMN "transcription_srt" TEXT;

ALTER TABLE "bots" ADD COLUMN "transcription_segments" JSON;
