-- Convert category_id (single UUID) to category_ids (list of strings)
-- Add new column
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrate existing UUID values: cast to text and put in single-element array
UPDATE "videos"
SET "category_ids" = ARRAY["category_id"::TEXT]
WHERE "category_id" IS NOT NULL;

-- Drop foreign key and old column
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_category_id_fkey";
ALTER TABLE "videos" DROP COLUMN IF EXISTS "category_id";
