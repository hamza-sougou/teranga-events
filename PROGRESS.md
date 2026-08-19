# Suivi d'avancement — Event Manager App

> Dernière mise à jour : 2026-08-18. Ce fichier est un instantané de suivi, à remettre à jour après chaque module (voir `CLAUDE.md`). Pour l'état exact du code, `git log` et le code lui-même font foi — ce document sert de vue d'ensemble rapide.

Branche `main`, à jour avec `origin/main`. Commits de modules jusqu'ici :
`DB Connection & Migrations Finished` → `Google OAuth Schema, RBAC, Classic Auth, Seeds & Tests` → `Events CRUD & API` → `Ticket Types Module` → `Teams Module` → `Progress.md file added` → `Stripe fully removed` → `Payment Module` → `Scan Module` → `Notifications Module` → **Stats Module (en attente de commit)**.

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

### 8. Module Notifications — **nouveau**
- **Trois déclencheurs** : confirmation de commande (`PaymentsService`, juste après le passage `PENDING → PAID`), annulation d'évènement (`EventsService.update`, uniquement lors d'une transition **vers** `CANCELLED` — une notification par commande `PAID`, protégé contre les doublons si le statut est réappliqué), invitation d'équipe (`TeamsService.invite`, comble la limite documentée du module teams où l'invité n'avait aucun moyen d'être prévenu).
- **Envoi asynchrone via balayage** : les points de déclenchement créent juste une ligne `notifications` (`PENDING`) — rapide, aucune dépendance externe sur le chemin critique (webhook, checkout). `NotificationsDispatchJob` (`@Cron` chaque minute, même cadence que `OrdersExpirationJob`) envoie réellement les emails et marque `SENT`/`FAILED` ; un échec n'interrompt jamais le traitement des autres notifications du lot.
- **`EventReminderJob`** (`@Cron` toutes les heures) : crée une notification `event_reminder` par commande payée dont l'évènement démarre dans les 24h, idempotent par requête d'existence (pas de nouvelle colonne).
- **Email seul implémenté** (`nodemailer`, déjà en dépendance) ; `SmsChannel` reste un stub explicite (lève une erreur si jamais appelé) — aucun fournisseur SMS n'est configuré dans le projet, même traitement que `CinetpayProvider` pendant le module paiement.
- Pas de nouvel endpoint HTTP — mécanisme de fond, inspection via la table `notifications` directement pendant cette passe.
- Tests e2e : `notifications.e2e-spec.ts` (6 tests) — création de notification, envoi réussi, échec isolé sans bloquer le lot, annulation d'évènement (avec/sans commandes payées, non-duplication), rappel d'évènement (fenêtre 24h, non-duplication), invitation d'équipe.
- Au passage, un bug pré-existant corrigé (pas lié aux notifications elles-mêmes) : `notifications.user_id`/`order_id` n'ont pas de cascade vers `users`/`orders` — le nettoyage de `teams.e2e-spec.ts` et `payments-webhook.e2e-spec.ts` ne supprimait pas les notifications avant les lignes qu'elles référencent (même famille de bug que celui trouvé pendant le module Scan).

### 9. Module Stats (tableau de bord) — **nouveau**
- `GET /organizations/:organizationId/events/:eventId/stats` : capacité (réservée/totale via `quantity_sold`, déjà maintenu par le trigger anti-survente — pas recalculé), taux de remplissage, répartition des billets par statut, revenus (brut payé par le client / part organisateur / commission plateforme — ne comptent que les commandes `PAID`), détail par type de billet, statut du reversement s'il existe.
- `GET /organizations/:organizationId/stats` : agrégat sur tous les évènements de l'organisation (comptage par statut, revenus cumulés).
- `GET /organizations/:organizationId/events/:eventId/orders/export` : export CSV des commandes de l'évènement (construit à la main, pas de nouvelle dépendance).
- RBAC : `ALL_MEMBER_ROLES` en lecture pour les trois endpoints — pas de masquage de champs par rôle, cohérent avec `GET .../orders`/`GET .../scans` déjà en place.
- **Stats "Vendeur" volontairement absentes** : `orders.seller_id` existe en base mais aucun flux actuel ne le renseigne (vente terrain assistée hors-scope du module paiement) — une vue "mes ventes" n'aurait aucune donnée réelle à afficher pour l'instant.
- Tests e2e : `stats.e2e-spec.ts` (6 tests) — capacité/revenus/répartition avec commandes mixtes (payées/en attente/annulées), évènement vide, agrégat organisation, export CSV, isolation inter-organisation, accès refusé sans membership.

