-- CreateTable
CREATE TABLE "event_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(50) NOT NULL,
    "label" VARCHAR(50) NOT NULL,
    "icon" VARCHAR(50) NOT NULL,
    "color_token" VARCHAR(20) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "event_categories_slug_key" ON "event_categories"("slug");

-- Seed the 8 flat categories (db/schema.sql section 3B is the source of truth).
INSERT INTO "event_categories" ("slug", "label", "icon", "color_token", "sort_order") VALUES
  ('concert',    'Concert',    'music',        'indigo',  1),
  ('festival',   'Festival',   'sparkles',     'amber',   2),
  ('soiree',     'Soirée',     'moon',         'rose',    3),
  ('ceremonie',  'Cérémonie',  'award',        'emerald', 4),
  ('theatre',    'Théâtre',    'drama',        'teal',    5),
  ('conference', 'Conférence', 'presentation', 'orange',  6),
  ('sport',      'Sport',      'trophy',       'indigo',  7),
  ('autre',      'Autre',      'shapes',       'amber',   8);

-- AlterTable: add the new FK column
ALTER TABLE "events" ADD COLUMN "category_id" UUID;

-- Data migration: only test events exist at this stage (no production data),
-- so this deliberately skips any fuzzy text-to-category matching against the
-- old free-text `category` column and just points every existing event at
-- 'autre'.
UPDATE "events" SET "category_id" = (SELECT "id" FROM "event_categories" WHERE "slug" = 'autre');

-- AlterTable: drop the old free-text column now that every row has a category_id
ALTER TABLE "events" DROP COLUMN "category";

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "event_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written CHECK constraints (db/schema.sql is the source of truth) --

ALTER TABLE "event_categories" ADD CONSTRAINT "chk_event_categories_color_token" CHECK ("color_token" IN ('indigo', 'amber', 'emerald', 'rose', 'orange', 'teal'));
