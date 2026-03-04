-- Phase 4: Add structured summary fields to bots table
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "summary_minutes" text;
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "summary_action_items" text;
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "summary_decisions" text;
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "summary_overview" text;
