# Module Vente & Paiement — Spécification technique

Ce document précise le fonctionnement du module `orders`/`payments`
(`docs/SPEC.md` module 3, règles métier §4). Il s'appuie sur le schéma déjà
migré (`db/schema.sql` sections 7-8, triggers section 13) et sur les
modules déjà livrés (`events`, `ticket-types`, RBAC `OrganizationRolesGuard`).

## 0. Périmètre (Phase 1 MVP)

Inclus :
- Panier → checkout → paiement CinetPay → confirmation.
- Un seul prestataire actif : **CinetPay** (cartes + mobile money unifiés).
  `PaydunyaProvider`/`IntouchProvider` restent des stubs non implémentés.
- Expiration des paniers non payés (job déjà stubé, à implémenter ici).
- Consultation d'une commande côté acheteur (sans compte).
- Consultation des commandes d'un évènement côté organisateur.

Explicitement **hors-scope** de cette passe (cohérent avec le roadmap
Phase 2 de `docs/SPEC.md` §5, cf. règle « ne pas anticiper Phase 2+ » du
`CLAUDE.md`) :
- Codes promo (`promo_codes` existe en base mais n'est pas branché ici —
  `Order.promoCodeId` reste toujours `null`).
- Vente assistée par un `Vendeur` en terrain (`orders.seller_id` existe en
  base pour ça, mais le endpoint checkout de cette passe reste public/sans
  auth ; brancher un `sellerId` authentifié est une extension triviale
  laissée pour plus tard).
- Billets nominatifs détaillés (`holder_name`/`holder_email` par billet) —
  restent `null`/`false` pour l'instant.
- Remboursement automatisé (API CinetPay de refund) — les cas nécessitant
  un remboursement sont *signalés*, pas traités automatiquement.

## 1. Modèle de statuts

| Table     | Champ    | Valeurs (Prisma)                                             |
| --------- | -------- | -------------------------------------------------------------- |
| `orders`  | `status` | `PENDING → PAID \| EXPIRED \| CANCELLED \| REFUNDED`            |
| `tickets` | `status` | `PENDING_PAYMENT → VALID → USED \| CANCELLED \| REFUNDED`       |
| `payments`| `status` | `PENDING → SUCCESS \| FAILED`                                   |

Qui déclenche quoi :
- `tickets` passe de rien à `PENDING_PAYMENT` **à l'insertion** (checkout) —
  déclenche `fn_reserve_ticket_capacity` (BEFORE INSERT).
- `tickets` `PENDING_PAYMENT/VALID → CANCELLED/REFUNDED` déclenche
  `fn_release_ticket_capacity` (AFTER UPDATE OF status) — libère le quota.
- `tickets` `PENDING_PAYMENT → VALID` (paiement confirmé) est un simple
  `UPDATE`, **ne** déclenche **pas** le trigger de libération (transition
  non couverte par sa condition), et ne doit pas la déclencher : le quota
  reste consommé, c'est le but.

## 2. Flux complet

### 2.1 Checkout — `POST /orders`

1. Le client envoie `{ eventId, buyerEmail, buyerPhone?, items: [{ ticketTypeId, quantity }] }`.
2. Validation applicative (avant toute écriture) :
   - l'évènement existe et est `PUBLISHED` ;
   - chaque `ticketTypeId` appartient bien à cet évènement ;
   - `now()` ∈ `[saleStart, saleEnd]` pour chaque type demandé (sinon
     « pas en vente ») ;
   - `quantity ≤ maxPerOrder` ;
   - si `accessMode = PRESALE_WHITELIST`, `buyerEmail` doit exister dans
     `ticket_type_whitelist` pour ce `ticketTypeId` (sinon 403).
