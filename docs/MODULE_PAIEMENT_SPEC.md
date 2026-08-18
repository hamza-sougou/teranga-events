# Module Vente & Paiement — Spécification technique (PayDunya)

Ce document précise le fonctionnement du module `orders`/`payments`/`payouts`
(`docs/SPEC.md` modules 3-4, règles métier §4-6). Il s'appuie sur le schéma
déjà migré (`db/schema.sql` sections 7, 8, 8B, triggers section 13) et sur
les modules déjà livrés (`events`, `ticket-types`, RBAC
`OrganizationRolesGuard`).

**Remplace intégralement la version précédente de ce document**, qui
décrivait une intégration CinetPay abandonnée (inscription jamais validée —
voir `docs/SPEC.md` §2, encart historique).

## 0. Périmètre (Phase 1 MVP)

Inclus :
- Aperçu de prix sans engagement, panier → checkout → facture PayDunya
  (API PAR) → confirmation.
- Un seul prestataire actif : **PayDunya**. `CinetpayProvider` reste un stub
  inutilisé (fournisseur conservé en réserve dans l'enum DB, inscription non
  validée — voir `docs/SPEC.md` §2) ; `IntouchProvider` n'existe pas et n'a
  jamais été prévu pour cette passe.
- Commission dynamique de 5% pour Zen Events, calculée pour absorber les
  frais PayDunya des deux côtés (payin + payout).
- Expiration des paniers non payés (job déjà stubé, à implémenter ici).
- Reversement aux organisateurs après la fin de l'évènement (job planifié +
  déclenchement manuel).
- Consultation d'une commande côté acheteur (sans compte).
- Consultation des commandes et des reversements côté organisateur.

Explicitement **hors-scope** de cette passe (cohérent avec le roadmap
Phase 2 de `docs/SPEC.md` §7, cf. règle « ne pas anticiper Phase 2+ » du
`CLAUDE.md`) :
- Codes promo (`promo_codes` existe en base mais n'est pas branché ici —
  `Order.promoCodeId` reste toujours `null`).
- Vente assistée par un `Vendeur` en terrain (`orders.seller_id` existe en
  base pour ça, mais le endpoint checkout de cette passe reste public/sans
  auth ; brancher un `sellerId` authentifié est une extension triviale
  laissée pour plus tard).
- Billets nominatifs détaillés (`holder_name`/`holder_email` par billet) —
  restent `null`/`false` pour l'instant.
- Remboursement automatisé (client ou organisateur) — les cas nécessitant
  un remboursement sont *signalés* (log/audit), pas traités automatiquement.
- API PER PayDunya (marketplace, compte PayDunya par organisateur) — à
  réévaluer en Phase 3 selon `docs/SPEC.md` §7.

## 1. Modèle de statuts

| Table      | Champ    | Valeurs (Prisma)                                          |
| ---------- | -------- | ----------------------------------------------------------- |
| `orders`   | `status` | `PENDING → PAID \| EXPIRED \| CANCELLED \| REFUNDED`          |
| `tickets`  | `status` | `PENDING_PAYMENT → VALID → USED \| CANCELLED \| REFUNDED`     |
| `payments` | `status` | `PENDING → SUCCESS \| FAILED`                                 |
| `payouts`  | `status` | `PENDING → PROCESSING → PAID \| FAILED`                       |

Qui déclenche quoi :
- `tickets` passe de rien à `PENDING_PAYMENT` **à l'insertion** (checkout) —
  déclenche `fn_reserve_ticket_capacity` (BEFORE INSERT).
- `tickets` `PENDING_PAYMENT/VALID → CANCELLED/REFUNDED` déclenche
  `fn_release_ticket_capacity` (AFTER UPDATE OF status) — libère le quota.
- `tickets` `PENDING_PAYMENT → VALID` (paiement confirmé) est un simple
  `UPDATE`, **ne** déclenche **pas** le trigger de libération (transition
  non couverte par sa condition) — le quota reste consommé, c'est le but.
