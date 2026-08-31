-- 2FA TOTP for Super Admin accounts only — see docs/SPEC.md §10.7 and
-- db/schema.sql for the full rationale (totp_enabled_at vs totp_secret
-- distinguishing "setup in progress" from "active", per-account lockout
-- independent of the per-IP @Throttle, one-time hashed recovery codes).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(6),
ADD COLUMN     "totp_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totp_locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "totp_recovery_code_hashes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totp_secret" TEXT;

-- CHECK constraint hand-maintained per CLAUDE.md — Prisma cannot express CHECK
-- constraints, so this is pasted in from db/schema.sql rather than generated.
ALTER TABLE "users" ADD CONSTRAINT "chk_users_totp_enabled_requires_secret"
  CHECK ("totp_secret" IS NOT NULL OR "totp_enabled_at" IS NULL);
