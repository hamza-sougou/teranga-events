-- Hand-added (see db/schema.sql section "1. TYPES ÉNUMÉRÉS" preamble):
-- gen_random_uuid(), used as the default for every id column below, requires pgcrypto.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "member_role" AS ENUM ('owner', 'co_organizer', 'seller', 'controller', 'accountant');

-- CreateEnum
CREATE TYPE "member_status" AS ENUM ('pending', 'active', 'suspended');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('draft', 'published', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "ticket_category" AS ENUM ('standard', 'vip', 'early_bird', 'presale', 'group');

-- CreateEnum
CREATE TYPE "ticket_access_mode" AS ENUM ('public', 'presale_whitelist', 'private_link');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('pending_payment', 'valid', 'used', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('pending', 'paid', 'cancelled', 'refunded', 'expired');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('pending', 'success', 'failed');

-- CreateEnum
CREATE TYPE "payment_provider" AS ENUM ('cinetpay', 'paydunya', 'intouch', 'stripe');

-- CreateEnum
CREATE TYPE "discount_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "scan_result" AS ENUM ('success', 'already_used', 'invalid', 'expired_event');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "subscription_plan" AS ENUM ('starter', 'pro', 'enterprise');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'past_due', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "phone" VARCHAR(20),
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "is_super_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "contact_email" TEXT,
    "contact_phone" VARCHAR(20),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "member_role" NOT NULL,
    "status" "member_status" NOT NULL DEFAULT 'pending',
    "invited_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "venue_name" VARCHAR(200),
    "address" TEXT,
    "category" VARCHAR(50),
    "status" "event_status" NOT NULL DEFAULT 'draft',
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "category" "ticket_category" NOT NULL DEFAULT 'standard',
    "price" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "quantity_total" INTEGER NOT NULL,
    "quantity_sold" INTEGER NOT NULL DEFAULT 0,
    "max_per_order" INTEGER NOT NULL DEFAULT 10,
    "access_mode" "ticket_access_mode" NOT NULL DEFAULT 'public',
    "sale_start" TIMESTAMPTZ(6) NOT NULL,
    "sale_end" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_type_whitelist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_type_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_type_whitelist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promo_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "event_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "discount_type" "discount_type" NOT NULL,
    "discount_value" DECIMAL(12,2) NOT NULL,
    "max_uses" INTEGER,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id" UUID NOT NULL,
    "buyer_user_id" UUID,
    "buyer_email" TEXT NOT NULL,
    "buyer_phone" VARCHAR(20),
    "seller_id" UUID,
    "promo_code_id" UUID,
    "status" "order_status" NOT NULL DEFAULT 'pending',
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "ticket_type_id" UUID NOT NULL,
    "qr_token" TEXT NOT NULL,
    "holder_name" VARCHAR(150),
    "holder_email" TEXT,
    "is_nominative" BOOLEAN NOT NULL DEFAULT false,
    "status" "ticket_status" NOT NULL DEFAULT 'pending_payment',
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "provider" "payment_provider" NOT NULL,
    "provider_transaction_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "status" "payment_status" NOT NULL DEFAULT 'pending',
    "raw_response" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "controller_user_id" UUID NOT NULL,
    "gate_or_zone" VARCHAR(100),
    "device_id" VARCHAR(100),
    "result" "scan_result" NOT NULL,
    "scanned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced_at" TIMESTAMPTZ(6),

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "order_id" UUID,
    "channel" "notification_channel" NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "plan" "subscription_plan" NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "organization_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "idx_org_members_org" ON "organization_members"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX "idx_events_org_status" ON "events"("organization_id", "status");

-- CreateIndex
CREATE INDEX "idx_ticket_types_event" ON "ticket_types"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_type_whitelist_ticket_type_id_email_key" ON "ticket_type_whitelist"("ticket_type_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "promo_codes_organization_id_code_key" ON "promo_codes"("organization_id", "code");

-- CreateIndex
CREATE INDEX "idx_orders_event" ON "orders"("event_id");

-- CreateIndex
CREATE INDEX "idx_orders_status_expires" ON "orders"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_qr_token_key" ON "tickets"("qr_token");

-- CreateIndex
CREATE INDEX "idx_tickets_ticket_type" ON "tickets"("ticket_type_id");

-- CreateIndex
CREATE INDEX "idx_tickets_status" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "idx_payments_order" ON "payments"("order_id");

-- CreateIndex
CREATE INDEX "idx_scans_ticket" ON "scans"("ticket_id");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_type_whitelist" ADD CONSTRAINT "ticket_type_whitelist_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_fkey" FOREIGN KEY ("promo_code_id") REFERENCES "promo_codes"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_ticket_type_id_fkey" FOREIGN KEY ("ticket_type_id") REFERENCES "ticket_types"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scans" ADD CONSTRAINT "scans_controller_user_id_fkey" FOREIGN KEY ("controller_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE NO ACTION ON UPDATE CASCADE;


-- ============================================================
-- Hand-added below — copied verbatim from db/schema.sql.
-- Never let `prisma migrate dev` regenerate or drop any of this
-- (see CLAUDE.md "Critical business rules" / "Working in this repo").
-- ============================================================

-- Case-insensitive email uniqueness (functional index, not expressible in schema.prisma)
CREATE UNIQUE INDEX "idx_users_email_lower" ON "users" (lower("email"));

-- ---- CHECK constraints (db/schema.sql sections 4 to 8) ----

ALTER TABLE "events"
  ADD CONSTRAINT "events_end_at_after_start_at" CHECK ("end_at" > "start_at");

ALTER TABLE "ticket_types"
  ADD CONSTRAINT "ticket_types_price_check" CHECK ("price" >= 0),
  ADD CONSTRAINT "ticket_types_quantity_total_check" CHECK ("quantity_total" > 0),
  ADD CONSTRAINT "ticket_types_sale_end_after_sale_start" CHECK ("sale_end" > "sale_start"),
  ADD CONSTRAINT "chk_quantity_not_exceeded" CHECK ("quantity_sold" <= "quantity_total"),
  ADD CONSTRAINT "chk_quantity_not_negative" CHECK ("quantity_sold" >= 0);

ALTER TABLE "promo_codes"
  ADD CONSTRAINT "promo_codes_discount_value_check" CHECK ("discount_value" > 0),
  ADD CONSTRAINT "promo_codes_valid_until_after_valid_from" CHECK ("valid_until" > "valid_from"),
  ADD CONSTRAINT "promo_codes_max_uses_not_exceeded" CHECK ("max_uses" IS NULL OR "uses_count" <= "max_uses");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_total_amount_check" CHECK ("total_amount" >= 0);

ALTER TABLE "order_items"
  ADD CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
  ADD CONSTRAINT "order_items_unit_price_check" CHECK ("unit_price" >= 0),
  ADD CONSTRAINT "order_items_subtotal_check" CHECK ("subtotal" >= 0);

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_check" CHECK ("amount" >= 0);

-- ---- Anti-survente : réservation atomique du quota (db/schema.sql section 13) ----

CREATE OR REPLACE FUNCTION fn_reserve_ticket_capacity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ticket_types
     SET quantity_sold = quantity_sold + 1
   WHERE id = NEW.ticket_type_id
     AND quantity_sold < quantity_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota épuisé pour le type de billet %', NEW.ticket_type_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reserve_ticket_capacity
BEFORE INSERT ON tickets
FOR EACH ROW EXECUTE FUNCTION fn_reserve_ticket_capacity();

CREATE OR REPLACE FUNCTION fn_release_ticket_capacity()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('cancelled', 'refunded')
     AND OLD.status IN ('pending_payment', 'valid') THEN
    UPDATE ticket_types
       SET quantity_sold = quantity_sold - 1
     WHERE id = NEW.ticket_type_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_release_ticket_capacity
AFTER UPDATE OF status ON tickets
FOR EACH ROW EXECUTE FUNCTION fn_release_ticket_capacity();
