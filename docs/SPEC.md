# Event Manager App (Zen Events) — Spécification du projet

Plateforme SaaS de billetterie événementielle (festivals, soirées, concerts, cérémonies) avec génération de tickets QR code, vente en ligne, et contrôle d'accès.

Voir `db/schema.sql` pour le détail exhaustif des tables et contraintes. Ce document sert de point de référence pour Claude Code — le consulter avant d'implémenter un nouveau module.

---

## 1. Profils utilisateurs

| Profil | Rôle | Appareil(s) |
|---|---|---|
| **Super Admin** | Contrôle total de la plateforme (validation organisateurs, modération, finances plateforme) | Web uniquement |
| **Organisateur** | Créateur du compte évènementiel. Génère les tickets, gère l'équipe, consulte les stats | Web + Mobile |
| **Co-organisateur** | Gestion quasi complète d'un évènement spécifique, permissions réduites (pas de facturation) | Web + Mobile |
| **Vendeur** | Vente terrain, encaissement, génération instantanée de tickets | Mobile (app dédiée) + Web (stats) |
| **Contrôleur / Vigile** | Scan des QR codes à l'entrée, mode offline obligatoire | Mobile uniquement |
| **Comptable** *(optionnel)* | Consultation revenus, factures, exports comptables | Web uniquement |
| **Support plateforme** *(optionnel, interne au Super Admin)* | Gestion litiges et modération | Web uniquement |
| **Acheteur / Participant** | Achète et utilise le ticket | Web (achat) + Mobile (wallet optionnel) |

Produits à construire : (1) back-office web (Super Admin/Comptable/Support), (2) app Organisateur web+mobile (Organisateur/Co-organisateur/Vendeur), (3) app Scan mobile dédiée (Contrôleur), (4) interface participant web.

---

## 2. Stack technique retenue

| Couche | Techno | Alternative |
|---|---|---|
| Backend | Node.js + NestJS (TypeScript) | Laravel (PHP) |
| Base de données | PostgreSQL | — |
| Cache / files | Redis | — |
| Frontend web | Next.js + Tailwind CSS | — |
| Mobile (organisateur, scan) | Flutter | React Native |
| Paiement | **PayDunya** (cartes Visa/Mastercard + Wave/Orange Money/Free Money/Djamo via une seule API) | — |
| Stockage fichiers | S3 / Cloudflare R2 | — |
| Hébergement | DigitalOcean / Render | AWS (région Cape Town) |
| ORM | Prisma (garder les triggers SQL en migrations manuelles) | Drizzle |

> **Historique des changements de fournisseur de paiement** :
> - **Stripe retiré** : n'accepte pas les entreprises enregistrées au Sénégal.
> - **CinetPay abandonné au profit de PayDunya** : inscription CinetPay restée non validée (ils demandent une fourchette de bénéfices actuels et un site web fonctionnel, deux critères non remplis à ce stade du projet). PayDunya a validé l'inscription et l'accès au dashboard est actif, y compris les clés API en mode test.

---

## 3. Modules fonctionnels

1. **Gestion des évènements** — création multi-types, médias (images/vidéos, stockage Cloudflare R2), géolocalisation (recherche OpenStreetMap/Nominatim en développement, Google Maps prévu en production — voir section 8), page publique par évènement
2. **Billetterie** — types de billets : standard, VIP, early bird, **prévente**, groupe. Génération unitaire ou par lot.
3. **Vente & paiement** — panier, checkout via PayDunya (API PAR — Paiement Avec Redirection), commission plateforme calculée dynamiquement, codes promo
4. **Reversement aux organisateurs** — déclenché après la fin de l'évènement, via l'API Déboursement PayDunya
5. **Scan & contrôle d'accès** — app mobile offline-first, un ticket = un scan
6. **Gestion des équipes** — CRUD des employés par l'organisateur avec rôles
7. **Tableau de bord & statistiques** — ventes temps réel, taux de remplissage, exports
8. **Notifications** — email/SMS confirmation, rappel, annulation
9. **Découverte / page d'accueil** — sections de listing d'évènements (tendance, proximité, mise en avant...), voir section 9

---

## 4. Règles métier critiques

### Anti-survente
La réservation du stock se fait via un **trigger PostgreSQL** (`fn_reserve_ticket_capacity`), pas dans le code applicatif. Dès qu'une ligne `tickets` est insérée (statut `pending_payment`, donc dès l'ajout au panier), le trigger incrémente `quantity_sold` de façon atomique et refuse l'insertion si le quota est atteint. Backstop : `CHECK (quantity_sold <= quantity_total)` au niveau table.

