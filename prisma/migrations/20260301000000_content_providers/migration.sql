-- CreateTable
CREATE TABLE "content_providers" (
    "id" UUID NOT NULL,
    "app_id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "name" TEXT,
    "mrss_url" TEXT NOT NULL,
    "default_primary_category_id" UUID,
    "ingest_user_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_providers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_providers_app_id_source_key_key" ON "content_providers"("app_id", "source_key");

-- CreateIndex
CREATE INDEX "content_providers_app_id_idx" ON "content_providers"("app_id");

-- AddForeignKey
ALTER TABLE "content_providers" ADD CONSTRAINT "content_providers_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_providers" ADD CONSTRAINT "content_providers_ingest_user_id_fkey" FOREIGN KEY ("ingest_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