### 10. État global des tests
**87/87 tests automatisés passent** : 7 unitaires + 80 e2e répartis sur 12 suites (`app`, `auth`, `events`, `ticket-capacity`, `ticket-types`, `teams`, `orders`, `payments-webhook`, `payouts`, `scan`, `notifications`, `stats`), contre une vraie base PostgreSQL locale.

### 11. Documentation
- `docs/SPEC.md` — spec produit/technique à jour (PayDunya comme unique prestataire actif, modèle de commission, règle de reversement).
- `docs/MODULE_PAIEMENT_SPEC.md` — spec technique complète du module Vente & Paiement, implémentée et vérifiée.
- `CLAUDE.md` — règles de travail et stack à jour, avec la règle de reversement organisateur ajoutée aux invariants critiques.

---

## 🚧 Ce qu'il reste à faire

### Backend — ce qui reste
- **Codes promo** (`promo_codes` existe en base, aucune logique applicative) — Phase 2 du roadmap, à ne pas anticiper avant la fin de la Phase 1.
- **Ticket-holder détaillé** (`holder_name`/`holder_email` par billet, billets nominatifs) — hors-scope assumé de la passe paiement, à ajouter si besoin.
- **SMS** (`SmsChannel`) — aucun fournisseur configuré, stub explicite pour l'instant.
- **Annulation de commande individuelle** — le type `cancellation` du module notifications ne couvre que l'annulation d'un évènement entier ; aucun flux de remboursement/annulation d'une commande payée après coup n'existe encore (`docs/MODULE_PAIEMENT_SPEC.md` §0, hors-scope assumé).

### Infrastructure non configurée
- **Redis** — dépendance `ioredis` présente, `REDIS_URL` dans `.env.example`, mais pas encore utilisé.
- **Stockage fichiers (S3 / Cloudflare R2)** — pas encore configuré (images d'évènements, exports).
- **Hébergement / déploiement** (DigitalOcean / Render) — aucune configuration CI/CD ni déploiement pour l'instant.
- **PayDunya en mode `live`** — actuellement en mode `test` (sandbox) avec des clés de test ; passage en production à faire une fois l'activité réelle prête à démarrer.

### Frontend web (`web/`)
- Arborescence Next.js scaffoldée (pages admin/organisateur/checkout/login/auth callback) mais **contenu non implémenté** — essentiellement des placeholders. Aucune page n'est encore connectée aux endpoints backend existants (events, ticket-types, teams, orders/checkout).

### Mobile (Flutter)
- **Non démarré.** Trois surfaces prévues par la spec : app Organisateur (web+mobile), app Scan dédiée (Contrôleur, offline-first), wallet Participant optionnel (Phase 3).

### Ordre du roadmap `CLAUDE.md` — **terminé**
```
DB ✅ → Auth/rôles ✅ → Events ✅ → Ticket types ✅ → Orders/Payments ✅ → Scan ✅ → Notifications ✅
```
Tous les modules de la séquence explicite `CLAUDE.md` sont livrés et testés (Teams et le reversement organisateur traités en parallèle). Ce qui reste pour un MVP complet, sans ordre imposé par `CLAUDE.md` : **Stats** (dashboard), connecter le **frontend web** aux endpoints déjà prêts, et démarrer le **mobile Flutter**.
