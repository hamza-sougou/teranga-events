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

-- Paramètres optionnels d'évènement (section 4C) : à qui s'adresse une entrée
-- de dress code. La limite de 3 entrées par valeur (compartiments
-- indépendants, pas de comptage croisé) est validée côté application
-- (EventsService), volontairement pas en CHECK/trigger SQL — contrainte
-- cosmétique, pas critique comme l'anti-survente ou l'anti-fraude scan.
CREATE TYPE dress_code_audience AS ENUM ('everyone', 'men', 'women');

-- Mise en avant d'évènement (section 4D, page d'accueil "Sponsorisés") —
-- entièrement pilotée par le Super Admin pour le MVP.
CREATE TYPE promotion_type AS ENUM ('featured', 'sponsored');

CREATE TYPE ticket_category AS ENUM ('standard', 'vip', 'early_bird', 'presale', 'group');

CREATE TYPE ticket_access_mode AS ENUM ('public', 'presale_whitelist', 'private_link');

-- pending_payment : réservé pendant le checkout, avant confirmation du paiement
CREATE TYPE ticket_status AS ENUM ('pending_payment', 'valid', 'used', 'cancelled', 'refunded');

CREATE TYPE order_status AS ENUM ('pending', 'paid', 'cancelled', 'refunded', 'expired');

CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed');

CREATE TYPE payment_provider AS ENUM ('cinetpay', 'paydunya', 'intouch');

CREATE TYPE discount_type AS ENUM ('percent', 'fixed');

CREATE TYPE scan_result AS ENUM ('success', 'already_used', 'invalid', 'expired_event');

CREATE TYPE notification_channel AS ENUM ('email', 'sms', 'push');

CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');

CREATE TYPE subscription_plan AS ENUM ('starter', 'pro', 'enterprise');

CREATE TYPE subscription_status AS ENUM ('active', 'past_due', 'cancelled');

-- Reversement (payout) vers l'organisateur, après la fin de l'évènement —
-- voir section 8B pour la règle métier complète.
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'paid', 'failed');


-- ============================================================
-- 2. UTILISATEURS
-- ============================================================

-- password_hash est nullable : un compte créé via Google OAuth n'a pas de
-- mot de passe local. google_id est nullable pour le cas inverse (compte
-- classique jamais lié à Google). Le CHECK ci-dessous garantit qu'il reste
-- toujours au moins une méthode d'authentification utilisable.
--
-- Vérification email (compte classique uniquement — un compte Google a déjà
-- prouvé la possession de l'email, email_verified_at y est posé immédiatement
-- à la création, jamais de code généré) : un seul code actif à la fois donc
-- colonnes directement sur users plutôt qu'une table séparée (pas d'historique
-- de codes à conserver). email_verification_attempts plafonne le bruteforce
-- d'un code à 6 chiffres ; au-delà de la limite applicative, le code est
-- traité comme invalidé jusqu'à un renvoi (voir AuthService).
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT,
  google_id       TEXT UNIQUE,
  full_name       VARCHAR(150) NOT NULL,
  is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  email_verified_at    TIMESTAMPTZ,
  -- Preuve d'acceptation CGU : un horodatage, pas juste un booléen — c'est la
  -- preuve de consentement à conserver. Jamais rétro-rempli pour les comptes
  -- créés avant l'existence de ce mécanisme (voir migration add_email_verification)
  -- : fabriquer une date de consentement qui n'a jamais eu lieu serait
  -- malhonnête, contrairement au rétro-remplissage de email_verified_at qui
  -- répond à une question d'accès opérationnel, pas de preuve.
  terms_accepted_at    TIMESTAMPTZ,
  marketing_opt_in     BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_code_hash          TEXT,
  email_verification_code_expires_at    TIMESTAMPTZ,
  email_verification_attempts           INTEGER NOT NULL DEFAULT 0,
  -- 2FA TOTP (Super Admin uniquement, obligatoire pour ce rôle — voir
  -- docs/SPEC.md §10.7). totp_secret est posé dès l'étape de configuration,
  -- avant toute vérification réussie ; totp_enabled_at ne l'est qu'après un
  -- premier code validé — c'est ce dernier champ qui distingue "en cours de
  -- configuration" de "actif" (permet de relancer la configuration sans
  -- rester bloqué si le jeton temporaire expire avant la vérification).
  -- totp_failed_attempts/totp_locked_until forment un verrou par compte,
  -- indépendant du @Throttle par IP : un code TOTP tourne en continu
  -- (contrairement au code email à durée de vie fixe), donc pas de valeur
  -- unique à épuiser comme pour email_verification_attempts.
  -- totp_recovery_code_hashes : codes de secours à usage unique, hachés,
  -- générés une seule fois à la configuration — un seul compte Super Admin
  -- existe et aucun autre mécanisme de récupération 2FA n'est en place.
  totp_secret               TEXT,
  totp_enabled_at           TIMESTAMPTZ,
  totp_recovery_code_hashes TEXT[] NOT NULL DEFAULT '{}',
  totp_failed_attempts      INTEGER NOT NULL DEFAULT 0,
  totp_locked_until         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_users_auth_method CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL),
  CONSTRAINT chk_users_totp_enabled_requires_secret CHECK (totp_secret IS NOT NULL OR totp_enabled_at IS NULL)
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
  suspended_at      TIMESTAMPTZ, -- gel Super Admin (fraude avérée) : bloque toute action org-scopée + achat + visibilité publique, voir OrganizationRolesGuard
  payout_phone_number VARCHAR(20), -- numéro mobile money pour le reversement PayDunya (API Déboursement, section 8B)
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
-- 3B. CATÉGORIES D'ÉVÈNEMENT (référence)
-- ============================================================
-- Table à plat (pas de sous-catégories) remplaçant l'ancien events.category en
-- texte libre — deux organisateurs créant un évènement de même nature
-- écrivaient des valeurs différentes ("concert de jazz" vs "concert de rap"),
-- ce qui cassait tout filtre/tri par catégorie. is_active permet de retirer
-- une catégorie du sélecteur sans supprimer la ligne (et donc sans casser les
-- évènements existants qui la référencent).

