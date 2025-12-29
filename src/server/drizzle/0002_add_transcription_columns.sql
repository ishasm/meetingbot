-- Add transcription columns to bots table
ALTER TABLE "bots" ADD COLUMN "transcription" text;
ALTER TABLE "bots" ADD COLUMN "transcription_provider" varchar(50);

