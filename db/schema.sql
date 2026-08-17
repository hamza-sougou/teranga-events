-- ============================================================
-- SCHÉMA DE BASE DE DONNÉES — PLATEFORME DE BILLETTERIE SAAS
-- PostgreSQL 15+
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- pour gen_random_uuid()

-- ============================================================
-- 1. TYPES ÉNUMÉRÉS
-- ============================================================

CREATE TYPE member_role AS ENUM (
  'owner',            -- organisateur principal (créateur du compte)
  'co_organizer',
  'seller',
  'controller',
  'accountant'
);

CREATE TYPE member_status AS ENUM ('pending', 'active', 'suspended');

CREATE TYPE event_status AS ENUM ('draft', 'published', 'cancelled', 'completed');

CREATE TYPE ticket_category AS ENUM ('standard', 'vip', 'early_bird', 'presale', 'group');

CREATE TYPE ticket_access_mode AS ENUM ('public', 'presale_whitelist', 'private_link');

-- pending_payment : réservé pendant le checkout, avant confirmation du paiement
CREATE TYPE ticket_status AS ENUM ('pending_payment', 'valid', 'used', 'cancelled', 'refunded');

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'cancelled', 'refunded', 'expired');

CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed');

CREATE TYPE payment_provider AS ENUM ('cinetpay', 'paydunya', 'intouch', 'stripe');

CREATE TYPE discount_type AS ENUM ('percent', 'fixed');

CREATE TYPE scan_result AS ENUM ('success', 'already_used', 'invalid', 'expired_event');

CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push');

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TYPE subscription_plan AS ENUM ('starter', 'pro', 'enterprise');

CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled');


-- ============================================================
-- 2. UTILISATEURS
-- ============================================================

-- password_hash est nullable : un compte créé via Google OAuth n'a pas de
-- mot de passe local. google_id est nullable pour le cas inverse (compte
-- classique jamais lié à Google). Le CHECK ci-dessous garantit qu'il reste
-- toujours au moins une méthode d'authentification utilisable.
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT,
  google_id       TEXT UNIQUE,
  full_name       VARCHAR(150) NOT NULL,
  is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_users_auth_method CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

CREATE UNIQUE INDEX idx_users_email_lower ON users (lower(email));


-- ============================================================
-- 3. ORGANISATIONS (comptes organisateur) & ÉQUIPE
-- ============================================================

CREATE TABLE organizations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(100) UNIQUE NOT NULL,
  owner_user_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  contact_email     TEXT,
  contact_phone     VARCHAR(20),
  is_verified       BOOLEAN NOT NULL DEFAULT FALSE, -- KYC organisateur
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Table de jonction : chaque employé (co-organisateur, vendeur, contrôleur,
-- comptable) est un user rattaché à une organisation avec un rôle précis.
CREATE TABLE organization_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role              member_role NOT NULL,
  status            member_status NOT NULL DEFAULT 'pending',
  invited_by        UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON organization_members (organization_id);


-- ============================================================
-- 4. ÉVÈNEMENTS
-- ============================================================

CREATE TABLE events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              VARCHAR(200) NOT NULL,
  slug              VARCHAR(150) UNIQUE NOT NULL,
  description       TEXT,
  venue_name        VARCHAR(200),
  address           TEXT,
  category          VARCHAR(50), -- festival, concert, ceremonie, soiree...
  status            event_status NOT NULL DEFAULT 'draft',
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_at > start_at)
);

CREATE INDEX idx_events_org_status ON events (organization_id, status);


-- ============================================================
-- 5. TYPES DE BILLETS (standard, vip, early bird, PRÉVENTE, groupe)
-- ============================================================

