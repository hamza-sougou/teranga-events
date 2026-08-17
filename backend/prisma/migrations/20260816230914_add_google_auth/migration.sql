-- AlterTable
ALTER TABLE "users" ADD COLUMN     "google_id" TEXT,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");


-- ============================================================
-- Hand-added below — copied verbatim from db/schema.sql.
-- Never let `prisma migrate dev` regenerate or drop this (see
-- CLAUDE.md "Critical business rules" / "Working in this repo").
-- ============================================================

ALTER TABLE "users"
  ADD CONSTRAINT "chk_users_auth_method" CHECK ("password_hash" IS NOT NULL OR "google_id" IS NOT NULL);