### Expiration des paniers
Chaque commande a un `expires_at` (~15 min, aligné sur la fenêtre de paiement PayDunya de 30 min — voir section 5). Un job planifié annule les commandes non payées après ce délai, ce qui libère automatiquement le quota via le trigger de libération.

### Anti-fraude scan
Le scan d'un ticket doit **toujours** passer par un `UPDATE` conditionnel unique, jamais un `SELECT` puis `UPDATE` séparés :
```sql
UPDATE tickets SET status = 'used', used_at = now()
WHERE id = :ticket_id AND status = 'valid'
RETURNING id;
```
Si 0 ligne retournée → ticket déjà utilisé/invalide → scan rejeté. Cette atomicité tient même avec deux vigiles scannant le même ticket simultanément.

### Préventes
Un `TicketType` avec `category = 'presale'`, une fenêtre `sale_start`/`sale_end`, et un `access_mode` pouvant être `presale_whitelist` (liste d'invités via la table `ticket_type_whitelist`) ou `public`.

### Médias requis à la publication
Un évènement peut avoir plusieurs images et plusieurs vidéos (relation one-to-many, table `event_media`), stockées sur Cloudflare R2 via upload direct navigateur → R2 (URL présignée, jamais de transit par le backend — important pour les vidéos). **Au moins une image est requise pour publier** (transition de statut vers `published`), jamais bloquant pour un brouillon. Limites (contexte mobile/data limité au Sénégal) : images JPEG/PNG/WebP, 5 Mo max, 8 par évènement ; vidéos MP4/H.264 uniquement, 50 Mo max, 2 par évènement.

---

## 5. Paiement — intégration PayDunya

### 5.1 Choix d'API

PayDunya expose plusieurs APIs distinctes ; celle utilisée par Zen Events est le **PAR (Paiement Avec Redirection)** — recommandée par PayDunya pour 99% des cas d'usage. Le client est redirigé vers la page de paiement PayDunya, choisit son moyen de paiement (carte, Wave, Orange Money, Free Money, Djamo), puis revient sur Zen Events.

Une seconde API, le **PER (Paiement Et Redistribution)**, existe pour les cas de marketplace où l'on reverse un pourcentage à chaque vente, avec l'avantage annoncé de ne pas être facturée en frais supplémentaires. **Statut : à l'étude, non retenue pour le MVP** — elle nécessiterait que chaque organisateur ait son propre compte PayDunya (la redistribution se fait entre comptes PayDunya), ce qui change le parcours d'onboarding organisateur par rapport au modèle actuel (reversement vers un simple numéro mobile money). À réévaluer une fois le MVP en place.

### 5.2 Configuration technique

SDK Node officiel : `npm install paydunya`. Quatre clés sont nécessaires, déjà obtenues (mode test) :

```javascript
var setup = new paydunya.Setup({
  masterKey: process.env.PAYDUNYA_MASTER_KEY,
  privateKey: process.env.PAYDUNYA_PRIVATE_KEY,
  publicKey: process.env.PAYDUNYA_PUBLIC_KEY,
  token: process.env.PAYDUNYA_TOKEN,
  mode: process.env.PAYDUNYA_MODE // 'test' ou 'live'
});
```

Le SDK détecte automatiquement ces 4 variables d'environnement si `paydunya.Setup` est initialisé sans paramètres — à privilégier plutôt que de coder les clés en dur.

**Le montant total facturé au client est calculé côté Zen Events, jamais par PayDunya** (`invoice.totalAmount`) — PayDunya ne fait aucun calcul serveur de son côté, il facture exactement le montant transmis.

**Contrainte de développement local** : l'IPN (webhook, voir 5.4) est un `POST` que PayDunya envoie vers une URL publique. `localhost` n'est pas joignable depuis leurs serveurs — un tunnel (ex. `ngrok http 3000`) est nécessaire pour tester le flux complet paiement → confirmation en développement.

### 5.3 Frais PayDunya (confirmés par le support/dashboard)

| Opération | Mobile money (Wave, Orange Money) | Carte | Djamo |
|---|---|---|---|
| **Payin** (client → Zen Events) | 2,25% | 3,25% | 2% |
| **Payout** (Zen Events → organisateur) | 2% | — | 1,50% |

- **Payin** = frais prélevés quand l'argent entre sur le compte PayDunya de Zen Events (paiement du client).
- **Payout** = frais prélevés quand Zen Events envoie de l'argent vers un autre wallet (reversement à l'organisateur, via l'API Déboursement/PUSH).
- **Les deux s'appliquent** dans le fonctionnement de Zen Events, puisque l'argent transite : client → Zen Events (payin) → organisateur (payout).
- Email envoyé au support PayDunya pour confirmer un point non documenté publiquement : lors d'un déboursement d'un montant X, les frais sont-ils déduits de X (l'organisateur reçoit moins que X) ou prélevés en plus sur le solde Zen Events (l'organisateur reçoit exactement X) ? **Réponse en attente.** La formule ci-dessous est bâtie sur l'hypothèse la plus prudente (frais déduits du montant décaissé) — à corriger si PayDunya confirme l'autre modèle.

### 5.4 Vérification de l'IPN (webhook)

PayDunya envoie un `POST` (`application/x-www-form-urlencoded`) contenant les données sous la clé `data`, incluant un `hash`. Ce hash est le **SHA-512 de la clé principale (masterKey)** — le recalculer côté serveur et le comparer à celui reçu permet de vérifier que la requête provient bien de PayDunya avant tout traitement backoffice (mise à jour `order.status`, `ticket.status`).

### 5.5 Modèle de commission

**Commission cible : 5% du prix du ticket fixé par l'organisateur, quel que soit le moyen de paiement choisi par le client** (mobile money ou carte — pas de taux différencié entre les deux).

Comme PayDunya prélève ses frais sur celui qui reçoit l'argent (pas sur le payeur), et que Zen Events encaisse via payin puis décaisse via payout, le prix affiché au client doit être calculé pour absorber les deux frais tout en garantissant 5% de marge nette sur le prix organisateur :

```
Montant à décaisser à l'organisateur = Prix_organisateur / (1 - taux_payout)
Solde nécessaire après payin        = Montant_à_décaisser + (Prix_organisateur × 5%)
Prix affiché au client              = Solde_nécessaire / (1 - taux_payin_du_canal_choisi)
```

**Exemple chiffré — ticket à 5 000 FCFA, reversement organisateur en mobile money (payout 2%) :**

| Canal de paiement client | Payin | Prix affiché au client | Zen Events garde | Organisateur reçoit |
|---|---|---|---|---|
| Mobile money | 2,25% | **≈ 5 475 FCFA** | ≈ 250 FCFA (5%) | 5 000 FCFA |
| Carte | 3,25% | **≈ 5 534 FCFA** | ≈ 250 FCFA (5%) | 5 000 FCFA |
| Djamo | 2% | **≈ 5 461 FCFA** | ≈ 250 FCFA (5%) | 5 000 FCFA |

Le prix affiché varie légèrement selon le canal choisi par le client (le payin diffère), mais la marge nette Zen Events reste fixée à 5% dans tous les cas — contrairement à un taux de majoration fixe (ex: +5%/+6%) qui, lui, ferait varier la marge réelle selon le canal.

### 5.6 Conséquences sur le schéma de données

- `orders` doit distinguer le montant dû à l'organisateur du montant total payé par le client : ajouter `subtotal_amount` (part organisateur) et `service_fee_amount` (commission Zen Events, incluant le tampon de frais PayDunya), en plus de `total_amount` (= somme des deux, montant réellement facturé au client).
- Une table `payouts` est nécessaire pour tenir le grand livre des reversements : montant dû par organisateur/évènement, montant effectivement versé, statut, référence de la transaction PayDunya (déboursement).
- Un moyen de reversement (numéro mobile money) doit être associé à chaque organisation — à ajouter dans `organizations` ou une table dédiée `organization_payout_methods`.

---

## 6. Reversement aux organisateurs (payout)

**Règle de timing : le reversement n'est déclenché qu'après la fin de l'évènement**, jamais en temps réel ni sur une base hebdomadaire fixe. Raison : si l'évènement est annulé ou fait l'objet de remboursements avant son terme, aucun argent n'a encore été versé à l'organisateur — évite d'avoir à réclamer un remboursement a posteriori.

Mécanisme : appel à l'**API Déboursement (PUSH)** de PayDunya, qui transfère programmatiquement depuis le solde Zen Events vers le numéro mobile money enregistré de l'organisateur. Alternative manuelle disponible depuis le dashboard PayDunya (retrait vers mobile money ou compte bancaire) — à garder en secours mais l'automatisation via l'API est la cible pour scaler au-delà de quelques organisateurs.

> **Évolution envisagée, non retenue pour le MVP** : proposer plus tard le choix entre reversement à la fin de l'évènement et reversement périodique (ex: tous les 15 jours), réservé aux organisateurs ayant déjà complété au moins un évènement sans incident sur Zen Events — même logique de confiance progressive qu'Eventbrite (nouveaux comptes forcés sur le modèle le plus prudent, options plus rapides débloquées avec l'historique). Impliquerait de retenir une réserve (pourcentage du montant) jusqu'à la fin de l'évènement même en cas de versement anticipé, pour absorber un risque de remboursement/annulation après coup. À reprendre en Phase 2/3, pas avant.

---

## 7. Roadmap

- **Phase 1 (MVP)** : auth multi-rôles, création d'évènement, génération tickets QR, vente via PayDunya (API PAR), reversement organisateur après évènement, scan basique, dashboard simple
- **Phase 2** : gestion avancée des employés, statistiques détaillées, codes promo, mode offline du scan
- **Phase 3** : app participant (wallet), revente sécurisée, pass saison, API publique, réévaluation de l'API PER PayDunya
- **Phase 4** : marque blanche, BI avancée, assurance annulation, détection de fraude par IA

---

## 8. Base de données

Le schéma complet (tables, types énumérés, contraintes, triggers) est dans `db/schema.sql`. Ne pas le régénérer depuis un ORM sans réintégrer manuellement les triggers `fn_reserve_ticket_capacity` et `fn_release_ticket_capacity`.

Corrections à apporter suite à la section 5 :
- L'enum `payment_provider` doit avoir `paydunya` comme valeur active ; retirer `stripe`. `cinetpay` peut être conservé dans l'enum à titre de réserve future (inscription non validée pour l'instant, non utilisée dans le code) plutôt que supprimé, pour éviter une migration supplémentaire si le compte venait à être validé plus tard.
- Ajouter `orders.subtotal_amount` et `orders.service_fee_amount` (voir 5.6).
- Ajouter la table `payouts` (voir 5.6).
- Ajouter un moyen de reversement mobile money par organisation (voir 5.6).

> **✅ Ces quatre corrections sont appliquées** dans `db/schema.sql` et `backend/prisma/schema.prisma` (voir `PROGRESS.md` §1 pour le détail des migrations). Cette section reste la trace de la décision d'origine, pas une tâche en attente.

Rappel technique (section 5.4) : toute vérification d'IPN PayDunya doit comparer le hash reçu au SHA-512 de la clé principale avant tout traitement — ne jamais faire confiance à une requête entrante sans cette vérification.

### Géolocalisation des évènements

`events` gagne `country` (`VARCHAR(100)`, défaut `'Sénégal'`), `city` (`VARCHAR(100)`, nullable), `latitude`/`longitude` (`DECIMAL(9,6)`, nullables, toujours pairées — `CHECK (latitude IS NULL) = (longitude IS NULL)`), en complément de `venue_name`/`address` qui restent du texte libre. Ces quatre champs remplacent le couple texte libre par un vrai point géographique, sans supprimer la saisie manuelle : l'organisateur recherche un lieu (Nominatim/OpenStreetMap en développement), sélectionne un résultat qui préremplit Pays/Ville/Adresse, ou place le point manuellement sur la carte — les quatre champs restent modifiables à la main dans tous les cas.

Le fournisseur de géocodage est isolé derrière une interface (`GeocodingProvider`, `backend/src/geocoding/`) précisément pour permettre un remplacement par Google Maps en production sans changement de schéma, d'endpoint (`GET /geocode/search`) ni de frontend — seul le fournisseur derrière l'interface change. Voir `docs/INFRASTRUCTURE.md` §12 pour l'état de cette bascule et `PROGRESS.md` §3 pour le détail d'implémentation.

### Paramètres optionnels d'évènement (âge minimum & dress code)

`events` gagne `min_age` (`INTEGER`, nullable, `NULL` = tout le monde). Pas de champ séparé pour un raccourci "18+" — c'est uniquement `min_age = 18`, une facilité d'interface côté frontend, pas une structure de données distincte.

Nouvelle table `event_dress_codes` (one-to-many) : chaque ligne est un libellé (`label VARCHAR(25)`) rattaché à une catégorie de public (`applies_to`, enum `dress_code_audience` : `everyone`/`men`/`women`, défaut `everyone`), plus un `sort_order`. Règle : maximum 3 entrées par valeur de `applies_to`, les trois compartiments sont indépendants (pas de comptage croisé) — jusqu'à 9 lignes au total par évènement. Cette règle est validée côté application (`EventsService`), volontairement pas en `CHECK`/trigger SQL — contrainte cosmétique, pas critique comme l'anti-survente ou l'anti-fraude scan (section 4).

Les deux réglages restent entièrement facultatifs : un évènement sans aucun des deux reste valide. Exposés sur la vue organisateur (édition) et sur la page publique de l'évènement, au même titre que `category`/`media` — un acheteur potentiel a un intérêt direct à voir ces informations avant l'achat. Voir `PROGRESS.md` section 3 pour le détail d'implémentation (migration, DTOs, tests).

---

## 9. Page d'accueil — sections de découverte

**Statut : backend implémenté** (8 endpoints publics sous `/discover/*`, un par section — voir `PROGRESS.md` §14 pour le détail ; "Vus récemment" reste 100% frontend, voir 9.1), **frontend pas encore construit** (maquette puis page à faire). La page d'accueil est structurée exclusivement autour de listes/carrousels d'évènements — volontairement aucun contenu éditorial fixe (paragraphes, bannières statiques). L'application doit se comporter comme une boutique en ligne : on l'ouvre, on voit directement des évènements.

### 9.1 Les neuf sections et leur source

| Section | Source des données | Ajout nécessaire |
|---|---|---|
| **En tendance** | `orders` (statut `PAID`) + `order_items`, groupés par évènement sur une fenêtre récente (ex. 7 jours) | Aucun — nouvelle requête sur données existantes. Ne pas utiliser `ticket_types.quantity_sold` seul (cumulatif depuis toujours, pas représentatif d'une dynamique récente) |
| **Ce week-end** | `events.start_at` (fenêtre vendredi-dimanche à venir) + `status = PUBLISHED` | Aucun |
| **Vus récemment** | **Entièrement côté client** (`localStorage` du navigateur) — aucun compte participant n'existe (achat 100% invité), donc pas de tracking serveur | Aucun — zéro backend, session frontend dédiée |
| **Près de toi** | `events.latitude`/`longitude` (existant) + position du navigateur, formule de Haversine en SQL | Nouvel endpoint uniquement, pas de colonne (même raisonnement que pour la carte évènement : pas de PostGIS) |
| **Sponsorisés** | Nouvelle table `event_promotions` (voir 9.2) | Nouvelle table |
| **Publiés récemment** | `events.published_at` (nouveau, voir 9.3) | Nouvelle colonne |
| **Par catégorie** | `event_categories` (existant) | Aucun |
| **Dernière chance** | `ticket_types.quantity_sold`/`quantity_total` (>85% vendu) et/ou `events.start_at` proche (48-72h) | Aucun |
| **Gratuit** | `ticket_types.price = 0` | Aucun |

### 9.2 Table `event_promotions`

Mise en avant/sponsoring **entièrement pilotée par le Super Admin** pour le MVP — pas de self-service payant, aucune logique de facturation branchée sur `subscriptions`.

```sql
CREATE TABLE event_promotions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type        promotion_type NOT NULL,  -- enum: 'featured' / 'sponsored'
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  created_by  UUID NOT NULL REFERENCES users(id),  -- le Super Admin qui l'a activé
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Bornée dans le temps (`starts_at`/`ends_at`) plutôt qu'un simple booléen — une mise en avant expirée sort automatiquement de la sélection, pas de nettoyage manuel à faire. Cette table est indépendante de toute logique de partenariat organisationnel (voir 9.4) — utilisable pour n'importe quelle mise en avant ponctuelle décidée par le Super Admin.

### 9.3 `events.published_at`

Nouveau champ (`TIMESTAMPTZ`, nullable), rempli au moment de la transition de statut vers `PUBLISHED` — distinct de `created_at`, qui correspond à la création du brouillon et peut précéder la publication de plusieurs semaines. Trier sur `created_at` pour "publiés récemment" donnerait un classement trompeur.

### 9.4 Programme "Partenaires" — à l'étude, non retenu pour cette passe

Idée explorée avec l'utilisateur : proposer à des organisateurs déjà réputés (soirées dansantes à Dakar) une mise en avant prolongée en échange de promotion croisée (partage du lien, logo sur leurs affiches). Le volet **commission réduite en contrepartie a été mis de côté** — l'utilisateur souhaite y réfléchir plus en profondeur avant de le construire, l'impact sur l'organisateur restant à mieux évaluer. **Aucun champ `organizations` lié à un statut de partenaire (`is_founding_partner`, `commission_override_percent`, etc.) n'est construit dans cette passe.** `event_promotions` (9.2) reste utilisable indépendamment pour toute mise en avant Super Admin, avec ou sans programme partenaires formel derrière — à reprendre plus tard si l'utilisateur valide la mécanique de commission.