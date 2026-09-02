# Zen Events — Design System & plan de construction du frontend web

Ce document est la référence unique pour l'identité visuelle du frontend web (Next.js). Ne pas réinventer une couleur, une police ou un rayon de bordure en cours de route — tout ce qui est visuel doit venir d'ici. Les décisions métier restent dans `docs/SPEC.md` ; celui-ci ne couvre que la forme.

---

## 1. Maquettes de référence

- `design/mockups/zen-events-dashboard-mockup.html` — présente, validée. Référence visuelle exacte pour le tableau de bord organisateur (couleurs, typographie, densité, comportement du survol). Fichier HTML/CSS statique, pas du code Next.js — pas à copier tel quel dans les composants React.
- Maquette homepage — toujours **absente** (le design testé ne convenait pas, jamais remplacé), mais la page a été construite directement à partir des tokens de ce document plutôt que d'attendre une maquette dédiée (même décision que la page Création/édition d'évènement en son temps) — voir `PROGRESS.md` §15 et section 5 ci-dessous.

---

## 2. Design tokens

### Couleurs

| Token | Valeur | Usage |
|---|---|---|
| `--bg` | `#F6F4EE` | Fond de page par défaut (off-white) |
| `--card` | `#FFFFFF` | Fond des cartes/panneaux sur fond clair |
| `--ink` | `#17121F` | Sections sombres (sidebar, bandes de contraste), texte principal |
| `--ink-2` | `#241C33` | Variante plus claire de `--ink`, pour les états actifs/hover sur fond sombre |
| `--text` | `#17121F` | Texte principal sur fond clair |
| `--text-muted` | `#6E6779` | Texte secondaire sur fond clair |
| `--on-dark` | `#F6F4EE` | Texte principal sur fond sombre |
| `--on-dark-muted` | `#AFA6BE` | Texte secondaire sur fond sombre |
| `--indigo` | `#5533E0` | **Couleur signature** — CTA principaux, accents, liens actifs |
| `--amber` | `#FFB627` | Accent secondaire — mise en avant, statut "en attente" |
| `--emerald` | `#0FBF8F` | Accent de confiance — statuts positifs/vérifiés/actifs, jamais utilisé pour autre chose |
| `--border` | `rgba(23, 18, 31, 0.12)` | Bordures sur fond clair |
| `--radius` | `6px` | **Rayon unique** — cartes, boutons, tags, panneaux. Pas de formes en pilule sauf avatars/points ronds intentionnels |

**Règle stricte : aucune couleur en dur dans un composant.** Toute couleur référence un token ci-dessus. Objectif concret : changer la couleur de marque doit se faire en éditant une seule variable, pas en cherchant dans chaque fichier — exactement le problème qu'on a eu en changeant le rose en indigo, où deux couleurs avaient été codées en dur (`cover-4`, le bouton de la bande CTA) et ont dû être corrigées à la main après coup. Ne pas reproduire cette erreur dans le vrai code.

Couleurs de catégorie d'évènement (variété visuelle des cartes, pas sémantiques) : indigo `#5533E0`, ambre `#FFB627`, émeraude `#0FBF8F`, rose `#E0475C`, orange `#FF7A3D`, sarcelle `#17A8C4`.

### Typographie

- Police unique : **Archivo** (Google Fonts), poids 400/500/700/900.
- Titres de section ("kicker") : poids 900, majuscules, tracking légèrement resserré (`-0.01em` à `-0.02em`).
- Titres de type hero (phrases complètes) : poids 900, **pas** de majuscules forcées (perd en lisibilité/chaleur sur une phrase longue).
- Corps de texte : poids 400/500.
- Boutons, labels, badges : poids 600/700.

### Rayon de bordure
`--radius: 6px` partout, sans exception non justifiée. C'est un choix esthétique délibéré (structuré, pas "bulle SaaS générique") — ne pas réintroduire des pilules à 100px de rayon.

### Icônes
**Uniquement Iconify** (`@iconify/react`), jamais de SVG à la main ni une autre bibliothèque (lucide-react, heroicons, etc. en direct). Jeu d'icônes retenu : **Lucide** (`@iconify-icons/lucide`) — style trait fin, coins arrondis, `stroke-width: 2`, le plus proche du style dessiné dans les maquettes.

