# Zen Events — Infrastructure

Ce document couvre le _comment ça tourne_ (déploiement, sécurité réseau, observabilité) — pas le métier, qui reste dans `docs/SPEC.md`. À consulter avant toute tâche touchant au déploiement, à la configuration serveur, ou à la sécurité d'infrastructure.

Chaque tâche est marquée **[Claude Code]** ou **[Vous]** :

- **[Claude Code]** — exécutable directement, aucune dépendance externe.
- **[Vous]** — nécessite un compte, une clé ou une ressource sur un tableau de bord externe que Claude Code ne peut pas créer à votre place. Une fois la ressource créée, transmettez la valeur obtenue (URL, clé, token) à Claude Code pour qu'il la branche dans le code — toujours en variable d'environnement, jamais en dur dans un fichier.

Si Claude Code rencontre une tâche **[Vous]** non encore fournie, il doit s'arrêter et la lister plutôt que d'inventer une valeur placeholder.

---

## Vue d'ensemble rapide

| Domaine              | [Claude Code]                                                                   | [Vous]                                                                  |
| -------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Docker               | `Dockerfile`, `docker-compose.yml`                                              | Rien — Docker Desktop déjà installé et prêt                             |
| Base de données      | Config pooling côté Prisma, structure staging                                   | Créer la base managée (DigitalOcean/Render), fournir les `DATABASE_URL` |
| Redis                | Jobs BullMQ, rate limiting, cache                                               | Provisionner Redis managé pour la prod, fournir le `REDIS_URL`          |
| Sécurité applicative | Throttler, Helmet.js, CORS, validation des env vars                             | Activer Cloudflare sur le domaine (dépend de la section Domaine)        |
| Observabilité        | Intégration SDK Sentry, endpoint `/health`, logs structurés                     | Créer le compte Sentry (DSN), configurer UptimeRobot sur `/health`      |
| Stockage fichiers    | Logique d'upload, URLs signées                                                  | Créer le bucket S3/R2, fournir les clés d'accès                         |
| CI/CD                | `ci.yml` complet, étapes de déploiement                                         | Ajouter les secrets de déploiement dans GitHub (token hébergeur)        |
| Domaine & email      | —                                                                               | DNS, SPF/DKIM/DMARC (panneau du registrar)                              |
| PayDunya live        | Lire les nouvelles variables d'environnement, vérifier le switch mode test/live | Récupérer les clés `live`, mettre à jour l'URL IPN dans leur dashboard  |

---

## 1. État actuel

