-- Phase 5: Full-text search infrastructure

-- Add tsvector columns
ALTER TABLE "bots" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
ALTER TABLE "action_items" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;
ALTER TABLE "agenda_items" ADD COLUMN IF NOT EXISTS "search_vector" tsvector;

-- Create GIN indexes for fast full-text search
CREATE INDEX IF NOT EXISTS "bots_search_idx" ON "bots" USING GIN("search_vector");
CREATE INDEX IF NOT EXISTS "action_items_search_idx" ON "action_items" USING GIN("search_vector");
CREATE INDEX IF NOT EXISTS "agenda_items_search_idx" ON "agenda_items" USING GIN("search_vector");

-- Populate search vectors for existing rows
UPDATE "bots" SET "search_vector" =
  to_tsvector('english', coalesce("meeting_name", '') || ' ' || coalesce("transcription", '') || ' ' || coalesce("summary", '') || ' ' || coalesce("summary_minutes", '') || ' ' || coalesce("summary_decisions", '') || ' ' || coalesce("summary_overview", ''));

UPDATE "action_items" SET "search_vector" =
  to_tsvector('english', coalesce("content", '') || ' ' || coalesce("assignee", ''));

UPDATE "agenda_items" SET "search_vector" =
  to_tsvector('english', coalesce("description", '') || ' ' || coalesce("discussion_summary", '') || ' ' || coalesce("decision_resolution", '') || ' ' || coalesce("sadhguru_comments", ''));

-- Create trigger functions to auto-update search vectors on insert/update
CREATE OR REPLACE FUNCTION bots_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.meeting_name, '') || ' ' ||
    coalesce(NEW.transcription, '') || ' ' ||
    coalesce(NEW.summary, '') || ' ' ||
    coalesce(NEW.summary_minutes, '') || ' ' ||
    coalesce(NEW.summary_decisions, '') || ' ' ||
    coalesce(NEW.summary_overview, '')
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION action_items_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.content, '') || ' ' ||
    coalesce(NEW.assignee, '')
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION agenda_items_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    coalesce(NEW.description, '') || ' ' ||
    coalesce(NEW.discussion_summary, '') || ' ' ||
    coalesce(NEW.decision_resolution, '') || ' ' ||
    coalesce(NEW.sadhguru_comments, '')
  );
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Create triggers (drop first to be idempotent)
DROP TRIGGER IF EXISTS bots_search_vector_trigger ON "bots";
CREATE TRIGGER bots_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "bots"
  FOR EACH ROW EXECUTE FUNCTION bots_search_vector_update();

DROP TRIGGER IF EXISTS action_items_search_vector_trigger ON "action_items";
CREATE TRIGGER action_items_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "action_items"
  FOR EACH ROW EXECUTE FUNCTION action_items_search_vector_update();

DROP TRIGGER IF EXISTS agenda_items_search_vector_trigger ON "agenda_items";
CREATE TRIGGER agenda_items_search_vector_trigger
  BEFORE INSERT OR UPDATE ON "agenda_items"
  FOR EACH ROW EXECUTE FUNCTION agenda_items_search_vector_update();
