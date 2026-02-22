-- Primary category (required for V1) + secondary labels per SLIDE taxonomy spec.
-- Same Category = filter by primary_category_id. Topic/Subject derived later.

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "primary_category_id" UUID;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "secondary_labels" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Backfill: set primary_category_id from first element of category_ids where present
UPDATE "videos"
SET "primary_category_id" = "category_ids"[1]::uuid
WHERE array_length("category_ids", 1) > 0 AND "primary_category_id" IS NULL;

CREATE INDEX IF NOT EXISTS "videos_primary_category_id_idx" ON "videos"("primary_category_id");
