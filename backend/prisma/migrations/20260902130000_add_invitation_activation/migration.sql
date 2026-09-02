-- Phone-number authentication, step 2/5 (team invitation activation) — see
-- PROGRESS.md. A team-invite placeholder user (created by TeamsService with
-- an unusable random bcrypt hash, purely to satisfy chk_users_auth_method)
-- previously had no marker distinguishing it from a real account with a
-- real password. Without one, a public "activate account" endpoint that
-- accepts a code + sets a new password would double as an unauthenticated
-- password reset on any existing account. password_set is that marker:
-- TRUE for every real account (existing rows all have a real password or
-- Google identity, hence the DEFAULT), FALSE only for a freshly-created
-- placeholder, flipped back to TRUE in the same transaction that sets the
-- real password during activation.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "password_set" BOOLEAN NOT NULL DEFAULT true;
