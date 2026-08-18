# Suivi d'avancement — Event Manager App

> Dernière mise à jour : 2026-08-18. Ce fichier est un instantané de suivi, à remettre à jour après chaque module (voir `CLAUDE.md`). Pour l'état exact du code, `git log` et le code lui-même font foi — ce document sert de vue d'ensemble rapide.

Branche `main`, à jour avec `origin/main`. Commits de modules jusqu'ici :
`DB Connection & Migrations Finished` → `Google OAuth Schema, RBAC, Classic Auth, Seeds & Tests` → `Events CRUD & API` → `Ticket Types Module` → `Teams Module` → `Progress.md file added` → `Stripe fully removed` → `Payment Module` → **Scan Module (en attente de commit)**.

---

## ✅ Ce qui est géré

### 1. Base de données (`db/schema.sql` + `backend/prisma/`)
- Schéma PostgreSQL complet : `users`, `organizations`, `organization_members`, `events`, `ticket_types`, `ticket_type_whitelist`, `promo_codes`, `orders`, `order_items`, `tickets`, `payments`, `payouts`, `scans`, `notifications`, `subscriptions`, `audit_logs`.
- Les deux triggers métier critiques en place et hand-maintained : `fn_reserve_ticket_capacity` (anti-survente) et `fn_release_ticket_capacity` (libération de stock à l'expiration).
- 4 migrations appliquées : `init`, `add_google_auth`, `remove_stripe_payment_provider`, `add_payouts_and_order_fees` (colonnes `orders.subtotal_amount`/`service_fee_amount` + CHECK `chk_orders_total_equals_parts`, table `payouts`, `organizations.payout_phone_number`).
- `chk_users_auth_method` (CHECK : mot de passe OU Google id) et le reste des contraintes `CHECK` répliquées à la main dans les migrations Prisma, comme prévu par `CLAUDE.md`.

### 2. Auth & rôles
- Auth classique email/mot de passe (bcrypt) + **Google OAuth** ("Se connecter avec Google"), avec liaison automatique par email si un compte existe déjà.
- Première connexion Google → création automatique d'une organisation placeholder + membership `OWNER`.
- JWT (payload minimal `{ sub: userId }`, utilisateur re-fetché à chaque requête → désactivation immédiate).
- RBAC par organisation : enum `MemberRole` (`OWNER, CO_ORGANIZER, SELLER, CONTROLLER, ACCOUNTANT`), `OrganizationRolesGuard` + décorateur `@OrgRoles(...)`, flag global `users.is_super_admin`.
- Script de seed pour le compte Super Admin.
- Tests : suite `auth.e2e-spec.ts` + `organization-roles.guard.spec.ts` (7 tests unitaires).

### 3. Module Events
- CRUD complet côté organisateur (org-scopé, RBAC), endpoints publics séparés (`PublicEventsController`) pour la page évènement sans authentification.
- Machine à états `Event.status` via table de transitions autorisées.
- Tests e2e : `events.e2e-spec.ts` (9 tests).

### 4. Module Ticket Types
- CRUD des types de billets imbriqué sous un évènement, incluant standard/VIP/early-bird/**prévente**/groupe.
- Fenêtre `sale_start`/`sale_end` + `access_mode` (`public` / `presale_whitelist`) pour les préventes, table `ticket_type_whitelist`.
- Double validation (application + CHECK SQL) sur les invariants (`quantity_sold <= quantity_total`, cohérence des dates).
- **Test de concurrence anti-survente** : deux achats simultanés du dernier billet → un seul réussit (`ticket-capacity.e2e-spec.ts`).
- Tests e2e : `ticket-types.e2e-spec.ts` (10 tests).

### 5. Module Teams (gestion des équipes)
- Invitation par email avec rôle (`CO_ORGANIZER, SELLER, CONTROLLER, ACCOUNTANT` — jamais `OWNER`), y compris pour un email qui n'a pas encore de compte (création d'un utilisateur placeholder, activé via connexion Google).
- Ligne `OWNER` immuable (ni modifiable, ni supprimable) via ce module.
- Double surface : `organizations/:id/members` (vue organisateur) et `users/me/invitations` (accepter/refuser côté invité).
- Tests e2e : `teams.e2e-spec.ts` (12 tests).