- `payouts` n'existe **qu'après** la fin de l'évènement — pas de ligne
  `PENDING` créée à l'avance ; elle est créée au moment même où le job
  d'éligibilité la traite (voir section 6).

## 2. Flux complet

### 2.1 Aperçu de prix — `POST /orders/preview`

Endpoint public, sans effet de bord, réutilisable en live par le frontend
pendant que le client compose son panier et choisit un canal.

1. Body : `{ eventId, paymentChannel: 'MOBILE_MONEY' | 'CARD' | 'DJAMO', items: [{ ticketTypeId, quantity }] }`.
2. Mêmes validations applicatives que 2.2 (sans écriture).
3. Retourne `{ subtotalAmount, serviceFeeAmount, totalAmount, currency }`
   via `PricingService.quoteCheckout()` (section 5).

### 2.2 Checkout — `POST /orders`

1. Body : `{ eventId, buyerEmail, buyerPhone?, paymentChannel: 'MOBILE_MONEY' | 'CARD' | 'DJAMO', items: [{ ticketTypeId, quantity }] }`.
2. Validation applicative (avant toute écriture) :
   - l'évènement existe et est `PUBLISHED` ;
   - chaque `ticketTypeId` appartient bien à cet évènement ;
   - `now()` ∈ `[saleStart, saleEnd]` pour chaque type demandé (sinon
     « pas en vente ») ;
   - `quantity ≤ maxPerOrder` ;
   - si `accessMode = PRESALE_WHITELIST`, `buyerEmail` doit exister dans
     `ticket_type_whitelist` pour ce `ticketTypeId` (sinon 403).
3. **Calcul du prix** (section 5) : `subtotalAmount` = somme exacte des
   `unitPrice(=ticketType.price au moment T) × quantity`. `totalAmount` via
   la formule de commission (dépend de `paymentChannel`), arrondi à l'unité
   XOF. `serviceFeeAmount = totalAmount - subtotalAmount` (dérivé, jamais
   arrondi indépendamment — garantit `chk_orders_total_equals_parts` par
   construction).
4. `$transaction` Prisma :
   - `Order.create` (`status: PENDING`, `expiresAt: now()+15min`,
     `subtotalAmount`, `serviceFeeAmount`, `totalAmount`).
   - `OrderItem.create` par type de billet demandé.
   - `Ticket.create` **quantity fois** par `OrderItem`, `status: PENDING_PAYMENT`,
     `qrToken` = jeton aléatoire sécurisé (`crypto.randomBytes`, jamais
     l'UUID de la commande — ne doit jamais être devinable). Chaque insert
     déclenche `fn_reserve_ticket_capacity` ; si le quota est atteint pour
     un type au milieu du lot, `RAISE EXCEPTION` fait échouer toute la
     transaction (rollback complet : la commande entière échoue plutôt que
     de livrer un panier partiel) → traduit en `409 Conflict`
     (« some tickets are no longer available »).
5. Une fois la commande + billets réservés (donc **avant** confirmation de
   paiement, conforme à la règle anti-survente de `CLAUDE.md`), création de
   la facture PayDunya (API PAR, SDK `paydunya`) :
   - `invoice.totalAmount = totalAmount` fixé explicitement par Zen Events
     (jamais laissé à PayDunya de le recalculer depuis les items — voir
     SPEC.md §5.2). Lignes descriptives (`invoice.addItem`) ajoutées pour
     l'affichage, sans influence sur le montant facturé.
   - `invoice.callbackUrl` = `POST /payments/webhooks/paydunya`.
   - `invoice.returnUrl`/`cancelUrl` = pages `FRONTEND_URL/orders/:orderId`.
   - Un champ de données personnalisées (`custom_data` ou équivalent SDK) —
     nom exact à reconfirmer contre la doc PayDunya à jour — transporte
     `orderId`, pour que l'IPN puisse identifier la commande sans dépendre
     uniquement d'une recherche par token.
   - **Si cet appel échoue** (réseau, API PayDunya down) : la commande déjà
     créée est immédiatement transitionnée `PENDING → CANCELLED` (et ses
     billets `PENDING_PAYMENT → CANCELLED`, ce qui libère le quota via le
     trigger) dans le même handler, puis `503 Service Unavailable` est
     renvoyé au client avec invitation à réessayer. On ne laisse jamais une
     commande "orpheline" sans moyen de payer.
6. `Payment.create` (`provider: PAYDUNYA`, `status: PENDING`, `amount:
   totalAmount`, `providerTransactionId`: le token/identifiant de facture
   renvoyé par PayDunya pour cette tentative).
7. Réponse `201` : `{ orderId, paymentUrl, expiresAt, totalAmount }`. Le
   client redirige le navigateur vers `paymentUrl` (page PayDunya hébergée).

État à ce stade : `Order.status = PENDING`, `Ticket.status = PENDING_PAYMENT`
(pour tous les billets du panier), `Payment.status = PENDING`.

### 2.3 Paiement chez PayDunya

L'acheteur choisit son moyen de paiement précis (Wave, Orange Money, Free
Money, carte, Djamo) sur la page hébergée par PayDunya, dans la limite du
canal déjà pré-sélectionné à l'étape 2.2 pour le calcul du prix — voir
limite connue en section 12. PayDunya redirige ensuite le navigateur vers
`returnUrl` — **ce redirect n'est pas la confirmation de paiement**, seul
l'IPN (2.4) fait foi. La page de retour doit donc afficher un état "en
cours de vérification" et interroger `GET /orders/:orderId` (polling léger)
jusqu'à ce que le statut change.

