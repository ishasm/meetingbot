-- Add role and password columns to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "role" varchar(20) DEFAULT 'user';
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "password" text;

-- Create action_items table
CREATE TABLE IF NOT EXISTS "action_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "assignee" varchar(255),
  "due_date" timestamp,
  "is_completed" boolean DEFAULT false,
  "priority" varchar(20) DEFAULT 'medium',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Create index on bot_id for faster lookups
CREATE INDEX IF NOT EXISTS "action_items_bot_id_idx" ON "action_items"("bot_id");

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS "action_items_user_id_idx" ON "action_items"("user_id");
