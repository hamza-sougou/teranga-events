# Event Manager App — Spécification du projet

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
| Paiement | CinetPay ou PayDunya (+ Stripe en complément carte internationale) | IntouchPay |
| Stockage fichiers | S3 / Cloudflare R2 | — |
| Hébergement | DigitalOcean / Render | AWS (région Cape Town) |
| ORM | Prisma (garder les triggers SQL en migrations manuelles) | Drizzle |

---

## 3. Modules fonctionnels

1. **Gestion des évènements** — création multi-types, page publique par évènement
2. **Billetterie** — types de billets : standard, VIP, early bird, **prévente**, groupe. Génération unitaire ou par lot.
3. **Vente & paiement** — panier, checkout, mobile money prioritaire (Wave/Orange Money via agrégateur), codes promo
4. **Scan & contrôle d'accès** — app mobile offline-first, un ticket = un scan
5. **Gestion des équipes** — CRUD des employés par l'organisateur avec rôles
6. **Tableau de bord & statistiques** — ventes temps réel, taux de remplissage, exports
7. **Notifications** — email/SMS confirmation, rappel, annulation

---

## 4. Règles métier critiques

### Anti-survente
La réservation du stock se fait via un **trigger PostgreSQL** (`fn_reserve_ticket_capacity`), pas dans le code applicatif. Dès qu'une ligne `tickets` est insérée (statut `pending_payment`, donc dès l'ajout au panier), le trigger incrémente `quantity_sold` de façon atomique et refuse l'insertion si le quota est atteint. Backstop : `CHECK (quantity_sold <= quantity_total)` au niveau table.

### Expiration des paniers
Chaque commande a un `expires_at` (~15 min). Un job planifié annule les commandes non payées après ce délai, ce qui libère automatiquement le quota via le trigger de libération.

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

---

## 5. Roadmap

- **Phase 1 (MVP)** : auth multi-rôles, création d'évènement, génération tickets QR, vente carte bancaire, scan basique, dashboard simple
- **Phase 2** : mobile money, gestion avancée des employés, statistiques détaillées, codes promo, mode offline du scan
- **Phase 3** : app participant (wallet), revente sécurisée, pass saison, API publique
- **Phase 4** : marque blanche, BI avancée, assurance annulation, détection de fraude par IA

---

## 6. Base de données

Le schéma complet (tables, types énumérés, contraintes, triggers) est dans `db/schema.sql`. Ne pas le régénérer depuis un ORM sans réintégrer manuellement les triggers `fn_reserve_ticket_capacity` et `fn_release_ticket_capacity`.