CREATE TABLE event_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        VARCHAR(50) UNIQUE NOT NULL,
  label       VARCHAR(50) NOT NULL,
  icon        VARCHAR(50) NOT NULL,   -- nom d'icône Iconify/Lucide, ex: 'music'
  color_token VARCHAR(20) NOT NULL,   -- un des tokens --cat-* de docs/DESIGN_SYSTEM.md
  sort_order  INTEGER NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_event_categories_color_token
    CHECK (color_token IN ('indigo', 'amber', 'emerald', 'rose', 'orange', 'teal'))
);

INSERT INTO event_categories (slug, label, icon, color_token, sort_order) VALUES
  ('concert',    'Concert',    'music',        'indigo',  1),
  ('festival',   'Festival',   'sparkles',     'amber',   2),
  ('soiree',     'Soirée',     'moon',         'rose',    3),
  ('ceremonie',  'Cérémonie',  'award',        'emerald', 4),
  ('theatre',    'Théâtre',    'drama',        'teal',    5),
  ('conference', 'Conférence', 'presentation', 'orange',  6),
  ('sport',      'Sport',      'trophy',       'indigo',  7),
  ('autre',      'Autre',      'shapes',       'amber',   8);


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
  -- Géolocalisation (recherche OpenStreetMap/Nominatim en développement,
  -- Google Maps prévu en production derrière la même interface backend —
  -- voir backend/src/geocoding/). latitude/longitude toujours pairées
  -- (jamais l'une sans l'autre), voir chk_events_lat_lng_paired ci-dessous.
  country           VARCHAR(100),
  city              VARCHAR(100),
  latitude          DECIMAL(9,6),
  longitude         DECIMAL(9,6),
  category_id       UUID REFERENCES event_categories(id),
  status            event_status NOT NULL DEFAULT 'draft',
  -- Paramètres optionnels : âge minimum requis, NULL = tout le monde. Pas de
  -- champ séparé pour un raccourci "18+" — c'est juste min_age = 18, un
  -- raccourci d'interface côté frontend, pas une structure de données à part.
  min_age           INTEGER,
  start_at          TIMESTAMPTZ NOT NULL,
  end_at            TIMESTAMPTZ NOT NULL,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Rempli au moment de la transition draft -> published (EventsService.update),
  -- jamais à la création du brouillon — distinct de created_at, qui peut
  -- précéder la publication de plusieurs semaines. Voir docs/SPEC.md §9.3.
  published_at      TIMESTAMPTZ,

  CHECK (end_at > start_at),
  CONSTRAINT chk_events_lat_lng_paired CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE INDEX idx_events_org_status ON events (organization_id, status);


-- ============================================================
-- 4B. MÉDIAS DES ÉVÈNEMENTS (images, vidéos)
-- ============================================================
-- Relation one-to-many : un évènement peut avoir plusieurs images et
-- plusieurs vidéos. Stockage sur Cloudflare R2 (compatible S3), upload direct
-- client → R2 via URL présignée (jamais de transit par le backend, surtout
-- pour les vidéos) — voir docs/INFRASTRUCTURE.md section 7. `size_bytes` et
-- `mime_type` sont redéclarés par le client au moment de la confirmation
-- d'upload, puis revérifiés côté serveur via une requête HEAD sur l'objet R2
-- avant d'insérer la ligne ici — jamais seulement déclarés.
--
-- Au moins une image est requise, mais seulement pour passer un évènement en
-- statut 'published' (jamais bloquant pour un brouillon) — voir la logique de
-- transition de statut dans backend/src/events/events.service.ts.

