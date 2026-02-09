-- Add source column to agenda_items to track AI-generated vs manually created items
ALTER TABLE "agenda_items" ADD COLUMN "source" varchar(20) DEFAULT 'manual';