### 6. Module Vente & Paiement (PayDunya) — **nouveau**
- **Checkout** : `POST /orders/preview` (aperçu de prix sans effet de bord) et `POST /orders` (panier → transaction Order+OrderItems+Tickets → création facture PayDunya réelle → réponse avec `paymentUrl`). Rollback complet si quota insuffisant (409) ou si l'appel PayDunya échoue (503, commande annulée, quota libéré).
- **Commission dynamique** (`PricingService.quoteCheckout`) : 5% de marge nette pour Zen Events quel que soit le canal (mobile money/carte/Djamo), formule isolée pour absorber les frais PayDunya des deux côtés (payin + payout).
- **`calculatePayoutAmount()`** isolée dans son propre fichier, portant explicitement l'hypothèse non confirmée par PayDunya sur le sens de déduction des frais de payout (un seul endroit à corriger si la réponse du support contredit l'hypothèse actuelle).
- **Webhook IPN** (`POST /payments/webhooks/paydunya`) : vérification par hash SHA-512 de la masterKey (comparaison en temps constant), puis re-confirmation server-to-server via `CheckoutInvoice#confirm` (jamais confiance dans le payload entrant), idempotence complète (`UPDATE` conditionnel `PENDING→PAID`, même pattern que l'anti-fraude scan).
- **`PaydunyaProvider`** écrit après inspection directe du SDK réel (`node_modules/paydunya`, aucun type publié) — `createInvoice`/`confirmInvoice`/`disburse` correspondent à l'API réelle, pas à une supposition.
- **Reversement organisateur** (nouveau module `payouts/`) : job quotidien + déclenchement manuel Super Admin, un reversement par évènement terminé (`UNIQUE(event_id)` en base), exclut automatiquement les évènements annulés, retry possible sur échec de déboursement.
- **Vérifié en conditions quasi réelles** : test manuel complet via tunnel `ngrok` avec les vraies clés sandbox PayDunya — paiement réel effectué côté PayDunya (5 475 FCFA débités), IPN reçu et traité, `order.status → PAID`, `tickets → VALID` confirmés en base.
- Tests e2e : `orders.e2e-spec.ts` (6), `payments-webhook.e2e-spec.ts` (5), `payouts.e2e-spec.ts` (7) — couvrent les 11 cas limites du plan (hash invalide, IPN dupliqué/concurrent, webhook tardif après expiration, montant divergent, double déclenchement de reversement, évènement annulé, déboursement échoué et retenté).

### 7. Module Scan (contrôle d'accès) — **nouveau**
- `POST /organizations/:organizationId/events/:eventId/scan` : un seul `UPDATE` SQL conditionnel (`$queryRaw`, jamais `SELECT` + `UPDATE` séparés) qui vérifie en une requête billet valide + bon évènement + évènement ni annulé ni terminé — c'est la deuxième règle "critique" de `CLAUDE.md` après l'anti-survente.
- Réponse toujours `200`, résultat discriminé dans le corps (`SUCCESS`/`ALREADY_USED`/`INVALID`/`EXPIRED_EVENT`) plutôt que des codes HTTP différents par cas — pensé pour une future app mobile qui n'a pas à brancher sur le status code.
- `GET /organizations/:organizationId/events/:eventId/scans` pour l'historique. RBAC : `OWNER, CO_ORGANIZER, CONTROLLER`.
- Limite assumée : `scans.ticket_id` est `NOT NULL` en base — un jeton totalement inconnu (pas juste invalide) ne peut pas être journalisé dans `scans`, seulement loggé côté application.
- **Mode offline explicitement hors-scope** (Phase 2 du roadmap `docs/SPEC.md`) — `scans.synced_at` reste `null`, pas d'endpoint de synchro batch pour l'instant.
- Tests e2e : `scan.e2e-spec.ts` (9 tests), dont le **test de concurrence obligatoire** (deux scans simultanés du même billet → un seul `SUCCESS`).
- Au passage, deux bugs pré-existants corrigés (pas liés au scan lui-même) : le nettoyage des tests `orders`/`payments`/`payouts` ne supprimait pas les `scans` avant les `orders` (violation de clé étrangère silencieuse qui bloquait Jest indéfiniment), et `payments-webhook.e2e-spec.ts` calculait le hash IPN avec une `PAYDUNYA_MASTER_KEY` vide codée en dur au lieu de la lire dynamiquement — cassé dès que la vraie clé sandbox a été renseignée dans `.env`.

### 8. État global des tests
**75/75 tests automatisés passent** : 7 unitaires + 68 e2e répartis sur 10 suites (`app`, `auth`, `events`, `ticket-capacity`, `ticket-types`, `teams`, `orders`, `payments-webhook`, `payouts`, `scan`), contre une vraie base PostgreSQL locale.

### 9. Documentation
- `docs/SPEC.md` — spec produit/technique à jour (PayDunya comme unique prestataire actif, modèle de commission, règle de reversement).
- `docs/MODULE_PAIEMENT_SPEC.md` — spec technique complète du module Vente & Paiement, implémentée et vérifiée.
- `CLAUDE.md` — règles de travail et stack à jour, avec la règle de reversement organisateur ajoutée aux invariants critiques.

---

## 🚧 Ce qu'il reste à faire

### Backend — modules non démarrés (squelettes vides uniquement)
- **Notifications** (`src/notifications/`) — email/SMS (canaux `email.channel.ts`/`sms.channel.ts` vides), confirmation d'achat, rappel, annulation. Nécessaire aussi pour prévenir les invités du module teams (actuellement sans notification, limite MVP assumée).
- **Stats** (`src/stats/`) — tableau de bord : ventes temps réel, taux de remplissage, exports.
- **Codes promo** (`promo_codes` existe en base, aucune logique applicative) — Phase 2 du roadmap, à ne pas anticiper avant la fin de la Phase 1.
- **Ticket-holder détaillé** (`holder_name`/`holder_email` par billet, billets nominatifs) — hors-scope assumé de la passe paiement, à ajouter si besoin.

### Infrastructure non configurée
- **Redis** — dépendance `ioredis` présente, `REDIS_URL` dans `.env.example`, mais pas encore utilisé.
- **Stockage fichiers (S3 / Cloudflare R2)** — pas encore configuré (images d'évènements, exports).
- **Hébergement / déploiement** (DigitalOcean / Render) — aucune configuration CI/CD ni déploiement pour l'instant.
- **PayDunya en mode `live`** — actuellement en mode `test` (sandbox) avec des clés de test ; passage en production à faire une fois l'activité réelle prête à démarrer.

### Frontend web (`web/`)
- Arborescence Next.js scaffoldée (pages admin/organisateur/checkout/login/auth callback) mais **contenu non implémenté** — essentiellement des placeholders. Aucune page n'est encore connectée aux endpoints backend existants (events, ticket-types, teams, orders/checkout).

### Mobile (Flutter)
- **Non démarré.** Trois surfaces prévues par la spec : app Organisateur (web+mobile), app Scan dédiée (Contrôleur, offline-first), wallet Participant optionnel (Phase 3).

### Ordre du roadmap restant (`CLAUDE.md`)
```
DB ✅ → Auth/rôles ✅ → Events ✅ → Ticket types ✅ → Orders/Payments ✅ → Scan ✅ → Notifications ⬜
```
Teams et le reversement organisateur ont été traités en parallèle (indépendants du reste). Prochain module logique : **Notifications** (email/SMS — confirmation d'achat, rappel, annulation), seul module Phase 1 restant dans l'ordre du roadmap. Après ça, il ne reste que Stats et le reste du frontend/mobile pour compléter le MVP.