CREATE TYPE event_media_type AS ENUM ('image', 'video');

CREATE TABLE event_media (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type               event_media_type NOT NULL,
  storage_key        TEXT NOT NULL,          -- clé objet R2, ex: events/{eventId}/{uuid}.jpg
  url                TEXT NOT NULL,          -- URL publique (R2_PUBLIC_URL + storage_key)
  mime_type          VARCHAR(100) NOT NULL,
  size_bytes         INTEGER NOT NULL,
  original_filename  TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (size_bytes > 0)
);

CREATE INDEX idx_event_media_event ON event_media (event_id);


-- ============================================================
-- 4C. DRESS CODE DES ÉVÈNEMENTS (paramètres optionnels)
-- ============================================================
-- Une entrée = un libellé (ex: "Costume", "Robe longue") rattaché à une
-- catégorie de public. Règle : maximum 3 entrées par valeur de applies_to,
-- les trois compartiments (everyone/men/women) sont indépendants — pas de
-- comptage croisé, donc jusqu'à 9 lignes au total par évènement. Validée
-- côté application (EventsService), volontairement PAS en CHECK/trigger SQL
-- ici — voir le commentaire sur dress_code_audience plus haut.

CREATE TABLE event_dress_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       VARCHAR(25) NOT NULL,
  applies_to  dress_code_audience NOT NULL DEFAULT 'everyone',
  sort_order  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_event_dress_codes_event ON event_dress_codes (event_id);


-- ============================================================
-- 4D. MISE EN AVANT DES ÉVÈNEMENTS (page d'accueil, section "Sponsorisés")
-- ============================================================
-- Entièrement pilotée par le Super Admin pour le MVP — pas de self-service
-- payant, aucune logique de facturation branchée sur subscriptions. Bornée
-- dans le temps (starts_at/ends_at) plutôt qu'un simple booléen : une mise
-- en avant expirée sort automatiquement de la sélection, pas de nettoyage
-- manuel à faire. Voir docs/SPEC.md §9.2.

CREATE TABLE event_promotions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type        promotion_type NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),  -- le Super Admin qui l'a activée
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at)
);

CREATE INDEX idx_event_promotions_event ON event_promotions (event_id);
CREATE INDEX idx_event_promotions_window ON event_promotions (type, starts_at, ends_at);


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
  -- Part organisateur (= somme des order_items, prix fixé par l'organisateur)
  -- et commission Zen Events (incluant le tampon de frais PayDunya) — voir
  -- SPEC.md section 5.5/5.6. total_amount reste le montant réellement
  -- facturé au client et doit toujours égaler la somme des deux.
  subtotal_amount    NUMERIC(12,2) NOT NULL CHECK (subtotal_amount >= 0),
  service_fee_amount NUMERIC(12,2) NOT NULL CHECK (service_fee_amount >= 0),
  total_amount      NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  currency          CHAR(3) NOT NULL DEFAULT 'XOF',
  expires_at        TIMESTAMPTZ NOT NULL,  -- fin de la réservation panier (ex: +15 min)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_orders_total_equals_parts CHECK (total_amount = subtotal_amount + service_fee_amount)
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
-- 8B. REVERSEMENTS AUX ORGANISATEURS (PAYOUTS)
-- ============================================================
-- Un reversement par évènement, déclenché uniquement une fois l'évènement
-- terminé (jamais en temps réel ni sur une base périodique — voir
-- SPEC.md section 6). amount_due = somme des subtotal_amount des commandes
-- payées de l'évènement. UNIQUE (event_id) empêche par construction un
-- double déboursement pour le même évènement, même en cas de double
-- déclenchement concurrent du job (même logique de garde-fou DB que
-- l'anti-survente).

CREATE TABLE payouts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  event_id                UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  amount_due              NUMERIC(12,2) NOT NULL CHECK (amount_due >= 0),
  amount_paid             NUMERIC(12,2),
  status                  payout_status NOT NULL DEFAULT 'pending',
  provider_transaction_id TEXT,          -- référence du déboursement PayDunya (API PUSH)
  raw_response            JSONB,
  triggered_at            TIMESTAMPTZ,   -- horodatage de l'appel à l'API Déboursement
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (event_id)
);

CREATE INDEX idx_payouts_organization ON payouts (organization_id);
CREATE INDEX idx_payouts_status ON payouts (status);


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