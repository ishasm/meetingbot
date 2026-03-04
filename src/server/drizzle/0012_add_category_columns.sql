-- Add category column to action_items table
ALTER TABLE "action_items" ADD COLUMN IF NOT EXISTS "category" varchar(50);

-- Add category column to agenda_items table
ALTER TABLE "agenda_items" ADD COLUMN IF NOT EXISTS "category" varchar(50);

-- Create indexes for category filtering
CREATE INDEX IF NOT EXISTS "action_items_category_idx" ON "action_items"("category");
CREATE INDEX IF NOT EXISTS "agenda_items_category_idx" ON "agenda_items"("category");
