-- CreateEnum
CREATE TYPE "promotion_type" AS ENUM ('featured', 'sponsored');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "published_at" TIMESTAMPTZ(6);

-- Data migration: only test events exist at this stage (no production data),
-- so the exact moment of transition to 'published' was never tracked before
-- this column existed. updated_at is used as a reasonable approximation for
-- already-published rows — same backfill logic as the 'autre' backfill for
-- event_categories (20260822030711_add_event_categories).
UPDATE "events" SET "published_at" = "updated_at" WHERE "status" = 'published';

-- CreateTable
CREATE TABLE "event_promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "type" "promotion_type" NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_event_promotions_event" ON "event_promotions"("event_id");

-- CreateIndex
CREATE INDEX "idx_event_promotions_window" ON "event_promotions"("type", "starts_at", "ends_at");

-- AddForeignKey
ALTER TABLE "event_promotions" ADD CONSTRAINT "event_promotions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_promotions" ADD CONSTRAINT "event_promotions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Hand-written CHECK constraint (db/schema.sql is the source of truth) —
-- a promotion window that ends before/at its own start would silently never
-- match anything in DiscoveryService's active-window filter.
ALTER TABLE "event_promotions" ADD CONSTRAINT "event_promotions_ends_at_after_starts_at" CHECK ("ends_at" > "starts_at");