- Toujours via le point d'entrée **offline** : `import { Icon } from '@iconify/react/offline'` + `import xxx from '@iconify-icons/lucide/xxx'`, jamais `@iconify/react` seul (ce module par défaut appelle l'API Iconify au runtime — dépendance réseau externe évitable, à ne jamais introduire).
- Un composant nommé par icône (voir `web/src/components/dashboard/nav-icons.tsx` pour le modèle) plutôt que `<Icon icon={...} />` dispersé partout — permet de retrouver/remplacer une icône sans grep sur un nom de fichier `@iconify-icons/...`.
- `className` pour la taille (`h-[17px] w-[17px]` etc.), jamais de `width`/`height` en dur — cohérent avec le reste (tokens, pas de valeurs magiques par composant).

---

## 3. Motifs signature — à réutiliser, pas à réinventer par page

### Le "kicker" (trait + titre)
Un petit trait (30-36px de large, 4px de haut, `border-radius: 2px`) au-dessus de chaque titre de section, coloré selon le fond :
- Fond clair → `--indigo`
- Fond sombre → `--emerald`
- Fond de couleur saturée (bande CTA) → `--bg` (le trait clair reste visible sur l'accent foncé)

### Sections alternées
Ne jamais faire une page entièrement dans un seul fond. Alterner clair (`--bg`) / sombre (`--ink`) / couleur saturée (`--indigo` en bande pleine largeur) pour le rythme visuel — c'est la demande d'origine ("dynamisme et immersion"), pas une option.

### Couleurs de statut (sémantique stricte, jamais interchangeable)
- `--emerald` = positif / vérifié / actif ("Publié", "Sécurisé", "Versé")
- `--amber` = en attente / brouillon / prudence
- `--ink` (neutre, faible opacité) = terminé / neutre

### Le "billet vivant"
Anneaux de pulsation (`@keyframes pulse`) autour d'un ticket stylisé, avec légende "Code actualisé il y a X secondes" et point clignotant émeraude. Réservé aux contextes de confiance/marketing (hero, écran de visualisation du billet) — c'est l'écho visuel de la fonctionnalité de code rotatif documentée dans `docs/SPEC.md §9` (pas encore fonctionnelle côté backend, mais le motif visuel peut exister avant, à condition que ce soit clair que ce n'est pas encore branché à une vraie sécurité tant que la section 9 n'est pas implémentée).

### Exception ponctuelle — badge "eyebrow" du hero d'accueil
Le hero de la page d'accueil (`web/src/components/public/home-hero.tsx`) porte un badge pilule sombre (texte clair, majuscules) au-dessus du H1, **pas** le kicker standard (trait + titre) décrit plus haut. Traitement volontairement différent et ponctuel, propre à ce hero précis — pas un second motif signature à généraliser ailleurs. C'est aussi la seule dérogation actée à la règle "pas de formes en pilule sauf avatars/points ronds intentionnels" du §2 : justifiée ici par le même raisonnement (élément d'accroche isolé, pas un composant répété).

---

## 4. Exigences de qualité de code

- **Aucune couleur en dur** dans le JSX/CSS des composants — toujours via les tokens (variables CSS dans `globals.css`, reprises dans la config Tailwind pour que les classes utilitaires et le CSS brut restent synchronisés sur une seule source de vérité).
- **Composants réutilisables** pour tout motif répété : carte évènement, carte métrique, badge de statut, titre "kicker", variantes de bouton. Les maquettes dupliquent le HTML à des fins de démo — le vrai code ne doit pas.
- **Responsive obligatoire**, mobile-first, testé au minimum à trois largeurs : mobile (~375px), tablette (~768px), desktop (~1200px+). Les maquettes utilisent déjà des points de rupture à 860px et 560px comme base de départ.
- **Contraste vérifié à chaque changement de token** — pas juste à l'œil. Le passage rose → indigo a nécessité deux corrections manuelles de contraste ; un changement de couleur future doit être vérifié systématiquement, pas seulement visuellement.
- **Excellente UX** : retours visuels clairs (hover, focus, états de chargement), navigation prévisible, pas de surcharge d'animation — un seul motif signature orchestré (le billet vivant) plutôt que des effets dispersés partout.

---

## 5. Plan de construction — une page à la fois

Chaque page = une session Claude Code dédiée, en plan mode, validée avant de passer à la suivante. Ne pas enchaîner plusieurs pages dans une seule session, même si ça semble rapide — c'est le principe qu'on a posé pour pouvoir corriger vite si un design ne convient pas, sans avoir à défaire plusieurs pages d'un coup.

**Ordre revu par rapport à la version initiale de ce document** : Organisateur en premier, pas Participant. Le participant reste prioritaire commercialement (c'est lui qui génère le revenu), mais la page qui devait l'accueillir en premier (l'accueil) est celle qui a le plus de dépendances non résolues (voir "Repoussé" ci-dessous) — plutôt que d'attendre, on avance là où la maquette et le backend sont tous les deux prêts aujourd'hui.

### Organisateur (tableau de bord web) — en premier
1. ✅ **Tableau de bord** *(construit et vérifié visuellement — Playwright à 375/768/1280px, voir `PROGRESS.md` §12)* — backend prêt (`GET /organizations/:id/stats`, `/events`, `/payouts`, `/members`)
2. ✅ **Création / édition d'évènement** *(construite et vérifiée visuellement)* (types de billets, prévente incluse, upload médias images/vidéos via Cloudflare R2, géolocalisation Pays/Ville/Adresse/Lieu via recherche OpenStreetMap/Nominatim + carte Leaflet — **première intégration Leaflet du projet**, ajoutée après coup à cette page, voir `PROGRESS.md` §12bis) — backend prêt (`events`, `ticket-types`, `event-media`, `geocoding`)
3. Détail des ventes / historique de scan (lecture seule côté web) — backend prêt (`orders`, `scans`)
4. Gestion de l'équipe (CRUD employés + rôles) — backend prêt (`teams`)
5. Reversements (détail, historique) — backend prêt (`payouts`)
6. Paramètres du compte

### Participant / public
7. ✅ **Page détail évènement** *(construite et vérifiée visuellement, non commitée)* (hero image + chrono, sidesheet de sélection de billets, prix commission incluse, section Adresse + carte, section "Organisé par" en aperçu — voir `PROGRESS.md` §12septies/12octies) — backend prêt (`events`/`ticket-types` publics)
8. ✅ **Page d'accueil** *(construite et vérifiée visuellement, non commitée)* (route `/`, groupe `(public)` — hero dégradé indigo→ink + recherche + tendance, 8 sections de découverte, grille catégories, bande "Devenez organisateur", footer — voir `PROGRESS.md` §15) — backend prêt (`/discover/*`, `docs/SPEC.md §9`)
9. Panier / checkout — backend prêt (`orders/preview`, `orders`)
10. Redirection paiement PayDunya + page de confirmation — backend prêt, webhook déjà vérifié en conditions réelles (paiement sandbox réel via ngrok)
11. Connexion / inscription (email + Google) — backend prêt (`auth`)

### Super Admin (back-office plateforme)
1. ✅ **Validation des organisateurs** (`/admin/organizations` — shell `/admin` + liste + valider/rejeter) *(construite et vérifiée visuellement — Playwright à 375/768/1280px, voir `PROGRESS.md` §20)* — backend prêt (`admin/organizations`, `SuperAdminGuard` réutilisé)
2. ✅ **Modération — évènements (`/admin/events`) et suspension de compte (`/admin/organizations` étendue)** *(construite, vérifiée en conditions réelles via l'API — pas de Playwright disponible dans ce repo, même limite que les sections 17/18/19 — voir `PROGRESS.md` §21)* — backend prêt (`admin/events`, `admin/organizations/:id/suspension`)
3. ✅ **Finances plateforme** (`/admin/finances` — GMV, commission, reversements versés/en attente/en échec, croissance 6 mois) *(construite et vérifiée visuellement — Playwright à 375/768/1280px, voir `PROGRESS.md` §22)* — backend prêt (nouveau mini-module `admin-finance`, compose `StatsService`/`PayoutsService`)

### Repoussé — dépendances non résolues, ne pas démarrer avant qu'elles le soient
- **UI de connexion Super Admin (configuration/vérification TOTP)** — le backend (`docs/SPEC.md` §10.7) répond `totp_setup_required`/`totp_required` au lieu d'un `accessToken` classique pour ce compte, mais `/login` ne gère pas encore cette réponse : un Super Admin ne peut pas se connecter de bout en bout via le frontend actuel, indépendamment des pages Super Admin elles-mêmes (voir `PROGRESS.md` §20).