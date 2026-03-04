-- Phase 3: Create action_item_tags table for predefined tags
CREATE TABLE IF NOT EXISTS "action_item_tags" (
  "id" serial PRIMARY KEY,
  "name" varchar(100) NOT NULL UNIQUE,
  "color" varchar(20) NOT NULL DEFAULT '#6b7280',
  "created_at" timestamp DEFAULT now()
);

-- Phase 3: Create junction table for tag assignments
CREATE TABLE IF NOT EXISTS "action_item_tag_assignments" (
  "id" serial PRIMARY KEY,
  "action_item_id" integer NOT NULL REFERENCES "action_items"("id") ON DELETE CASCADE,
  "tag_id" integer NOT NULL REFERENCES "action_item_tags"("id") ON DELETE CASCADE,
  "created_at" timestamp DEFAULT now()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS "action_item_tag_assignments_item_idx" ON "action_item_tag_assignments"("action_item_id");
CREATE INDEX IF NOT EXISTS "action_item_tag_assignments_tag_idx" ON "action_item_tag_assignments"("tag_id");

-- Unique constraint to prevent duplicate tag assignments
CREATE UNIQUE INDEX IF NOT EXISTS "action_item_tag_assignments_unique" ON "action_item_tag_assignments"("action_item_id", "tag_id");
