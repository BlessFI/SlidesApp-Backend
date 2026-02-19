-- AlterTable: replace single topic_id and subject_id with arrays topic_ids and subject_ids
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "topic_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "subject_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Migrate existing data (if columns exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'topic_id') THEN
    UPDATE "videos" SET "topic_ids" = ARRAY["topic_id"]::TEXT[] WHERE "topic_id" IS NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'subject_id') THEN
    UPDATE "videos" SET "subject_ids" = ARRAY["subject_id"]::TEXT[] WHERE "subject_id" IS NOT NULL;
  END IF;
END $$;

-- Drop old columns (drop foreign key first if exists)
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_topic_id_fkey";
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_subject_id_fkey";
ALTER TABLE "videos" DROP COLUMN IF EXISTS "topic_id";
ALTER TABLE "videos" DROP COLUMN IF EXISTS "subject_id";
