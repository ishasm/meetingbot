-- Create attendees table (master list of meeting attendees)
CREATE TABLE IF NOT EXISTS "attendees" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "email" varchar(255),
  "role" varchar(100),
  "department" varchar(100),
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Create meeting_attendees junction table
CREATE TABLE IF NOT EXISTS "meeting_attendees" (
  "id" serial PRIMARY KEY NOT NULL,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "attendee_id" integer NOT NULL REFERENCES "attendees"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now()
);

-- Create agenda_items table
CREATE TABLE IF NOT EXISTS "agenda_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "bot_id" integer NOT NULL REFERENCES "bots"("id") ON DELETE CASCADE,
  "serial_num" integer NOT NULL,
  "description" text NOT NULL,
  "duration" varchar(50),
  "date_added" timestamp DEFAULT now(),
  "status" varchar(20) DEFAULT 'Open',
  "remarks" text,
  "discussion_summary" text,
  "decision_resolution" text,
  "owner_attendee_id" integer REFERENCES "attendees"("id") ON DELETE SET NULL,
  "sadhguru_comments" text,
  "attachments" json DEFAULT '[]',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

-- Add assignee_attendee_id column to action_items table
ALTER TABLE "action_items" ADD COLUMN IF NOT EXISTS "assignee_attendee_id" integer REFERENCES "attendees"("id") ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "attendees_email_idx" ON "attendees"("email");
CREATE INDEX IF NOT EXISTS "attendees_name_idx" ON "attendees"("name");

CREATE INDEX IF NOT EXISTS "meeting_attendees_bot_id_idx" ON "meeting_attendees"("bot_id");
CREATE INDEX IF NOT EXISTS "meeting_attendees_attendee_id_idx" ON "meeting_attendees"("attendee_id");
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_attendees_bot_attendee_unique" ON "meeting_attendees"("bot_id", "attendee_id");

CREATE INDEX IF NOT EXISTS "agenda_items_bot_id_idx" ON "agenda_items"("bot_id");
CREATE INDEX IF NOT EXISTS "agenda_items_owner_attendee_id_idx" ON "agenda_items"("owner_attendee_id");
CREATE INDEX IF NOT EXISTS "agenda_items_status_idx" ON "agenda_items"("status");

CREATE INDEX IF NOT EXISTS "action_items_assignee_attendee_id_idx" ON "action_items"("assignee_attendee_id");
