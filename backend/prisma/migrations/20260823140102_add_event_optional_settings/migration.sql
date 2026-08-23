-- CreateEnum
CREATE TYPE "dress_code_audience" AS ENUM ('everyone', 'men', 'women');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "min_age" INTEGER;

-- CreateTable
CREATE TABLE "event_dress_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "label" VARCHAR(25) NOT NULL,
    "applies_to" "dress_code_audience" NOT NULL DEFAULT 'everyone',
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_dress_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_event_dress_codes_event" ON "event_dress_codes"("event_id");

-- AddForeignKey
ALTER TABLE "event_dress_codes" ADD CONSTRAINT "event_dress_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
