-- Fix speaker_timeframes column to have proper default and NOT NULL constraint
-- First, update all existing NULL values to empty array
UPDATE "bots" SET "speaker_timeframes" = '[]'::json WHERE "speaker_timeframes" IS NULL;

-- Then add the NOT NULL constraint with default
ALTER TABLE "bots" ALTER COLUMN "speaker_timeframes" SET DEFAULT '[]'::json;
ALTER TABLE "bots" ALTER COLUMN "speaker_timeframes" SET NOT NULL;
