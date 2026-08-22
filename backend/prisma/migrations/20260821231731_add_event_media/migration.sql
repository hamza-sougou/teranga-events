-- CreateEnum
CREATE TYPE "event_media_type" AS ENUM ('image', 'video');

-- CreateTable
CREATE TABLE "event_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "type" "event_media_type" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "original_filename" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_event_media_event" ON "event_media"("event_id");

-- AddForeignKey
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written CHECK constraints (db/schema.sql is the source of truth) --

ALTER TABLE "event_media" ADD CONSTRAINT "event_media_size_bytes_check" CHECK ("size_bytes" > 0);
