-- Add support for multiple owners on agenda items
ALTER TABLE "agenda_items" ADD COLUMN "owner_attendee_ids" json DEFAULT '[]'::json;