CREATE TABLE ticket_types (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name              VARCHAR(150) NOT NULL,        -- ex: "Pass VIP", "Prévente"
  category          ticket_category NOT NULL DEFAULT 'standard',
  price             NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  currency          CHAR(3) NOT NULL DEFAULT 'XOF',
  quantity_total    INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_sold     INTEGER NOT NULL DEFAULT 0,
  max_per_order     INTEGER NOT NULL DEFAULT 10,
  access_mode       ticket_access_mode NOT NULL DEFAULT 'public',
  sale_start        TIMESTAMPTZ NOT NULL,
  sale_end          TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (sale_end > sale_start),

  -- --- GARDE-FOUS ANTI-SURVENTE AU NIVEAU BASE DE DONNÉES ---
  -- Backstop : même si le trigger ou le code applicatif a un bug,
  -- ces contraintes empêchent physiquement un état incohérent.
  CONSTRAINT chk_quantity_not_exceeded CHECK (quantity_sold <= quantity_total),
  CONSTRAINT chk_quantity_not_negative CHECK (quantity_sold >= 0)
);

CREATE INDEX idx_ticket_types_event ON ticket_types (event_id);

-- Liste blanche pour les préventes réservées à des invités (accès privé)
CREATE TABLE ticket_type_whitelist (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_type_id    UUID NOT NULL REFERENCES ticket_types(id) ON DELETE CASCADE,
  email             TEXT NOT NULL,
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (ticket_type_id, email)
);


-- ============================================================
-- 6. CODES PROMO
-- ============================================================

CREATE TABLE promo_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_id          UUID REFERENCES events(id) ON DELETE CASCADE, -- NULL = valable sur tous les évènements
  code              VARCHAR(50) NOT NULL,
  discount_type     discount_type NOT NULL,
  discount_value    NUMERIC(12,2) NOT NULL CHECK (discount_value > 0),
  max_uses          INTEGER,
  uses_count        INTEGER NOT NULL DEFAULT 0,
  valid_from        TIMESTAMPTZ NOT NULL,
  valid_until       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (organization_id, code),
  CHECK (valid_until > valid_from),
  CHECK (max_uses IS NULL OR uses_count <= max_uses)
);


-- ============================================================
-- 7. COMMANDES, LIGNES DE COMMANDE, BILLETS
-- ============================================================

CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id          UUID NOT NULL REFERENCES events(id),
  buyer_user_id     UUID REFERENCES users(id),          -- NULL si achat invité
  buyer_email       TEXT NOT NULL,
  buyer_phone       VARCHAR(20),
  seller_id         UUID REFERENCES users(id),           -- vendeur terrain, si vente assistée
  promo_code_id     UUID REFERENCES promo_codes(id),
  status            order_status NOT NULL DEFAULT 'pending',
  total_amount      NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency          CHAR(3) NOT NULL DEFAULT 'XOF',
  expires_at        TIMESTAMPTZ NOT NULL,  -- fin de la réservation panier (ex: +15 min)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_event ON orders (event_id);
CREATE INDEX idx_orders_status_expires ON orders (status, expires_at); -- pour le job de libération des paniers expirés

CREATE TABLE order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  ticket_type_id    UUID NOT NULL REFERENCES ticket_types(id),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price        NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  subtotal          NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

-- Un billet = une ligne. Un order_item de quantité N génère N lignes ici.
-- C'est l'insertion dans cette table qui déclenche la réservation du quota
-- (voir triggers plus bas).
CREATE TABLE tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id     UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  ticket_type_id    UUID NOT NULL REFERENCES ticket_types(id),
  qr_token          TEXT NOT NULL,           -- payload signé HMAC/JWT, jamais une donnée brute lisible
  holder_name       VARCHAR(150),
  holder_email      TEXT,
  is_nominative     BOOLEAN NOT NULL DEFAULT FALSE,
  status            ticket_status NOT NULL DEFAULT 'pending_payment',
  used_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (qr_token)
);

CREATE INDEX idx_tickets_ticket_type ON tickets (ticket_type_id);
CREATE INDEX idx_tickets_status ON tickets (status);


-- ============================================================
-- 8. PAIEMENTS
-- ============================================================

CREATE TABLE payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider                payment_provider NOT NULL,
  provider_transaction_id TEXT,
  amount                  NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency                CHAR(3) NOT NULL DEFAULT 'XOF',
  status                  payment_status NOT NULL DEFAULT 'pending',
  raw_response            JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments (order_id);


