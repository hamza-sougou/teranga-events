# Suivi d'avancement — Event Manager App

> Dernière mise à jour : 2026-08-22. Ce fichier est un instantané de suivi, à remettre à jour après chaque module ou page frontend (voir `CLAUDE.md`). Pour l'état exact du code, `git log` et le code lui-même font foi — ce document sert de vue d'ensemble rapide.

Branche `main`. Commits de modules jusqu'ici :
`DB Connection & Migrations Finished` → `Google OAuth Schema, RBAC, Classic Auth, Seeds & Tests` → `Events CRUD & API` → `Ticket Types Module` → `Teams Module` → `Progress.md file added` → `Stripe fully removed` → `Payment Module` → `Scan Module` → `Notifications Module` → `Statistics Module Completed` → `Docker Config & App Health` (Infrastructure Phase 1) → `Organizer Dashboard`.

Frontend : socle (design tokens, React Query, client API) + page **Tableau de bord organisateur** (première page du frontend web) + convention icônes **Iconify**, testés manuellement et commités.

**Non commité pour l'instant** (travail terminé et vérifié, en attente de test manuel + commit par l'utilisateur) : page **Création / édition d'évènement** (2ᵉ page organisateur — liste `/dashboard/events`, création `/dashboard/events/new`, édition `/dashboard/events/[id]` avec types de billets et gestion de liste blanche prévente), plus les primitifs de formulaire réutilisables (`Input`, `Textarea`, `Select`, `FormField`, `Modal`, `InlineBanner`) qui l'accompagnent — voir section 12bis ci-dessous. S'y ajoute désormais le module **Médias évènements (Cloudflare R2)** backend + frontend — voir section 3B et le complément à la section 12bis.

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
- **Règle "minimum une image à la publication"** : la transition vers `PUBLISHED` échoue (400) si l'évènement n'a aucun média `type: IMAGE` — jamais bloquant pour un brouillon (voir section 3B). `findOneForOrganization` (helper léger réutilisé par `TicketTypesService`/`EventMediaService`) reste sans le join média ; une nouvelle méthode `findDetailForOrganization` (utilisée par `GET .../events/:eventId`) l'ajoute séparément pour ne pas alourdir les créations/mises à jour de types de billets ou de médias.
- **`events.category` (texte libre) remplacé par une table de référence `event_categories`** — **nouveau** : table à plat (8 catégories seedées : Concert/Festival/Soirée/Cérémonie/Théâtre/Conférence/Sport/Autre, chacune avec icône Lucide + `color_token` parmi les 6 couleurs de catégorie de `docs/DESIGN_SYSTEM.md`), `events.category_id` en FK nullable (`ON DELETE RESTRICT`, pas d'endpoint de suppression). Migration hand-maintenue (`add_event_categories`) qui seed les 8 lignes et bascule tous les évènements existants vers `'autre'` (aucune donnée de prod à ce stade, pas de correspondance floue tentée). Nouveau module `event-categories/` (`GET /event-categories`, public, trié par `sort_order`) sur le modèle de `event-media/`. `EventsService` rejette un `categoryId` inconnu avec 400 et joint désormais `category` dans toutes les réponses organisateur + la page publique.
- Tests e2e : `events.e2e-spec.ts` (15 tests, +4 pour la règle de publication, +2 pour `categoryId`), nouveau `event-categories.e2e-spec.ts` (1 test).

### 3B. Module Médias évènements (Cloudflare R2) — **nouveau**
- Nouvelle table `event_media` (one-to-many, enum `image`/`video`), migration hand-maintenue avec le `CHECK (size_bytes > 0)` ajouté à la main (même discipline que les triggers anti-survente).
- **Upload direct navigateur → R2 via URL présignée** (`backend/src/storage/` — `R2Provider`, wrapper `@aws-sdk/client-s3`/`s3-request-presigner` sur le modèle de `PaydunyaProvider`), jamais de transit par le backend NestJS. Un bug réel du SDK a été détecté et corrigé : la version installée (^3.1115.0) signe par défaut un checksum CRC32 calculé sur un corps vide dans l'URL présignée — cassait toute vraie upload avant même d'atteindre R2. Corrigé via `requestChecksumCalculation: 'WHEN_REQUIRED'`.
- `backend/src/event-media/` (`presign`/`confirm`/liste/suppression) : quota par type vérifié au presign (UX) et re-vérifié de façon autoritative au confirm (juste avant l'écriture DB), `HeadObjectCommand` revérifie taille/existence réelles avant d'insérer la ligne (jamais seulement le déclaratif client), suppression R2-avant-DB (`DeleteObjectCommand` est idempotent nativement, pas de cas particulier 404 à gérer).
- **Limites retenues** (contexte mobile/data limité au Sénégal) : images JPEG/PNG/WebP, 5 Mo max, 8 par évènement ; vidéos MP4/H.264 uniquement, 50 Mo max, 2 par évènement.
- Variables d'environnement `R2_*` ajoutées à `configuration.ts`/`.env`/`.env.example` (dégradation gracieuse comme PayDunya/SMTP/Sentry si absentes). **Identifiants réels désormais fournis** dans `backend/.env` (bucket + clés Cloudflare) — reste à activer le CORS du bucket (`PUT` + `Content-Type` depuis l'origine frontend) et l'accès public en lecture (`r2.dev` ou domaine personnalisé) côté dashboard Cloudflare, sans quoi l'upload/l'affichage réel échoueront malgré des clés valides (voir `docs/INFRASTRUCTURE.md` §7).
- `PUBLIC_EVENT_SELECT` (page évènement publique) expose désormais `media` (id/type/url) — anticipe la page détail évènement participant (backend prêt, frontend pas encore construit).
- **Effet de bord découvert et corrigé** : 7 suites e2e existantes (`ticket-types`, `orders`, `payments-webhook`, `scan`, `notifications`, `payouts`, `stats`) publiaient déjà des évènements de test sans image — cassées par la nouvelle règle, corrigées en seedant une image dans chaque helper de fixture concerné.
- Tests e2e : nouveau `event-media.e2e-spec.ts` (15 tests — presign/confirm/liste/suppression, RBAC, limites, verrouillage évènement terminal, `R2Provider` mocké via `jest.spyOn` pour `headObject`/`deleteObject` — même convention que `paydunyaProvider` dans les autres suites, jamais de vrai appel réseau R2).
- **Suite complète 100/100 tests e2e + 7/7 unitaires**, vérifiée après cette passe.

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
**103/103 tests automatisés passent** : 7 unitaires + 96 e2e répartis sur 14 suites (`app`, `auth`, `events`, `event-categories`, `ticket-capacity`, `ticket-types`, `teams`, `orders`, `payments-webhook`, `payouts`, `scan`, `notifications`, `stats`, `event-media`), contre une vraie base PostgreSQL locale. Inclut les enrichissements `stats`/`payouts` ajoutés pour la page Tableau de bord (section 12), le module `event-media` (section 3B) et le nouveau module `event-categories` (section 3).

### 11. Infrastructure (Phase 1 — tout ce qui ne nécessite aucun compte/identifiant externe)
- **Docker** : `backend/Dockerfile` (build multi-stage) + `docker-compose.yml` (postgres/redis/backend) à la racine, `.dockerignore`. Vérifié en conditions réelles : build, boot, `GET /health` → `200` (DB jointe) et `503` (DB coupée). Deux pièges rencontrés et corrigés : `npm ci` en monorepo workspaces ne crée pas de `backend/node_modules` séparé (tout est hissé à la racine) ; l'image `node:20-slim` n'a pas `libssl` par défaut, ce qui générait un client Prisma pour la mauvaise version d'OpenSSL au moment du build (`openssl` installé explicitement dans les deux stages qui en ont besoin).
- **Sécurité applicative** : Helmet, CORS restreint à une liste blanche (`CORS_ORIGINS`), `@nestjs/throttler` (désactivé sous `NODE_ENV=test` pour ne pas casser la suite de tests), validation stricte des variables d'environnement structurelles au boot (`env.validation.ts`, sans casser la dégradation gracieuse déjà en place pour Google/PayDunya/SMTP).
- **Observabilité** : `GET /health`, logs structurés (`nestjs-pino`, JSON en prod, silencieux en test), intégration `@sentry/node` (inactive tant que `SENTRY_DSN` n'est pas fourni). Audit des logs existants effectué : aucun secret/clé API/mot de passe n'est jamais loggé.
- **CI** : `.github/workflows/ci.yml` (lint, type-check, migrations, tests unitaires + e2e, build de l'image Docker). Étapes de déploiement volontairement absentes (aucun hébergeur choisi). `backend/.eslintrc.js` créé au passage — première config ESLint fonctionnelle du projet (les dépendances existaient dans le scaffold initial mais n'avaient jamais été câblées).
- Détail complet et raisons des choix : `docs/INFRASTRUCTURE.md` §1 "État actuel".

### 12. Frontend web — socle + première page (Tableau de bord organisateur)
- **Socle** (réutilisé par toutes les pages suivantes) : design tokens `docs/DESIGN_SYSTEM.md` §2 en variables CSS (`globals.css`) reprises 1:1 dans `tailwind.config.ts`, police Archivo via `next/font/google`, `QueryClientProvider` (`@tanstack/react-query`), client API axios avec intercepteurs auth (`lib/api-client.ts`), `useCurrentUser()`, `types/index.ts` aligné sur les vrais enums backend.
- **Composants partagés** (`components/ui/`) : `Kicker`, `Button`, `Panel`, `MetricCard`, `StatusBadge` (mappe `EventStatus`/`PayoutStatus` → couleur sémantique), `Avatar`.
- **Page Tableau de bord** (`app/(organizer)/dashboard/`) : sidebar sombre + nav groupée, topbar, 4 cartes métriques, graphique ventes 7 jours, table évènements, panneaux équipe/reversements — fidèle à `design/mockups/zen-events-dashboard-mockup.html`, vérifié visuellement via Playwright à 375/768/1280px (captures inspectées directement, zéro erreur console).
- **3 enrichissements backend additifs** (aucune migration, réponses existantes complétées) pour alimenter cette page : `PayoutsService.findAllForOrganization` joint désormais l'évènement (nom affiché à côté de chaque reversement) ; `StatsService.getOrganizationStats` gagne `capacity`/`fillRate` (org-wide), `recentEvents` (5 évènements les plus récents, requêtes groupées, pas de N+1), `weeklySales` (billets vendus par jour, 7 derniers jours).
- **Convention icônes adoptée pour tout le projet** : Iconify (`@iconify/react/offline`) + jeu Lucide (`@iconify-icons/lucide`), plus aucun SVG à la main. Appliqué rétroactivement aux 7 icônes de la page Tableau de bord (`components/dashboard/nav-icons.tsx`), documenté dans `docs/DESIGN_SYSTEM.md` §"Icônes" comme règle obligatoire pour toutes les pages à venir.
- Détail du plan de construction page par page (ordre, dépendances backend, pages repoussées) : `docs/DESIGN_SYSTEM.md` §5.

### 12bis. Frontend web — Création / édition d'évènement (2ᵉ page organisateur)
- **Pas de maquette dédiée** pour cette page (contrairement au tableau de bord) — conçue directement à partir des tokens/motifs de `docs/DESIGN_SYSTEM.md`, décision actée avec l'utilisateur avant implémentation.
- **Trois routes** : `app/(organizer)/dashboard/events/page.tsx` (liste, RBAC-gated pour le bouton de création), `.../events/new/page.tsx` (création), `.../events/[id]/page.tsx` (édition — détails de l'évènement, contrôle de transition de statut, types de billets, liste blanche prévente).
- **Premiers primitifs de formulaire du projet** (`components/ui/`) : `Input`, `Textarea`, `Select`, `FormField`, `Modal` (portal + overlay), `InlineBanner`, `TicketCategoryTag`, plus un set d'icônes générales (`icons.tsx`) suivant la convention Iconify/Lucide déjà en place. `Button` gagne un prop `loading`.
- **Premier usage de `react-hook-form` + `zod`** (dépendances présentes depuis le début mais jamais câblées) : schémas miroir des DTOs backend (`CreateEventDto`, `CreateTicketTypeDto`/`UpdateTicketTypeDto`) pour un retour de validation immédiat, le serveur re-valide toujours en dernier ressort.
- **Premier usage de `useMutation`** dans le projet : création/édition d'évènement, transition de statut, CRUD types de billets, ajout/retrait de liste blanche — tous avec invalidation React Query ciblée (`lib/query-keys.ts` centralise les clés pour que page et modales invalident exactement les mêmes entrées).
- **Verrouillage à l'état terminal** : `CANCELLED`/`COMPLETED` désactive tout le formulaire d'évènement et masque toutes les actions de mutation des types de billets (`+ Type de billet`, `Modifier`, `Gérer la liste`) — capturé par un seul booléen `canEdit = canManage && !isLocked`, cohérent partout. Un bug a été détecté et corrigé pendant la vérification Playwright : `TicketTypesPanel` gatait initialement `+ Type de billet`/`Gérer la liste` sur `canManage` seul (permettant d'ajouter un type de billet à un évènement annulé) — corrigé pour utiliser `canEdit` partout dans ce panneau.
- **Contrôle de transition de statut** (`event-status-control.tsx`) : miroir client de `ALLOWED_TRANSITIONS` backend, n'affiche que les transitions valides, confirmation navigateur avant `CANCELLED` (déclenche une notification à tous les acheteurs côté serveur).
- **Whitelist prévente** : chargement paresseux (uniquement à l'ouverture de la modale), ajout en lot par emails séparés virgule/saut de ligne, suppression par email (`encodeURIComponent`), section entièrement masquée pour les rôles hors `MANAGE_ROLES` (le backend restreint déjà `GET .../whitelist` à ces rôles).
- **RBAC** : `lib/rbac.ts` (`canManageEvents`) — corrige au passage une faille pré-existante où le bouton "Créer un évènement" du tableau de bord était visible sans vérification de rôle.
- **Vérifié visuellement** : Playwright à 375/768/1280px sur les 3 routes, plus un flux manuel complet (créer évènement → billet public → billet prévente/liste blanche → ajout/retrait d'emails → DRAFT→PUBLISHED→CANCELLED → verrouillage terminal confirmé), zéro erreur console/requête en échec (hors abandons de prefetch RSC Next.js, bénins).
- **Complément — panneau Médias** (`components/events/event-media-panel.tsx`, section 3B côté backend) : zone de dépôt native (pas de librairie tierce — aucune installée, cohérent avec le parti pris déjà pris pour `Select`), upload direct navigateur → R2 via URL présignée (`XMLHttpRequest`, pas `fetch`, pour la barre de progression — nécessaire pour une vidéo de 50 Mo sur connexion limitée), grille de vignettes avec suppression, gating `canEdit` identique à `TicketTypesPanel`. `web/src/lib/media-limits.ts` mirrore les limites backend. Vérifié visuellement (Playwright 375/768/1280px) **et** en conditions réelles de dégradation gracieuse : tentative d'upload avec les vraies variables `R2_*` encore vides → échec propre affiché en ligne (pas de crash), confirmant le comportement attendu tant que l'utilisateur n'a pas fourni les identifiants Cloudflare R2.
- **Complément — sélecteur de catégorie** (`components/events/category-select.tsx` + `category-badge.tsx`, module `event-categories` côté backend) : le champ texte libre `category` du formulaire est remplacé par un menu déroulant personnalisé (bouton + liste positionnée en absolu, fermeture au clic extérieur/`Escape`) plutôt que le `Select` natif du projet — décision actée avec l'utilisateur car un `<option>` HTML ne peut pas afficher d'icône, alors que la demande était explicitement d'afficher l'icône Iconify de chaque catégorie dans le menu. Alimenté par `GET /event-categories`, icônes résolues via une table de correspondance statique (même logique que `TicketCategoryTag`). `EventCategoryBadge` affiche la catégorie choisie (icône + libellé + couleur `cat-*`) dans la liste des évènements. Vérifié visuellement (Playwright 375/768/1280px, ouverture du menu, sélection, création → persistance sur la page d'édition → badge sur la liste), zéro erreur console/requête en échec.

### 13. Documentation
- `docs/SPEC.md` — spec produit/technique à jour (PayDunya comme unique prestataire actif, modèle de commission, règle de reversement).
- `docs/MODULE_PAIEMENT_SPEC.md` — spec technique complète du module Vente & Paiement, implémentée et vérifiée.
- `docs/INFRASTRUCTURE.md` — référence déploiement/sécurité/observabilité, tâches taguées **[Claude Code]**/**[Vous]**, §1 tenu à jour après la Phase 1.
- `docs/DESIGN_SYSTEM.md` — identité visuelle frontend, tokens, motifs signature, convention icônes, plan de construction page par page.
- `CLAUDE.md` — règles de travail, stack et commandes à jour.

---

## 🚧 Ce qu'il reste à faire

### Backend — reporté (Phase 2, ne pas anticiper)
- **Codes promo** (`promo_codes` existe en base, aucune logique applicative).
- **Ticket-holder détaillé** (`holder_name`/`holder_email` par billet, billets nominatifs).
- **SMS** (`SmsChannel`) — aucun fournisseur configuré, stub explicite pour l'instant.
- **Annulation de commande individuelle** — le type `cancellation` du module notifications ne couvre que l'annulation d'un évènement entier ; aucun flux de remboursement/annulation d'une commande payée après coup n'existe encore (`docs/MODULE_PAIEMENT_SPEC.md` §0).
- **Mini-module Super Admin** (validation/modération organisateurs, finances plateforme) — bloque les pages Super Admin du frontend, voir `docs/DESIGN_SYSTEM.md` "Repoussé".

### Infrastructure non configurée (tâches **[Vous]**, voir `docs/INFRASTRUCTURE.md`)
- **Redis** — provisionné via Docker mais pas encore branché à l'application (jobs, rate limiting, cache) ; décision explicite de garder `@Cron` tant qu'une seule instance backend tourne.
- **Base de données managée** (DigitalOcean/Render) — actuellement Postgres local uniquement, aucun staging/prod.
- **Stockage fichiers (S3 / Cloudflare R2)** — logique d'upload médias évènements codée et testée (section 3B), **identifiants réels désormais fournis** dans `backend/.env`. Reste à configurer sur le dashboard Cloudflare : CORS du bucket (autoriser `PUT` + `Content-Type` depuis l'origine frontend) et accès public en lecture (URL de développement `r2.dev` ou domaine personnalisé) — non vérifiés à ce jour, sans quoi l'upload/l'affichage réel échoueront malgré des clés valides. Exports comptables/reçus (derrière URL signée à expiration courte) toujours non commencés.
- **Hébergement / déploiement** — aucune configuration de déploiement CD, CI seule en place.
- **Domaine & email** (DNS, SPF/DKIM/DMARC) — nécessaire avant que les emails transactionnels n'évitent le spam en prod.
- **PayDunya en mode `live`** — actuellement en mode `test` (sandbox) ; le switch est déjà entièrement piloté par `PAYDUNYA_MODE`, aucun code à changer, juste les vraies clés + la vraie URL IPN à fournir.

### Frontend web (`web/`)
Construction page par page en cours, une session Claude Code dédiée par page (voir `docs/DESIGN_SYSTEM.md` §5) :
- ✅ **Tableau de bord organisateur** — construit et vérifié visuellement (section 12 ci-dessus).
- ✅ **Création / édition d'évènement** (types de billets, prévente incluse, upload médias R2) — construit et vérifié visuellement, non commité (section 12bis ci-dessus).
- ⬜ Détail des ventes / historique de scan
- ⬜ Gestion de l'équipe
- ⬜ Reversements
- ⬜ Paramètres du compte
- ⬜ Page détail évènement, panier/checkout, redirection paiement + confirmation, connexion/inscription (surfaces participant/public)
- 🚫 **Repoussé** : page d'accueil (nouvelle maquette + backend mise en avant/sponsoring/géoloc manquants), pages Super Admin (bloquées sur le mini-module backend ci-dessus)

### Mobile (Flutter)
- **Non démarré.** Trois surfaces prévues par la spec : app Organisateur (web+mobile), app Scan dédiée (Contrôleur, offline-first), wallet Participant optionnel (Phase 3).

### Ordre du roadmap `CLAUDE.md` — **terminé**
```
DB ✅ → Auth/rôles ✅ → Events ✅ → Ticket types ✅ → Orders/Payments ✅ → Scan ✅ → Notifications ✅ → Stats ✅
```
Tous les modules de la séquence explicite `CLAUDE.md` sont livrés et testés (Teams et le reversement organisateur traités en parallèle), ainsi que l'Infrastructure Phase 1. Le travail actuel, sans ordre imposé par `CLAUDE.md` au-delà du plan page par page : **frontend web** (1/10+ pages faites), puis **mobile Flutter** (non démarré).
