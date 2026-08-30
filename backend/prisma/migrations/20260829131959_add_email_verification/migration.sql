-- Email verification (classic accounts only) + signup consent trail, per
-- docs/SPEC.md and the auth two-step-Google/verification-code plan. No new
-- table: a single active verification code per user, no history to keep.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verification_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "email_verification_code_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "email_verification_code_hash" TEXT,
ADD COLUMN     "email_verified_at" TIMESTAMPTZ(6),
ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "terms_accepted_at" TIMESTAMPTZ(6);

-- Backfill (same principle as the event_categories/published_at backfill) --
--
-- email_verified_at: retroactively unlocks every account that already
-- exists (seeded Super Admin, e2e test accounts, mobile-scan CONTROLLER
-- accounts, Teams placeholder invites) so this migration never locks anyone
-- out. This is an operational access concern, not a consent record.
UPDATE "users" SET "email_verified_at" = now() WHERE "email_verified_at" IS NULL;

-- terms_accepted_at is deliberately NOT backfilled: it is proof of consent,
-- and no such consent was ever actually captured for accounts created
-- before this column existed. Fabricating a timestamp here would be
-- inventing evidence that never happened. It stays NULL for all
-- pre-existing accounts and is only ever set going forward, at the moment
-- of classic registration or Google signup completion.