-- ============================================================
-- 9. SCANS (contrôle d'accès)
-- ============================================================

CREATE TABLE scans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id             UUID NOT NULL REFERENCES tickets(id),
  controller_user_id    UUID NOT NULL REFERENCES users(id),
  gate_or_zone          VARCHAR(100),
  device_id             VARCHAR(100),
  result                scan_result NOT NULL,
  scanned_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  synced_at             TIMESTAMPTZ  -- horodatage de la synchro si le scan a été fait hors-ligne
);

CREATE INDEX idx_scans_ticket ON scans (ticket_id);


-- ============================================================
-- 10. NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id),
  order_id          UUID REFERENCES orders(id),
  channel           notification_channel NOT NULL,
  type              VARCHAR(50) NOT NULL,  -- order_confirmation, event_reminder, cancellation...
  status            notification_status NOT NULL DEFAULT 'pending',
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 11. ABONNEMENT SAAS DE L'ORGANISATEUR
-- ============================================================

CREATE TABLE subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan                  subscription_plan NOT NULL,
  status                subscription_status NOT NULL DEFAULT 'active',
  current_period_start  TIMESTAMPTZ NOT NULL,
  current_period_end    TIMESTAMPTZ NOT NULL,
  price                 NUMERIC(12,2) NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 12. AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id     UUID REFERENCES users(id),
  organization_id   UUID REFERENCES organizations(id),
  action            VARCHAR(100) NOT NULL,  -- ex: 'employee.deleted', 'order.refunded'
  entity_type       VARCHAR(50) NOT NULL,
  entity_id         UUID,
  metadata          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- 13. ANTI-SURVENTE — RÉSERVATION ATOMIQUE DU QUOTA
-- ============================================================
-- Principe : quantity_sold sur ticket_types est incrémenté par un trigger
-- dès qu'une ligne "tickets" est créée (donc dès la réservation panier,
-- pas seulement au paiement confirmé). PostgreSQL verrouille implicitement
-- la ligne ticket_types pendant l'UPDATE, ce qui sérialise les insertions
-- concurrentes : deux acheteurs ne peuvent jamais réserver le dernier
-- billet en même temps, même sous forte charge (ex: ouverture des ventes).

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


-- Libération du quota si un billet est annulé/remboursé avant d'être utilisé
-- (ex: panier expiré, remboursement avant l'évènement). Un billet déjà
-- "used" ne libère pas sa place par défaut — à adapter selon votre politique
-- de revente de billets remboursés post-scan.

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


-- ============================================================
-- 14. ANTI-FRAUDE — VALIDATION ATOMIQUE D'UN SCAN (à faire côté API)
-- ============================================================
-- L'API de scan ne doit JAMAIS faire un SELECT de vérification puis un
-- UPDATE séparé (race condition possible si deux vigiles scannent le même
-- billet au même moment). Utiliser un UPDATE conditionnel unique :
--
--   UPDATE tickets
--      SET status = 'used', used_at = now()
--    WHERE id = :ticket_id AND status = 'valid'
--    RETURNING id;
--
-- Si la requête ne retourne aucune ligne, le billet est déjà utilisé,
-- annulé ou invalide → le scan doit être rejeté avec le message adapté.
-- Cette opération est atomique grâce au verrouillage de ligne natif de
-- PostgreSQL : même avec deux scans strictement simultanés, un seul des
-- deux UPDATE réussira, l'autre trouvera status != 'valid' et échouera.


-- ============================================================
-- 15. LIBÉRATION DES PANIERS EXPIRÉS (job planifié, ex. toutes les minutes)
-- ============================================================
--
--   UPDATE orders SET status = 'expired'
--    WHERE status = 'pending' AND expires_at < now();
--
--   UPDATE tickets SET status = 'cancelled'
--    WHERE status = 'pending_payment'
--      AND order_item_id IN (
--        SELECT oi.id FROM order_items oi
--        JOIN orders o ON o.id = oi.order_id
--        WHERE o.status = 'expired'
--      );
--
-- Cette dernière UPDATE déclenche automatiquement trg_release_ticket_capacity
-- et remet le stock à disposition des autres acheteurs.