**Contrainte de développement local** : l'IPN est un `POST` que PayDunya
envoie vers `callbackUrl` ; `localhost` n'est pas joignable depuis leurs
serveurs — un tunnel (ex. `ngrok http 3000`) est nécessaire pour tester le
flux complet en développement (voir SPEC.md §5.2).

### 2.4 IPN PayDunya — `POST /payments/webhooks/paydunya`

Voir section 3 pour la vérification et section 4 pour l'idempotence. Sur
IPN authentifié et statut `completed` (nom exact du champ à reconfirmer),
commande encore `PENDING`, montant conforme :
- `UPDATE orders SET status = 'PAID' WHERE id = :orderId AND status = 'PENDING' RETURNING id`
  — **UPDATE conditionnel unique**, même pattern que l'anti-fraude scan du
  `CLAUDE.md`. Si 0 ligne retournée, un autre IPN concurrent (ou le job
  d'expiration) a déjà traité cette commande → sortie immédiate, idempotent.
- Si la ligne a bien été mise à jour : `Payment.status = SUCCESS` (+
  `providerTransactionId`, `rawResponse`), et
  `UPDATE tickets SET status='VALID' WHERE status='PENDING_PAYMENT' AND orderItem.orderId = :orderId`.

État final (cas nominal) : `Order.status = PAID`, tous les `Ticket.status = VALID`,
`Payment.status = SUCCESS`.

### 2.5 Consultation — `GET /orders/:orderId`

Endpoint public : l'UUID de la commande (aléatoire, non énumérable) fait
office de jeton d'accès, cohérent avec le modèle "achat sans compte" déjà
en place pour `GET /events/:slug` et `GET /events/:slug/ticket-types`.
Retourne le statut de la commande, les lignes, et pour chaque billet
`VALID` un QR code (image data-URL via `QrcodeService.generate(qrToken)`,
déjà stubé dans `backend/src/tickets/qrcode.service.ts`).

## 3. Vérification de l'IPN

PayDunya envoie un `POST` (`application/x-www-form-urlencoded`) contenant
les données sous la clé `data`, incluant un `hash`. Ce hash est le **SHA-512
de la clé principale (`PAYDUNYA_MASTER_KEY`)** — une valeur déterministe
que seul un émetteur connaissant cette clé (PayDunya, ou nous) peut produire.
Contrairement au modèle CinetPay précédemment documenté, ce n'est **pas**
une signature du corps de la requête : recalculer `sha512(PAYDUNYA_MASTER_KEY)`
et le comparer au `hash` reçu suffit à authentifier l'expéditeur.

**Si le hash ne correspond pas** :
- Rejet immédiat, **aucune** écriture en base (ni `Payment`, ni `Order`, ni
  `Ticket`, ni `AuditLog` métier).
- Réponse `400 Bad Request` (pas `200` — contrairement aux échecs métier de
  la section 4, une authenticité non vérifiée n'est pas "un IPN traité dont
  le résultat est un échec", c'est une requête qu'on refuse de traiter).
- Log de sécurité (niveau warning/error, avec IP source et payload brut
  tronqué) pour permettre une revue a posteriori d'éventuelles tentatives
  de spoofing.

Ce contrôle a lieu **avant tout accès à la commande** — impossible de
savoir à quelle commande un IPN non authentifié prétend se rapporter tant
que son authenticité n'est pas établie.

## 4. Idempotence de l'IPN

1. Vérifier le hash (section 3). Échec → sortie (400), rien d'autre.
2. Extraire l'identifiant de commande du IPN (champ `custom_data.orderId`
   posé à la création de la facture, section 2.2 — nom exact à confirmer ;
   à défaut, retrouver la `Payment` via `providerTransactionId` = token de
   facture PayDunya présent dans le payload).
3. Charger la `Payment` existante pour cette commande.
   - Si elle est déjà `SUCCESS` → répondre `200` immédiatement, ne rien
     refaire (IPN dupliqué — PayDunya peut renvoyer le même ping plusieurs
     fois si l'accusé de réception est lent/absent).
4. Lire le statut transmis par l'IPN (`completed` / `cancelled` / autre —
   nom exact du champ à reconfirmer contre la doc PayDunya à jour).
5. Si `completed` :
   - **Vérifier le montant** transmis contre `order.totalAmount`. Mismatch
     → ne pas confirmer, `Payment.status = FAILED` avec `rawResponse`
     capturant l'écart, log d'alerte ; répondre quand même `200` (l'IPN a
     bien été traité, même si le résultat métier est un rejet).
   - Montant OK → `UPDATE orders ... WHERE status='PENDING'` conditionnel
     (2.4). Deux IPN quasi simultanés pour la même commande : un seul gagne
     la course grâce au verrouillage de ligne implicite de Postgres sur cet
     `UPDATE` (même principe que `fn_reserve_ticket_capacity`) ; l'autre
     trouve `0` ligne affectée et sort sans rien dupliquer.
   - Si `0` ligne affectée et que la commande est déjà `EXPIRED` (webhook
     tardif, arrivé après le job d'expiration) : `Payment.status = SUCCESS`
     créé/mis à jour pour traçabilité, `Order.status` **reste** `EXPIRED`
     (jamais repassé `PAID`), un `AuditLog`
     (`action: 'payment.received_after_expiry'`) est créé. Aucun `Ticket`
     n'est repassé `VALID`, `quantity_sold` n'est pas ré-incrémenté — géré
     manuellement (remboursement) par le Support plateforme.
6. Si non `completed` : `Payment.status = FAILED`, commande laissée
   `PENDING` (sera nettoyée par le job d'expiration si l'acheteur ne
   retente rien avant `expiresAt`).
7. Toujours répondre `200` une fois l'IPN authentifié et traité — **y
   compris quand le résultat métier est un échec de paiement**. Ne répondre
   en erreur (`5xx`) que si le traitement lui-même a échoué côté serveur
   (DB injoignable, etc.), pour laisser PayDunya retenter.

## 5. Calcul du prix affiché au client

**Commission cible : 5% du prix du ticket fixé par l'organisateur, quel que
soit le canal choisi par le client** (`docs/SPEC.md` §5.5).

```
Montant à décaisser à l'organisateur = calculatePayoutAmount(subtotalAmount)
Solde nécessaire après payin        = Montant_à_décaisser + (subtotalAmount × 5%)
totalAmount (avant arrondi)         = Solde_nécessaire / (1 - tauxPayin[paymentChannel])
totalAmount                         = round(totalAmount avant arrondi)   // unité XOF
serviceFeeAmount                    = totalAmount - subtotalAmount        // dérivé, jamais arrondi seul
```

| Canal choisi par le client | Taux payin | Note |
| --------------------------- | ---------- | ---- |
| `MOBILE_MONEY` (Wave, Orange Money, Free Money) | 2,25% | |
| `CARD` | 3,25% | |
| `DJAMO` | 2% | |

`calculatePayoutAmount(netAmount)` — **isolée dans
`backend/src/payments/pricing/payout-amount.ts`**, jamais dupliquée :

```ts
// HYPOTHÈSE NON CONFIRMÉE PAR PAYDUNYA (SPEC.md §5.3) : les frais de payout
// sont supposés déduits du montant décaissé (l'organisateur reçoit moins
// que ce qu'on demande à PayDunya de transférer), pas prélevés en plus sur
// le solde Zen Events. Si PayDunya confirme l'autre modèle, cette fonction
// est le SEUL endroit à corriger — elle est réutilisée à la fois par le
// calcul du prix client (ci-dessus) et par le job de reversement réel
// (section 6).
const PAYOUT_FEE_RATE_MOBILE_MONEY = 0.02; // seul canal de payout supporté (SPEC.md §5.6)

export function calculatePayoutAmount(netAmount: number): number {
  return netAmount / (1 - PAYOUT_FEE_RATE_MOBILE_MONEY);
}
```

`PricingService.quoteCheckout({ subtotalAmount, paymentChannel })` applique
la formule complète ci-dessus et retourne `{ subtotalAmount, serviceFeeAmount, totalAmount }`.
Réutilisé par `POST /orders/preview` (2.1) et `POST /orders` (2.2) — jamais
recalculé différemment entre les deux.

**Limite assumée** : le canal est figé au moment de la création de la
facture PayDunya ; si le client change d'instrument de paiement directement
sur la page hébergée PayDunya (ex. choisit "carte" après avoir sélectionné
"mobile money" sur notre checkout), le montant facturé reste celui déjà
fixé — pas de sur-facturation du client, mais la marge réelle de Zen Events
sur cette transaction s'écarte de 5%. Accepté pour le MVP, à surveiller.

## 6. Reversement aux organisateurs (payout)

**Règle de timing** : un reversement n'est déclenché qu'**après la fin de
l'évènement** (`event.endAt < now()`), jamais en temps réel ni sur une base
périodique fixe (`docs/SPEC.md` §6). Raison : évite d'avoir à réclamer un
remboursement a posteriori si l'évènement est annulé ou fait l'objet de
remboursements avant son terme.

### 6.1 Déclenchement

- **Job planifié** (`@Cron`, quotidien — pas besoin de la granularité
  minute du job d'expiration des paniers) : `PayoutsService.runDueEventPayouts()`.
- **Déclenchement manuel** (Super Admin uniquement, mouvement d'argent réel) :
  `POST /admin/events/:eventId/payout` — ré-exécute la même logique pour un
  seul évènement (utile pour retenter un `FAILED`, ou pour tester en dev).

### 6.2 Éligibilité

Un évènement est éligible si :
- `event.endAt < now()` ;
- `event.status != CANCELLED` (un évènement annulé est exclu par
  construction — voir limite connue, section 12) ;
- pas de `payouts` row existante en statut `PAID` ou `PROCESSING` pour cet
  évènement (`UNIQUE(event_id)` en backstop DB, cohérent avec le pattern de
  garde-fou déjà utilisé pour l'anti-survente). Une row existante en
  `FAILED` reste éligible — **mise à jour en place**, pas de nouvelle row
  (garde le grand livre à une ligne par évènement).

### 6.3 Traitement par évènement éligible

1. `amountDue = SUM(order.subtotalAmount) WHERE order.eventId = :eventId AND order.status = 'PAID'`.
   Si `amountDue <= 0` (aucune commande payée) → aucun reversement, rien à
   créer.
2. `Payout.create` (ou update si row `FAILED` existante) : `status: PENDING`,
   `amountDue` — **avant** l'appel réseau à PayDunya (même logique que
   "réserver avant d'appeler le prestataire" du checkout : une row `PENDING`
   sans suite est un état détectable/rejouable plutôt qu'un versement perdu
   silencieusement).
3. `montantADecaisser = calculatePayoutAmount(amountDue)` (section 5).
4. Appel à l'**API Déboursement (PUSH)** PayDunya : transfert vers
   `organization.payoutPhoneNumber`. Forme exacte de l'appel SDK à
   reconfirmer contre la doc PayDunya à jour au moment de l'implémentation.
5. Succès : `Payout.status = PAID`, `amountPaid` (montant réellement
   confirmé par PayDunya), `providerTransactionId`, `rawResponse`,
   `triggeredAt = now()`.
6. Échec (numéro invalide, solde Zen Events insuffisant, erreur API) :
   `Payout.status = FAILED`, `rawResponse` capture l'erreur, log d'alerte
   pour investigation/nouvelle tentative manuelle. Pas de retry automatique
   dans cette passe (cohérent avec l'absence de module de remboursement
   automatisé, section 0).

## 7. Gestion des échecs à chaque étape

| Étape | Échec | Comportement |
| --- | --- | --- |
| Checkout | Quota épuisé pendant la transaction | `409`, rollback complet (aucune commande ni billet ne persiste) |
| Checkout | Appel `createInvoice` PayDunya échoue | Commande déjà créée → `CANCELLED` (billets `CANCELLED`, quota libéré), `503` |
| IPN | Hash invalide | `400`, aucune écriture, log sécurité (section 3) |
| IPN | Statut `completed` mais montant ≠ attendu | `Payment.status = FAILED`, `Order` reste `PENDING`, log d'alerte |
| IPN | Statut non `completed` | `Payment.status = FAILED`, `Order` reste `PENDING` (fenêtre de retry côté PayDunya jusqu'à `expiresAt`) |
| IPN | Reçu après expiration du panier | `Payment.status = SUCCESS` (traçabilité), `Order` reste `EXPIRED`, `AuditLog`, aucun ticket revalidé |
| Panier | `expiresAt` dépassé, jamais payé | Job d'expiration : `Order → EXPIRED`, `Ticket PENDING_PAYMENT → CANCELLED`, quota libéré |
| Payout | Déboursement échoué (numéro invalide, solde insuffisant) | `Payout.status = FAILED`, éligible à un nouveau passage du job |
| Payout | Évènement annulé avec des commandes déjà payées | Exclu du calcul automatique — nécessite un remboursement manuel (hors-scope) |

## 8. Endpoints API

| Méthode | Route | Auth | Payload | Réponse |
| --- | --- | --- | --- | --- |
| POST | `/orders/preview` | Public | `{ eventId, paymentChannel, items }` | `200 { subtotalAmount, serviceFeeAmount, totalAmount, currency }` |
| POST | `/orders` | Public | `{ eventId, buyerEmail, buyerPhone?, paymentChannel, items }` | `201 { orderId, paymentUrl, expiresAt, totalAmount }` |
| GET | `/orders/:orderId` | Public (UUID = accès) | — | `200` statut + lignes + QR des billets `VALID` |
| POST | `/payments/webhooks/paydunya` | Aucune (hash IPN) | Corps PayDunya (`data` + `hash`) | `200` (traité) / `400` (hash invalide) |
| GET | `/organizations/:organizationId/events/:eventId/orders` | JWT + `OrganizationRolesGuard` (`ALL_MEMBER_ROLES`) | — | `200` liste des commandes de l'évènement |
| GET | `/organizations/:organizationId/payouts` | JWT + `OrganizationRolesGuard` (`OWNER, CO_ORGANIZER, ACCOUNTANT`) | — | `200` grand livre des reversements de l'organisation |
| POST | `/admin/events/:eventId/payout` | JWT + `SuperAdminGuard` | — | `200`/`201` résultat du déclenchement (ou `204` si non éligible) |

## 9. Cas limites à couvrir par des tests

1. **Checkout nominal** : panier valide → `201`, billets `PENDING_PAYMENT`,
   `quantity_sold` incrémenté, `subtotalAmount + serviceFeeAmount = totalAmount`
   exactement (test déjà existant à réutiliser comme base :
   `ticket-capacity.e2e-spec.ts`).
2. **Sold out pendant le checkout** : `409`, **aucun** billet ni commande ne
   doit persister (transaction entièrement roll-backée).
3. **Hash IPN invalide** : `400`, aucune écriture DB (vérifier `Order`,
   `Ticket`, `Payment` inchangés), rien n'est journalisé comme succès.
4. **IPN dupliqué** (même succès envoyé deux fois) : un seul `Payment SUCCESS`,
   tickets `VALID` une seule fois.
5. **IPN reçu après expiration du panier** : `Payment.status = SUCCESS` créé
   pour traçabilité, `Order.status` reste `EXPIRED`, `AuditLog` créé, aucun
   `Ticket` revalidé, `quantity_sold` non ré-incrémenté.
6. **Montant IPN différent du montant attendu** : `Payment.status = FAILED`
   avec l'écart dans `rawResponse`, `Order.status` reste `PENDING`.
7. **Deux IPN quasi simultanés pour la même commande** : `Promise.allSettled`
   sur deux appels concurrents du handler de confirmation (statut vérifié
   simulé comme déjà `completed` pour les deux) → un seul provoque la
   transition `PENDING → PAID`, l'autre constate `0` ligne affectée ;
   `Payment.status = SUCCESS` une seule fois au final.
8. **Job d'expiration** : commande avec `expiresAt` dans le passé → `EXPIRED`,
   billets `PENDING_PAYMENT → CANCELLED`, `quantity_sold` redescend d'autant.
9. **Tentative de reversement en double pour le même évènement** : deux
   appels concurrents (ou un déclenchement manuel après le job) sur le même
   évènement déjà `PAID` → un seul `payouts` row créé (`UNIQUE(event_id)`),
   le second appel constate l'éligibilité déjà consommée et sort sans
   dupliquer.
10. **Évènement annulé après que certains billets ont déjà été payés** :
    exclu du calcul de reversement automatique (`status = CANCELLED`),
    aucune ligne `payouts` créée même si des commandes `PAID` existent.
11. **Échec du déboursement** (numéro invalide/solde insuffisant simulé) :
    `Payout.status = FAILED`, un nouveau passage du job retente la même row
    (pas de doublon).

## 10. Fichiers concernés (pour l'implémentation à venir)

- `backend/src/orders/dto/checkout.dto.ts`, `preview.dto.ts` (nouveaux)
- `backend/src/orders/orders.service.ts` (à écrire : `preview`, `checkout`,
  `findPublicById`, `findAllForEvent`)
- `backend/src/orders/orders.controller.ts` (`POST /orders/preview`,
  `POST /orders`, `GET /orders/:orderId`)
- `backend/src/orders/organizer-orders.controller.ts` (nouveau,
  `GET organizations/:organizationId/events/:eventId/orders`)
- `backend/src/orders/orders-expiration.job.ts` (à implémenter, squelette
  déjà en place)
- `backend/src/orders/orders.module.ts` (imports `TicketsModule`,
  `PaymentsModule`, `EventsModule`)
- `backend/src/payments/payments.controller.ts` (`POST /payments/webhooks/paydunya`)
- `backend/src/payments/payments.service.ts` (vérification hash, confirmation
  idempotente, `UPDATE` conditionnel)
- `backend/src/payments/providers/paydunya.provider.ts` (à implémenter :
  `createInvoice`, `disburse`)
- `backend/src/payments/pricing/payout-amount.ts` (nouveau :
  `calculatePayoutAmount`, isolé — section 5)
- `backend/src/payments/pricing/pricing.service.ts` (nouveau :
  `quoteCheckout`, réutilise `payout-amount.ts`)
- `backend/src/payouts/payouts.service.ts`, `payouts.controller.ts`,
  `payouts.module.ts`, `payouts-scheduler.job.ts` (nouveau module)
- `backend/src/tickets/tickets.service.ts` (génération de `qrToken`
  sécurisé, réutilisé par le checkout)
- `backend/test/orders.e2e-spec.ts`, `payments-webhook.e2e-spec.ts`,
  `payouts.e2e-spec.ts` (nouveaux, couvrent la section 9)
- **Aucune migration Prisma requise pour l'implémentation elle-même** — le
  schéma nécessaire (`orders.subtotal_amount`/`service_fee_amount`,
  `payouts`, `organizations.payout_phone_number`) est déjà en place
  (migration `20260818190830_add_payouts_and_order_fees`).
- **`backend/package.json`** : ajouter la dépendance `paydunya` (SDK
  officiel, `npm install paydunya`).

## 11. Variables d'environnement

Déjà présentes dans `backend/.env.example` : `PAYDUNYA_MASTER_KEY`,
`PAYDUNYA_PRIVATE_KEY`, `PAYDUNYA_TOKEN`. **À ajouter au moment de
l'implémentation** (absentes malgré le SDK qui les exige toutes les deux,
`docs/SPEC.md` §5.2) : `PAYDUNYA_PUBLIC_KEY`, `PAYDUNYA_MODE` (`test`/`live`).

## 12. Limites connues de cette spec

- **Hypothèse non confirmée** (`docs/SPEC.md` §5.3) : le sens de déduction
  des frais de payout (déduits du montant décaissé vs. prélevés à part sur
  le solde Zen Events). La formule de ce document et `calculatePayoutAmount()`
  supposent le premier cas (le plus prudent). Isolé dans un seul fichier
  pour correction facile si PayDunya confirme l'autre modèle (réponse email
  en attente).
- Les noms exacts des champs IPN (statut `completed`, emplacement de
  `custom_data`/`orderId`, forme exacte de l'appel `createInvoice`/API
  Déboursement) sont posés sur la base de la documentation publique connue
  de PayDunya au moment de la rédaction ; à reconfirmer contre leur
  documentation actuelle avant d'écrire `paydunya.provider.ts`.
- La vérification IPN décrite (section 3) suit strictement ce que
  `docs/SPEC.md` §5.4 spécifie (hash de la masterKey). Une seconde couche
  de vérification — rappeler une API de confirmation PayDunya en
  server-to-server, dans l'esprit du modèle CinetPay précédemment envisagé
  — pourrait renforcer la robustesse contre un hash qui fuiterait, mais
  n'est **pas** requise par la spec actuelle et n'est donc pas incluse dans
  le flux principal ci-dessus. À évaluer séparément si jugé utile.
- Le cas "changement d'instrument sur la page hébergée PayDunya après
  sélection d'un canal différent sur notre checkout" (section 5) n'est pas
  bloqué techniquement — seulement documenté comme limite acceptée.
- "Webhook tardif après expiration" (section 4, point 5) laisse une trace
  pour traitement humain plutôt que de rembourser automatiquement — aucun
  module de remboursement n'existe encore dans ce projet.
- Le reversement suppose un unique moyen de payout par organisation
  (`payout_phone_number`, mobile money uniquement) — pas de choix de canal
  Djamo côté payout dans ce MVP, cohérent avec `docs/SPEC.md` §5.6.