3. `$transaction` Prisma :
   - `Order.create` (`status: PENDING`, `expiresAt: now()+15min`,
     `totalAmount` = somme des `unitPrice(=ticketType.price au moment T) × quantity`).
   - `OrderItem.create` par type de billet demandé.
   - `Ticket.create` **quantity fois** par `OrderItem`, `status: PENDING_PAYMENT`,
     `qrToken` = jeton aléatoire sécurisé (`crypto.randomBytes`, pas
     l'UUID de la commande — ne doit jamais être devinable). Chaque insert
     déclenche `fn_reserve_ticket_capacity` ; si le quota est atteint pour
     un type au milieu du lot, `RAISE EXCEPTION` fait échouer toute la
     transaction (rollback complet : la commande entière échoue plutôt que
     de livrer un panier partiel) → traduit en `409 Conflict`
     (« some tickets are no longer available »).
4. Une fois la commande + billets réservés (donc **avant** confirmation de
   paiement, conforme à la règle anti-survente de `CLAUDE.md`), appel à
   `CinetpayProvider.initPayment({ transactionId: order.id, amount, currency,
   notifyUrl, returnUrl, customer })`.
   - **Si cet appel échoue** (réseau, API CinetPay down) : la commande déjà
     créée est immédiatement transitionnée `PENDING → CANCELLED` (et ses
     billets `PENDING_PAYMENT → CANCELLED`, ce qui libère le quota via le
     trigger) dans le même handler, puis `503 Service Unavailable` est
     renvoyé au client avec invitation à réessayer. On ne laisse jamais une
     commande "orpheline" sans moyen de payer.
5. `Payment.create` (`provider: CINETPAY`, `status: PENDING`, `amount`,
   `providerTransactionId`: le token renvoyé par CinetPay pour cette
   tentative).
6. Réponse `201` : `{ orderId, paymentUrl, expiresAt }`. Le client redirige
   le navigateur vers `paymentUrl` (page CinetPay hébergée).

État à ce stade : `Order.status = PENDING`, `Ticket.status = PENDING_PAYMENT`
(pour tous les billets du panier), `Payment.status = PENDING`.

### 2.2 Paiement chez CinetPay

L'acheteur paie (carte ou mobile money) sur la page hébergée par CinetPay.
CinetPay redirige ensuite le navigateur vers `returnUrl`
(`FRONTEND_URL/orders/:orderId`) — **ce redirect n'est pas la confirmation
de paiement**, seul le webhook (2.3) fait foi. La page de retour doit donc
afficher un état "en cours de vérification" et interroger
`GET /orders/:orderId` (éventuellement en polling léger) jusqu'à ce que le
statut change.

### 2.3 Webhook CinetPay — `POST /payments/webhooks/cinetpay`

Voir section 3 pour le détail. Sur confirmation vérifiée et commande encore
`PENDING` :
- `UPDATE orders SET status = 'PAID' WHERE id = :orderId AND status = 'PENDING' RETURNING id`
  — **UPDATE conditionnel unique**, même pattern que l'anti-fraude scan du
  `CLAUDE.md`. Si 0 ligne retournée, un autre webhook concurrent (ou le job
  d'expiration) a déjà traité cette commande → sortie immédiate, idempotent
  (voir 3.2 et 6.4).
- Si la ligne a bien été mise à jour (donc c'est ce handler qui a "gagné") :
  `Payment.status = SUCCESS` (+ `providerTransactionId`, `rawResponse`), et
  `UPDATE tickets SET status='VALID' WHERE status='PENDING_PAYMENT' AND orderItem.orderId = :orderId`
  (updateMany scoping via la relation `orderItem.order`).

État final (cas nominal) : `Order.status = PAID`, tous les `Ticket.status = VALID`,
`Payment.status = SUCCESS`.

### 2.4 Consultation — `GET /orders/:orderId`

Endpoint public : l'UUID de la commande (aléatoire, non énumérable) fait
office de jeton d'accès, cohérent avec le modèle "achat sans compte" déjà
en place pour `GET /events/:slug` et `GET /events/:slug/ticket-types`.
Retourne le statut de la commande, les lignes, et pour chaque billet
`VALID` un QR code (image data-URL via `QrcodeService.generate(qrToken)`,
déjà stubé dans `backend/src/tickets/qrcode.service.ts`).

## 3. Intégration webhook CinetPay

### 3.1 Principe : ne jamais faire confiance au corps du webhook

CinetPay notifie `notify_url` sans forcément signer cryptographiquement le
payload de façon vérifiable côté serveur (contrairement à Stripe et son
`Stripe-Signature`). Le pattern recommandé par CinetPay — et celui retenu
ici — est : **le webhook n'est qu'un ping**. Dès réception (quel que soit
son contenu), le serveur rappelle l'API CinetPay en server-to-server avec
sa propre `apikey`/`site_id` et le `transaction_id` pour obtenir le statut
**vérifié et faisant autorité** (endpoint de vérification, ex.
`POST /v2/payment/check` — nom exact et forme du payload à reconfirmer
contre la documentation CinetPay à jour au moment de l'implémentation, les
détails d'API peuvent avoir évolué). C'est cet appel sortant, authentifié
par notre secret, qui est la véritable source de vérité — jamais le corps
entrant.

### 3.2 Idempotence

1. Extraire `transactionId` (= `order.id`) du ping entrant.
2. Charger la `Payment` existante pour cette commande.
   - Si elle est déjà `SUCCESS` → répondre `200` immédiatement, ne rien
     refaire (webhook dupliqué — CinetPay peut renvoyer le même ping
     plusieurs fois si l'accusé de réception est lent/absent).
3. Appeler la vérification CinetPay (3.1) pour obtenir le statut vérifié.
4. Si vérifié `ACCEPTED` :
   - **Vérifier le montant** renvoyé par CinetPay contre `order.totalAmount`.
     Mismatch → ne pas confirmer, `Payment.status = FAILED` avec
     `rawResponse` capturant l'écart, log d'alerte (voir 6.3) ; répondre
     quand même `200` (le ping a bien été traité, même si le résultat métier
     est un rejet).
   - Montant OK → `UPDATE orders ... WHERE status='PENDING'` conditionnel
     (2.3). Deux webhooks quasi simultanés pour la même commande : un seul
     gagne la course grâce au verrouillage de ligne implicite de Postgres
     sur cet `UPDATE` (même principe que `fn_reserve_ticket_capacity`) ;
     l'autre trouve `0` ligne affectée et sort sans rien dupliquer (voir 6.5).
5. Si vérifié refusé/échoué : `Payment.status = FAILED`, commande laissée
   `PENDING` (sera nettoyée par le job d'expiration si l'acheteur ne
   retente rien avant `expiresAt`).
6. Toujours répondre `200` à CinetPay dès que le ping a été traité avec
   succès de notre côté — **y compris quand le résultat métier est un
   échec de paiement** (ce n'est pas un échec de traitement du webhook).
   Ne répondre en erreur (`5xx`) que si le traitement lui-même a échoué
   côté serveur (DB injoignable, etc.), pour laisser CinetPay retenter.

### 3.3 Détails techniques

- Route : `POST /payments/webhooks/cinetpay`, aucun guard (appelé par
  CinetPay, pas par un utilisateur authentifié).
- Le endpoint check-status (3.1) nécessite `CINETPAY_API_KEY` +
  `CINETPAY_SITE_ID` (déjà dans `.env.example`) ; ajouter
  `CINETPAY_SECRET_KEY` si la vérification finale du callback l'exige selon
  la doc à jour (à confirmer à l'implémentation).
- En local, `notify_url` doit être joignable publiquement pour tester le
  vrai flux CinetPay (tunnel type ngrok) — sans ça, seule la logique de
  confirmation peut être testée en appelant directement le service avec un
  événement fabriqué (voir 6, même approche que pour `AuthService.loginWithGoogle`
  testé sans passer par le vrai flux OAuth Google).

## 4. Échecs de paiement et paniers expirés

### 4.1 Échec de paiement (webhook `REFUSED`)

`Payment.status = FAILED`. La commande reste `PENDING` — l'acheteur peut
retenter (CinetPay permet généralement de retenter depuis sa page hébergée
tant que la session n'a pas expiré côté CinetPay). Aucun endpoint dédié de
"relance" n'est prévu dans cette passe : l'expiration (15 min) borne
naturellement la fenêtre de retry.

### 4.2 Panier expiré — `OrdersExpirationJob`

Implémente exactement le SQL déjà documenté dans `db/schema.sql` section 15,
en deux passes Prisma (pas d'`UPDATE ... JOIN` natif) :
```
1. SELECT id FROM orders WHERE status='PENDING' AND expires_at < now()
2. UPDATE orders SET status='EXPIRED' WHERE id IN (...)
3. UPDATE tickets SET status='CANCELLED'
   WHERE status='PENDING_PAYMENT' AND orderItem.orderId IN (...)
   → déclenche fn_release_ticket_capacity pour chaque ligne affectée
```
Tourne chaque minute (`@Cron(CronExpression.EVERY_MINUTE)`, déjà posé dans
`orders-expiration.job.ts`).

## 5. Endpoints API

| Méthode | Route                                                          | Auth                        | Payload                                                        | Réponse                                  |
| ------- | --------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| POST    | `/orders`                                                        | Public                       | `{ eventId, buyerEmail, buyerPhone?, items: [{ ticketTypeId, quantity }] }` | `201 { orderId, paymentUrl, expiresAt }` |
| GET     | `/orders/:orderId`                                               | Public (UUID = accès)        | —                                                                  | `200` statut + lignes + QR des billets `VALID` |
| POST    | `/payments/webhooks/cinetpay`                                   | Aucune (vérif. server-to-server) | Corps CinetPay (variable)                                    | `200` toujours (sauf échec serveur)      |
| GET     | `/organizations/:organizationId/events/:eventId/orders`         | JWT + `OrganizationRolesGuard` (`ALL_MEMBER_ROLES`) | —                                             | `200` liste des commandes de l'évènement |

## 6. Cas limites à couvrir par des tests

1. **Checkout nominal** : panier valide → `201`, billets `PENDING_PAYMENT`,
   `quantity_sold` incrémenté (test déjà existant à réutiliser comme base :
   `ticket-capacity.e2e-spec.ts`).
2. **Sold out pendant le checkout** : quota juste insuffisant pour la
   quantité demandée → `409`, **aucun** billet ni commande ne doit persister
   (transaction entièrement roll-backée — à vérifier explicitement en
   comptant les lignes après coup).
3. **Paiement dupliqué** (webhook reçu deux fois pour un même succès) :
   le deuxième appel ne doit ni recréer de `Payment`, ni re-déclencher la
   validation des billets, ni faire d'appel de vérification CinetPay inutile
   si évitable — au minimum, le résultat final doit être strictement
   identique à un seul appel (un seul `Payment SUCCESS`, tickets `VALID`
   une seule fois).
4. **Webhook reçu après expiration du panier** : commande déjà `EXPIRED`
   (billets déjà `CANCELLED`, quota déjà libéré) quand le webhook de succès
   arrive → `Payment.status = SUCCESS` créé pour traçabilité,
   `Order.status` **reste** `EXPIRED` (pas de passage à `PAID`), un
   `AuditLog` (`action: 'payment.received_after_expiry'`) est créé. Vérifier
   qu'aucun `Ticket` n'est repassé `VALID` et que `quantity_sold` n'est pas
   ré-incrémenté.
5. **Montant du webhook différent du montant attendu** : la vérification
   CinetPay renvoie un montant ≠ `order.totalAmount` → `Payment.status = FAILED`
   avec l'écart dans `rawResponse`, `Order.status` reste `PENDING` (pas `PAID`).
6. **Deux webhooks quasi simultanés pour la même commande** — test de
   concurrence dans le même esprit que `ticket-capacity.e2e-spec.ts` :
   `Promise.allSettled` sur deux appels concurrents du handler de
   confirmation pour le même `orderId` (statut vérifié simulé comme déjà
   `ACCEPTED` pour les deux) → assert qu'un seul provoque effectivement la
   transition `PENDING → PAID` (via l'`UPDATE` conditionnel de 2.3/3.2),
   l'autre constate `0` ligne affectée et sort sans erreur ; au final,
   `Payment.status = SUCCESS` une seule fois, pas de double traitement.
7. **Job d'expiration** : commande avec `expiresAt` dans le passé → passe
   `EXPIRED`, ses billets `PENDING_PAYMENT` passent `CANCELLED`,
   `quantity_sold` redescend d'autant (trigger de libération exercé).
8. **Échec de l'appel `initPayment` à CinetPay** : la commande déjà créée
   est nettoyée (`CANCELLED`, quota libéré) plutôt que laissée orpheline.

## 7. Fichiers concernés (pour l'implémentation à venir)

- `backend/src/orders/dto/checkout.dto.ts` (nouveau)
- `backend/src/orders/orders.service.ts` (à écrire : `checkout`, `findPublicById`, `findAllForEvent`)
- `backend/src/orders/orders.controller.ts` (nouveau contenu : `POST /orders`, `GET /orders/:orderId`)
- `backend/src/orders/organizer-orders.controller.ts` (nouveau, `GET organizations/:organizationId/events/:eventId/orders`)
- `backend/src/orders/orders-expiration.job.ts` (à implémenter, squelette déjà en place)
- `backend/src/orders/orders.module.ts` (à mettre à jour : imports `TicketsModule`, `PaymentsModule`, `EventsModule`)
- `backend/src/payments/payments.controller.ts` (nouveau contenu : webhook)
- `backend/src/payments/payments.service.ts` (à écrire : confirmation idempotente, `UPDATE` conditionnel)
- `backend/src/payments/providers/cinetpay.provider.ts` (à implémenter : `initPayment`, `verifyTransaction`)
- **Nettoyage** : supprimer `backend/src/payments/providers/stripe.provider.ts` et ses références dans
  `payments.module.ts`/`payments.service.ts`, retirer la dépendance npm `stripe` de `backend/package.json`
  (Stripe est définitivement écarté, cf. `docs/SPEC.md`).
- `backend/src/tickets/tickets.service.ts` (à écrire : génération de `qrToken` sécurisé, réutilisé par le checkout)
- `backend/src/main.ts` : activer `rawBody: true` à la création de l'app (`NestFactory.create(AppModule, { rawBody: true })`)
  si la vérification CinetPay nécessite le corps brut de la requête (à confirmer selon leur méthode de vérification retenue).
- `backend/test/orders.e2e-spec.ts` (nouveau, couvre la section 6)
- **Aucune migration Prisma requise** pour ce module — le schéma existant
  (`orders`, `order_items`, `tickets`, `payments`) couvre déjà tous les besoins.

## 8. Variables d'environnement nécessaires

Déjà présentes dans `backend/.env.example` : `CINETPAY_API_KEY`,
`CINETPAY_SITE_ID`. À ajouter si nécessaire selon la méthode de vérification
retenue à l'implémentation : `CINETPAY_SECRET_KEY`.

## 9. Limites connues de cette spec

- Les noms exacts d'endpoints/champs CinetPay (section 3.1, 3.3) sont posés
  sur la base de la documentation publique connue de CinetPay au moment de
  la rédaction ; à reconfirmer contre leur documentation actuelle avant
  d'écrire `cinetpay.provider.ts`.
- Le cas "webhook tardif après expiration" (6.4) laisse une trace pour
  traitement humain plutôt que de rembourser automatiquement — aucun module
  de remboursement n'existe encore dans ce projet.