- **Docker** — fait : `backend/Dockerfile` (build multi-stage) + `docker-compose.yml` (postgres/redis/backend) à la racine, `.dockerignore`. Vérifié en conditions réelles : build, boot, `GET /health` → `200` (DB jointe) et `503` (DB coupée). Deux pièges rencontrés et corrigés : `npm ci` en monorepo workspaces ne crée pas de `backend/node_modules` séparé (tout est hissé à la racine) ; l'image `node:20-slim` n'a pas `libssl` par défaut, ce qui faisait générer un client Prisma pour la mauvaise version d'OpenSSL au moment du build (`openssl` installé explicitement dans les deux stages qui en ont besoin).
- **Sécurité applicative** — fait : Helmet, CORS restreint à une liste blanche (`CORS_ORIGINS`), `@nestjs/throttler` (désactivé sous `NODE_ENV=test` pour ne pas casser la suite de tests e2e), validation stricte des variables d'environnement structurelles au boot (`env.validation.ts`, sans casser la dégradation gracieuse déjà en place pour Google/PayDunya/SMTP).
- **Observabilité** — fait côté code : `GET /health`, logs structurés (`nestjs-pino`, JSON en prod, silencieux en test), intégration `@sentry/node` (inactive tant que `SENTRY_DSN` n'est pas fourni — voir section "Ce qu'il me faut" plus bas). Audit des logs existants effectué : aucun secret/clé API/mot de passe n'est jamais loggé (uniquement IDs, montants, messages d'erreur).
- **CI** — fait : `.github/workflows/ci.yml` (lint, type-check, migrations, tests unitaires + e2e, build de l'image Docker). Étapes de déploiement volontairement absentes (aucun hébergeur choisi — voir section 3). `backend/.eslintrc.js` créé au passage (les dépendances ESLint existaient dans le scaffold initial mais n'avaient jamais été câblées — aucune config ne fonctionnait avant cette passe).
- **Redis** — dépendance `ioredis` présente, provisionné via Docker, mais toujours pas branché à l'application (jobs, rate-limiting, cache) — décision explicite : `@Cron` reste en place tant qu'une seule instance backend tourne.
- **Stockage fichiers (S3 / Cloudflare R2)** — pas configuré. Pas de champ image sur `events` dans le schéma actuel ni d'endpoint d'upload nulle part — reporté à quand une fonctionnalité concrète en aura besoin, plutôt que d'écrire une logique sans appelant réel.
- **Hébergement** — aucun déploiement, ni staging ni production.
- **PayDunya** — mode `test` uniquement (clés sandbox). Le switch `test`/`live` est déjà entièrement piloté par `PAYDUNYA_MODE` (`PaydunyaProvider.buildSetup()`, module paiement) — la tâche [Claude Code] de la section 10 est donc déjà satisfaite, aucun nouveau code nécessaire au moment du passage en `live`.

---

## 2. Conteneurisation (Docker)

### Pourquoi

- **En local** : Redis n'a pas de build Windows officiellement maintenue. Docker est la façon la plus simple de le faire tourner sur la machine de développement.
- **En CI** : GitHub Actions utilise déjà des conteneurs Docker pour PostgreSQL dans les tests — dockeriser le backend rend l'environnement de test identique à celui de développement et de production.
- **En prod** : sans Docker, l'hébergeur reconstruit l'application à chaque déploiement sur ses propres machines — un environnement légèrement différent à chaque fois. Avec Docker, l'image construite et testée en CI est _exactement_ celle qui tourne en production.

### Tâches

- **[Claude Code]** Écrire le `Dockerfile` du backend NestJS.
- **[Claude Code]** Écrire `docker-compose.yml` (PostgreSQL + Redis + backend) pour le développement local.
- **[Vous]** Rien à préparer — Docker Desktop est déjà installé, Claude Code peut supposer que `docker` et `docker compose` sont disponibles en ligne de commande.

### Ce qui n'est pas concerné

Les apps Flutter (Organisateur, Scan) ne se dockerisent pas — ce sont des apps mobiles compilées, pas des services serveur.

---

## 3. Base de données

### Tâches

- **[Vous]** Créer un compte hébergeur (DigitalOcean ou Render) et provisionner une base PostgreSQL **managée** (pas auto-hébergée sur un simple VPS) — nécessaire pour les backups automatiques et le PITR.
- **[Vous]** Récupérer les `DATABASE_URL` de staging et de production, les transmettre à Claude Code.
- **[Claude Code]** Configurer le connection pooling (PgBouncer ou équivalent) côté Prisma une fois l'URL fournie.
- **[Claude Code]** Mettre en place la structure staging dans le code (variables d'environnement séparées, scripts de migration ciblant le bon environnement).

---

## 4. Redis

### Tâches

- **[Claude Code]** Implémenter les jobs BullMQ (expiration des paniers, déclenchement des reversements organisateur — actuellement décrits en théorie dans `docs/SPEC.md` sans infra d'exécution).
- **[Claude Code]** Mettre en place le rate limiting avec Redis comme store.
- **[Claude Code]** Cache pour les pages publiques d'évènement à fort trafic.
- **[Vous]** Provisionner une instance Redis managée pour la production (DigitalOcean ou Upstash), fournir le `REDIS_URL` correspondant.

---

## 5. Sécurité applicative

### Tâches

- **[Claude Code]** Rate limiting sur les endpoints sensibles (login, création de compte, checkout/paiement) via `@nestjs/throttler`.
- **[Claude Code]** Helmet.js (headers CSP, HSTS, X-Frame-Options).
- **[Claude Code]** CORS strict — liste blanche explicite des domaines autorisés, jamais de wildcard `*` en production.
- **[Claude Code]** Validation stricte des variables d'environnement au démarrage — l'application doit refuser de démarrer si une clé requise manque, plutôt que planter au premier appel en production.
- **[Vous]** Activer Cloudflare sur le domaine une fois celui-ci configuré (voir section 9) — protection DDoS/WAF en plus du CDN déjà prévu.

---

## 6. Observabilité

### Tâches

- **[Vous]** Créer un compte Sentry, récupérer le DSN.
- **[Claude Code]** Intégrer le SDK Sentry une fois le DSN fourni.
- **[Claude Code]** Endpoint `/health`.
- **[Vous]** Configurer UptimeRobot ou Better Uptime pour surveiller `/health` une fois l'application déployée.
- **[Claude Code]** Logs structurés, avec vérification qu'aucune donnée sensible (clé API, mot de passe, détails de paiement) n'y apparaît jamais.

---

## 7. Stockage fichiers (S3 / Cloudflare R2)

### Tâches

- **[Vous]** Créer le bucket, récupérer les clés d'accès.
- **[Claude Code]** Logique d'upload une fois les clés fournies : images d'évènements en accès public, exports comptables et reçus derrière des URLs signées à expiration courte (jamais un bucket public par défaut pour ces derniers).

---

## 8. CI/CD

### Tâches

- **[Claude Code]** `ci.yml` complet : lint, build, tests (incluant les tests de concurrence anti-survente et anti-fraude scan déjà exigés dans `CLAUDE.md`), build de l'image Docker.
- **[Claude Code]** Étapes de déploiement dans le pipeline : déploiement automatique sur staging à chaque merge sur `main`, `prisma migrate deploy` avant le démarrage du nouveau code, promotion vers la production déclenchée manuellement (jamais automatique — il y a de l'argent réel en jeu).
- **[Vous]** Ajouter les secrets de déploiement dans les paramètres GitHub (token de l'hébergeur) une fois le compte hébergeur créé (section 3).

---

## 9. Domaine & email

### Tâches

- **[Vous]** Configuration DNS du domaine (`api.`, `app.`, etc.) et enregistrements SPF/DKIM/DMARC pour le domaine d'envoi d'emails transactionnels, via le panneau du registrar/fournisseur email. Sans ça, les confirmations de commande (qui contiennent le lien du ticket) atterrissent en spam.

---

## 10. Passage de PayDunya en mode `live`

### Tâches

- **[Vous]** Récupérer les clés de production sur le dashboard PayDunya, mettre à jour l'URL de l'IPN pour qu'elle pointe vers l'URL de production (pas l'ancienne URL ngrok de développement).
- **[Claude Code]** Vérifier que le switch `test` → `live` se fait bien via variable d'environnement (`PAYDUNYA_MODE`), sans code en dur à modifier.

---

## 11. Ordre de priorité recommandé

Ce qui coûte le plus cher à corriger une fois qu'il y a de vrais utilisateurs et de vraies données — à faire en premier :

1. Environnement **staging** séparé (section 3)
2. **Backups automatiques** (section 3)
3. Pipeline de **déploiement** (section 8), pas seulement de validation

Le reste (monitoring avancé, cache Redis pour les pages publiques) peut arriver progressivement une fois le trafic réel observé.
