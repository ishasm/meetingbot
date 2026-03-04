-- Phase 2: Add attendance_mode to meeting_attendees
ALTER TABLE "meeting_attendees" ADD COLUMN IF NOT EXISTS "attendance_mode" varchar(20);

-- Phase 2: Add sort_order to action_items for drag-and-drop reordering
ALTER TABLE "action_items" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0;

-- Create index for sort_order
CREATE INDEX IF NOT EXISTS "action_items_sort_order_idx" ON "action_items"("sort_order");
