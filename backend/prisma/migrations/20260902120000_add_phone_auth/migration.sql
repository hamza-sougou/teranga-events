-- Phone-number authentication, step 1/5 (backend foundations) — see
-- docs/SPEC.md and PROGRESS.md. Adds a dedicated `phone_number` column
-- (auth identifier, E.164) distinct from the pre-existing unused `phone`
-- column, mirrors the email-verification code columns for phone, and
-- extends chk_users_auth_method to accept email OR phone_number (in
-- addition to the existing password_hash OR google_id branch).

-- email becomes nullable: a phone-only account is now a valid state per
-- the extended CHECK below, so the column can no longer be NOT NULL.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone_number" VARCHAR(20),
ADD COLUMN     "phone_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "phone_verification_code_hash" TEXT,
ADD COLUMN     "phone_verification_code_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "phone_verification_attempts" INTEGER NOT NULL DEFAULT 0;

-- Partial unique index: mirrors idx_users_email_lower's role for email —
-- strict uniqueness among non-null phone numbers, without blocking
-- multiple email-only accounts (which would all have phone_number NULL).
CREATE UNIQUE INDEX "idx_users_phone_number" ON "users" ("phone_number") WHERE "phone_number" IS NOT NULL;

-- Replace chk_users_auth_method: was (password_hash IS NOT NULL OR
-- google_id IS NOT NULL) only, implicitly relying on email being NOT NULL
-- for "has an identifier". Now that email is nullable, the identifier half
-- must be checked explicitly too.
ALTER TABLE "users" DROP CONSTRAINT "chk_users_auth_method";
ALTER TABLE "users" ADD CONSTRAINT "chk_users_auth_method" CHECK (
  (email IS NOT NULL OR phone_number IS NOT NULL)
  AND (password_hash IS NOT NULL OR google_id IS NOT NULL)
);
