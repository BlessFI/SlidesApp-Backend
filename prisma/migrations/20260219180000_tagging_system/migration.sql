-- Tagging system: ingest source, tagging_source, AI suggestion fields (for M3), ingest default rules
-- tagging_source: manual | rule | ai_suggested | ai_confirmed
-- Idempotent: safe to run again; "already exists, skipping" is normal if migration was already applied.

ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "ingest_source" TEXT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "tagging_source" TEXT;
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "ai_suggested_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "ai_suggested_topic_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "ai_suggested_subject_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "ai_confidence" DECIMAL(3,2);
ALTER TABLE "videos" ADD COLUMN IF NOT EXISTS "ai_model_version" TEXT;

CREATE TABLE IF NOT EXISTS "ingest_default_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "app_id" TEXT NOT NULL REFERENCES "App"("id") ON DELETE CASCADE,
  "source_key" TEXT NOT NULL,
  "default_category_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "default_topic_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "default_subject_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE("app_id", "source_key")
);

CREATE INDEX IF NOT EXISTS "ingest_default_rules_app_id_idx" ON "ingest_default_rules"("app_id");
