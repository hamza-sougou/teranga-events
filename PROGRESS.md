# Suivi d'avancement — Event Manager App

> Dernière mise à jour : 2026-08-18. Ce fichier est un instantané de suivi, à remettre à jour après chaque module (voir `CLAUDE.md`). Pour l'état exact du code, `git log` et le code lui-même font foi — ce document sert de vue d'ensemble rapide.

Branche `main`, à jour avec `origin/main`. 5 commits de modules jusqu'ici :
`DB Connection & Migrations Finished` → `Google OAuth Schema, RBAC, Classic Auth, Seeds & Tests` → `Events CRUD & API` → `Ticket Types Module` → `Teams Module`.

---

## ✅ Ce qui est géré

### 1. Base de données (`db/schema.sql` + `backend/prisma/`)
- Schéma PostgreSQL complet : `users`, `organizations`, `organization_members`, `events`, `ticket_types`, `ticket_type_whitelist`, `promo_codes`, `orders`, `order_items`, `tickets`, `payments`, `scans`, `notifications`, `subscriptions`, `audit_logs`.
- Les deux triggers métier critiques en place et hand-maintained : `fn_reserve_ticket_capacity` (anti-survente) et `fn_release_ticket_capacity` (libération de stock à l'expiration).
- 3 migrations appliquées : `init`, `add_google_auth`, `remove_stripe_payment_provider` (l'enum `payment_provider` ne contient plus que `cinetpay`, `paydunya`, `intouch`).
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

### 6. État global des tests
**48/48 tests automatisés passent** : 7 unitaires + 41 e2e répartis sur 6 suites (`app`, `auth`, `events`, `ticket-capacity`, `ticket-types`, `teams`), contre une vraie base PostgreSQL locale.

### 7. Documentation
- `docs/SPEC.md` — spec produit/technique à jour (Stripe retiré, CinetPay comme unique prestataire actif).
- `docs/MODULE_PAIEMENT_SPEC.md` — plan détaillé et validé pour le futur module Vente & Paiement (flux panier→CinetPay→confirmation, webhook, idempotence, cas limites), prêt à être implémenté dès que le module paiement reprend.
- `CLAUDE.md` — règles de travail et stack à jour.

---

## 🚧 Ce qu'il reste à faire

### Backend — modules non démarrés (squelettes vides uniquement)
- **Orders / Payments** (`src/orders/`, `src/payments/`) — **en pause**, en attente de la validation du compte CinetPay. Plan déjà écrit dans `docs/MODULE_PAIEMENT_SPEC.md`. À faire au moment de la reprise :
  - Implémenter le flux panier → checkout → paiement CinetPay → confirmation.
  - Webhook CinetPay avec re-vérification server-to-server (jamais confiance dans le payload direct) + idempotence.
  - Job planifié d'expiration des paniers (`orders-expiration.job.ts` n'a qu'un squelette `@Cron` vide actuellement).
  - ~~Nettoyage Stripe~~ — fait le 2026-08-18 : `stripe.provider.ts` supprimé, retiré de `payments.module.ts`/`payments.service.ts`, dépendance npm `stripe` désinstallée. Plus aucune référence dans le code.
- **Tickets** (`src/tickets/`) — génération QR code (dépendance `qrcode` déjà installée, non utilisée), téléchargement/consultation du billet.
- **Scan** (`src/scan/`) — endpoint de scan anti-fraude (`UPDATE` conditionnel unique, jamais `SELECT` + `UPDATE`), pensé offline-first côté mobile.
- **Notifications** (`src/notifications/`) — email/SMS (canaux `email.channel.ts`/`sms.channel.ts` vides), confirmation d'achat, rappel, annulation. Nécessaire aussi pour prévenir les invités du module teams (actuellement sans notification, limite MVP assumée).
- **Stats** (`src/stats/`) — tableau de bord : ventes temps réel, taux de remplissage, exports.
- **Codes promo** (`promo_codes` existe en base, aucune logique applicative) — Phase 2 du roadmap, à ne pas anticiper avant la fin de la Phase 1.

### Infrastructure non configurée
- **Redis** — dépendance `ioredis` présente, `REDIS_URL` dans `.env.example`, mais pas encore utilisé (utile pour les jobs planifiés/queues du module paiement).
- **Stockage fichiers (S3 / Cloudflare R2)** — pas encore configuré (images d'évènements, exports).
- **Hébergement / déploiement** (DigitalOcean / Render) — aucune configuration CI/CD ni déploiement pour l'instant.

### Frontend web (`web/`)
- Arborescence Next.js scaffoldée (pages admin/organisateur/checkout/login/auth callback) mais **contenu non implémenté** — environ 190 lignes au total sur l'ensemble des pages, essentiellement des placeholders. Aucune page n'est encore connectée aux endpoints backend existants (events, ticket-types, teams).

### Mobile (Flutter)
- **Non démarré.** Trois surfaces prévues par la spec : app Organisateur (web+mobile), app Scan dédiée (Contrôleur, offline-first), wallet Participant optionnel (Phase 3).

### Ordre du roadmap restant (`CLAUDE.md`)
```
DB ✅ → Auth/rôles ✅ → Events ✅ → Ticket types ✅ → Orders/Payments 🚧 (en pause) → Scan ⬜ → Notifications ⬜
```
Teams a été traité en parallèle (indépendant des paiements). Prochain module logique une fois CinetPay validé : reprendre **Orders/Payments** sur la base de `docs/MODULE_PAIEMENT_SPEC.md`. En attendant, **Tickets** (génération QR, dépend d'`orders` pour le passage `pending_payment` → `valid`) reste bloqué par les paiements ; en revanche un module indépendant comme le début du **frontend web** (connecter les pages existantes aux endpoints déjà prêts : events, ticket-types, teams) pourrait avancer sans attendre.
