-- Add pending_action column to bots table for pause/resume commands
ALTER TABLE "bots" ADD COLUMN "pending_action" varchar(20);
