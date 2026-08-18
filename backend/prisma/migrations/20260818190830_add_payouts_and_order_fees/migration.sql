-- Payout ledger + order fee split, per docs/SPEC.md sections 5.6 and 6
-- (PayDunya commission model + post-event organizer payout).
--
-- The CHECK constraints below are hand-added (Prisma doesn't express them) —
-- see CLAUDE.md "Working in this repo" and db/schema.sql, the source of
-- truth this migration must stay in sync with.

-- CreateEnum
CREATE TYPE "payout_status" AS ENUM ('pending', 'processing', 'paid', 'failed');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "service_fee_amount" DECIMAL(12,2) NOT NULL,
ADD COLUMN     "subtotal_amount" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "payout_phone_number" VARCHAR(20);

-- CreateTable
CREATE TABLE "payouts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "amount_due" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2),
    "status" "payout_status" NOT NULL DEFAULT 'pending',
    "provider_transaction_id" TEXT,
    "raw_response" JSONB,
    "triggered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payouts_event_id_key" ON "payouts"("event_id");

-- CreateIndex
CREATE INDEX "idx_payouts_organization" ON "payouts"("organization_id");

-- CreateIndex
CREATE INDEX "idx_payouts_status" ON "payouts"("status");

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written CHECK constraints (db/schema.sql is the source of truth) --

ALTER TABLE "orders" ADD CONSTRAINT "orders_subtotal_amount_check" CHECK ("subtotal_amount" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_fee_amount_check" CHECK ("service_fee_amount" >= 0);
ALTER TABLE "orders" ADD CONSTRAINT "chk_orders_total_equals_parts" CHECK ("total_amount" = "subtotal_amount" + "service_fee_amount");

ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_due_check" CHECK ("amount_due" >= 0);
