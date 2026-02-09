-- Add summary column to bots table for storing AI-generated meeting summaries
ALTER TABLE "bots" ADD COLUMN "summary" text;
