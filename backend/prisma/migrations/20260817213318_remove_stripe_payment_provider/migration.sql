-- Stripe doesn't support Senegal-registered businesses (see docs/SPEC.md
-- §2 "Stripe retiré"). CinetPay is the sole active payment provider;
-- PayDunya remains as an inactive backup value. PostgreSQL can't drop a
-- single enum value directly, so the type is recreated without it.

-- AlterEnum
BEGIN;
CREATE TYPE "payment_provider_new" AS ENUM ('cinetpay', 'paydunya', 'intouch');
ALTER TABLE "payments" ALTER COLUMN "provider" TYPE "payment_provider_new" USING ("provider"::text::"payment_provider_new");
ALTER TYPE "payment_provider" RENAME TO "payment_provider_old";
ALTER TYPE "payment_provider_new" RENAME TO "payment_provider";
DROP TYPE "payment_provider_old";
COMMIT;
