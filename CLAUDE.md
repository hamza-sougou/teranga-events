# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

The backend is fully built and tested (auth/roles, events, ticket types, orders/payments, scan, notifications, stats — see "Development workflow" below) and Infrastructure Phase 1 is done (Docker, security headers, structured logging, `/health`, CI). The frontend has its design-token foundation in place; Organizer Dashboard and Event creation/edit are built and visually verified — see PROGRESS.md
for the exact current list rather than trusting this sentence, which goes stale as soon as another page ships. **[PROGRESS.md](PROGRESS.md)** at the repo root is the living status document — read it first in a new session to see exactly what's done and what's next; update it after finishing a module or a frontend page. `git log` is authoritative for exact history if `PROGRESS.md` and reality ever diverge.

Reference documents:

- [docs/SPEC.md](docs/SPEC.md) — full French-language product/technical spec. Read this before implementing any module; it is the authoritative reference for roles, data model intent, and business rules.
- [db/schema.sql](db/schema.sql) — the PostgreSQL schema (tables, enums, constraints, triggers). This is the source of truth for anything Prisma can't express.
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — Prisma model definitions mirroring `db/schema.sql`. Lives under `backend/` (not the repo root) since the backend is the only consumer of the generated `PrismaClient`. **Deliberately omits** the `CHECK` constraints and the two capacity triggers (see "Critical business rules" below) — those are annotated in-file with a comment pointing back to `db/schema.sql` and must be added as hand-written SQL in a Prisma migration (`prisma migrate dev --create-only`), never regenerated from `schema.prisma` alone.
- [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) — deployment, security, and observability reference (Docker, database hosting, Redis, CI/CD, monitoring). Separate from `docs/SPEC.md` on purpose: this covers _how it runs_, not the product/business logic. Every task in it is tagged **[Claude Code]** (executable directly) or **[Vous]** (needs an external account/credential from the user first) — if a **[Vous]** task hasn't been provided yet, stop and list what's needed rather than inventing a placeholder value.
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — frontend visual identity: design tokens (colors, typography, radius, icons), signature patterns, and the page-by-page build plan for the Next.js web frontend. Every color must come from the CSS custom properties defined here — never hardcoded inline. Reference mockups (validated visual direction) live at `design/mockups/`; read this file before writing any frontend page.

## Repository layout

- `backend/` — NestJS API (TypeScript) + Prisma ORM. npm workspace.
- `web/` — Next.js 14 (App Router) + Tailwind frontend. npm workspace.
- `db/schema.sql` — hand-maintained SQL source of truth for triggers/CHECK constraints Prisma can't express.
- `design/mockups/` — static HTML/CSS reference mockups (validated visual direction, not copied into React verbatim).
- `docs/` — `SPEC.md` (product/business), `INFRASTRUCTURE.md` (deployment/ops), `DESIGN_SYSTEM.md` (frontend visual identity).
- `PROGRESS.md` — living status document at the repo root.

## Commands

Root is an npm-workspaces monorepo (`backend`, `web`); run `npm install` once at the root.

**Backend** (from repo root unless noted):

- Dev server (port 3000): `npm run dev:backend`
- Build: `npm run build --workspace=backend`
- Lint: `cd backend && npm run lint`
- Type-check: `cd backend && npx tsc --noEmit`
- Unit tests: `cd backend && npx jest`
- E2E tests (needs a real local PostgreSQL — see Docker below): `cd backend && npx jest --config ./test/jest-e2e.json`
- Single test file: `cd backend && npx jest --config ./test/jest-e2e.json scan.e2e-spec.ts`
- Prisma: `cd backend && npx prisma generate` / `npx prisma migrate dev --create-only` (always `--create-only` when the migration touches the two capacity triggers or CHECK constraints, so the hand-written SQL from `db/schema.sql` can be pasted in before applying) / `npx prisma validate`
- Health check once running: `GET /health`

**Web** (from repo root unless noted):

- Dev server (port 3001): `npm run dev:web`
- Build: `npm run build --workspace=web`
- Type-check: `cd web && npx tsc --noEmit`

**Docker** (local Postgres/Redis/backend, from repo root): `docker compose up -d` — Postgres is exposed on host port **5433**, not 5432, to avoid clashing with a native local Postgres install.

**CI**: `.github/workflows/ci.yml` runs lint, type-check, `prisma migrate deploy`, unit + e2e tests, and a Docker build on every push.

## Stack

| Layer                    | Choice                                                                                                                                                                                                                                                                                                                                                                            | Alternative                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Backend                  | Node.js + NestJS (TypeScript)                                                                                                                                                                                                                                                                                                                                                     | Laravel (PHP)                                                 |
| Database                 | PostgreSQL                                                                                                                                                                                                                                                                                                                                                                        | —                                                             |
| Cache / queues           | Redis — provisioned via Docker, **not yet wired into application logic** (jobs still run on `@Cron`, kept deliberately — see docs/INFRASTRUCTURE.md)                                                                                                                                                                                                                              | —                                                             |
| Web frontend             | Next.js + Tailwind CSS                                                                                                                                                                                                                                                                                                                                                            | —                                                             |
| Mobile (organizer, scan) | Flutter — **not started**                                                                                                                                                                                                                                                                                                                                                         | React Native                                                  |
| Payments                 | PayDunya (cards + Wave/Orange Money/Free Money/Djamo via a single API, PAR flow) — Stripe doesn't support Senegal-registered businesses; CinetPay's registration never got validated (they require a revenue history and live website, neither in place yet). Currently in `test` (sandbox) mode; live switch is a pure env-var change (`PAYDUNYA_MODE`), no code changes needed. | — (`cinetpay` kept as a reserve enum value in the DB, unused) |
| File storage             | Cloudflare R2 (S3-compatible) — event media (images/videos), direct browser→R2 upload via presigned URL, never proxied through the backend. Bucket + real keys configured; CORS and public-read access on the bucket still pending (see docs/INFRASTRUCTURE.md §7)                                                                                                              | —                                                             |
| Geocoding                | Nominatim/OpenStreetMap (dev) — event location search, isolated behind a `GeocodingProvider` interface (`backend/src/geocoding/`) so the interface, endpoint, and frontend don't change on swap. No account/key needed today.                                                                                                                                                    | Google Maps (planned for production, see docs/INFRASTRUCTURE.md §12) |
| Hosting                  | DigitalOcean / Render — **no environment deployed yet** (local dev + CI only)                                                                                                                                                                                                                                                                                                     | AWS (Cape Town region)                                        |
| ORM                      | Prisma — **must keep hand-written SQL triggers in manual migrations**, do not let the ORM regenerate the schema and drop them                                                                                                                                                                                                                                                     | Drizzle                                                       |

## Domain overview

Event ticketing SaaS (festivals, concerts, ceremonies) with QR-code tickets, online sales, and access control. Four products are planned, sharing the same backend: a Super Admin back-office (web), an Organizer app (web + mobile), a dedicated Scan app for door staff (mobile, offline-first), and a Participant purchase interface (web).

User roles, from highest to narrowest scope: Super Admin, Organisateur (event account owner), Co-organisateur, Vendeur (field sales, mobile), Contrôleur/Vigile (QR scanning, mobile, offline-first), Comptable (optional, revenue/exports), Support plateforme (optional, disputes/moderation), and the Acheteur/Participant (buyer).

### Devices per role

| Role                   | Device(s)                                                    | Notes                                         |
| ---------------------- | ------------------------------------------------------------ | --------------------------------------------- |
| Super Admin            | Web only                                                     | Back-office, desk usage                       |
| Organisateur           | Web + Mobile                                                 | Web for setup, mobile for live monitoring     |
| Co-organisateur        | Web + Mobile                                                 | Same app as Organisateur, reduced permissions |
| Vendeur                | Mobile (primary) + Web (stats)                               | Field sales tool                              |
| Contrôleur / Vigile    | Mobile only                                                  | Dedicated scan app, must work offline         |
| Comptable              | Web only                                                     | —                                             |
| Support plateforme     | Web only                                                     | —                                             |
| Acheteur / Participant | Web (purchase, no login required) + Mobile (optional wallet) | Never gate purchase behind an app download    |

## Critical business rules

These are load-bearing invariants from [docs/SPEC.md](docs/SPEC.md#4-règles-métier-critiques) — do not reimplement them differently in application code:

- **Overselling prevention**: stock reservation happens via a PostgreSQL trigger (`fn_reserve_ticket_capacity`), not application code. Inserting a `tickets` row (even at `pending_payment`, i.e. as soon as it's added to cart) atomically increments `quantity_sold` and rejects the insert if quota is reached. Backstopped by `CHECK (quantity_sold <= quantity_total)` at the table level.
- **Cart expiration**: every order has an `expires_at` (~15 min). A scheduled job cancels unpaid orders after this window, releasing quota via the counterpart release trigger (`fn_release_ticket_capacity`).
- **Scan anti-fraud**: scanning a ticket must always be a single conditional `UPDATE`, never a `SELECT` followed by a separate `UPDATE`:
  ```sql
  UPDATE tickets SET status = 'used', used_at = now()
  WHERE id = :ticket_id AND status = 'valid'
  RETURNING id;
  ```
  Zero rows returned means the ticket was already used/invalid and the scan is rejected. This atomicity is what makes it safe for two door staff to scan the same ticket simultaneously. In Prisma, this means `$queryRaw`, never `ticket.update()` preceded by a separate `findUnique`.
- **Presales**: a `TicketType` with `category = 'presale'` has a `sale_start`/`sale_end` window and an `access_mode` of either `presale_whitelist` (via the `ticket_type_whitelist` table) or `public`.
- **Organizer payout timing**: a payout is only triggered after an event has ended — never in real time, never on a fixed weekly schedule. Reason: if the event is cancelled or gets refunds before it's over, no money has been sent to the organizer yet, avoiding after-the-fact reclaims. One `payouts` row per event (`UNIQUE (event_id)`), `amount_due` = sum of `subtotal_amount` across the event's paid orders, sent via PayDunya's Déboursement (PUSH) API to the organization's `payout_phone_number`. See [docs/SPEC.md §6](docs/SPEC.md#6-reversement-aux-organisateurs-payout).

## Development workflow

- **Backend module sequence — complete.** `DB migrations → auth/roles → events → ticket types (incl. anti-oversell) → orders/payments → scan → notifications → stats` was the mandated order; all of it is built and tested (see [PROGRESS.md](PROGRESS.md)). Remaining backend work (promo codes, detailed ticket-holder/nominative tickets, SMS channel, individual order cancellation/refund) is explicitly deferred Phase 2 — do not start it without the user asking, even if it looks quick.
- **Current focus: frontend web, page by page**, per the build order in [docs/DESIGN_SYSTEM.md §5](docs/DESIGN_SYSTEM.md). One Claude Code plan-mode session per page — never batch multiple pages in one session, even if it seems faster; this is deliberate so a disliked design can be corrected without unwinding several pages at once. The Homepage and Super Admin pages are explicitly blocked (see DESIGN_SYSTEM.md "Repoussé") — do not start them without the user first resolving the missing mockup/backend dependencies noted there.
- Start each module or page in plan mode; get the plan approved before writing code.
- For the two business rules above (overselling, scan anti-fraud), always write a concurrency test — e.g. simulate two simultaneous purchases of the last ticket, or two simultaneous scans of the same ticket, and assert only one succeeds. Don't consider either rule "done" without this test passing.
- Follow the roadmap phase order in [docs/SPEC.md](docs/SPEC.md#5-roadmap): build Phase 1 (MVP) features fully before touching Phase 2+ features (mobile money, promo codes, resale marketplace, etc.), even if they seem quick to add.
- Commit after each module or page is implemented and tested, with a descriptive message, before starting the next one — the user tests manually and commits themself; don't commit on their behalf unless asked.
- Update [PROGRESS.md](PROGRESS.md) after finishing a module or page — it's the project's running "what's done / what's left" reference, checked into git specifically so state survives across sessions.

## Working in this repo

- When implementing the schema, keep the two capacity triggers (`fn_reserve_ticket_capacity`, `fn_release_ticket_capacity`) as hand-maintained SQL — if using Prisma, add them as manual migrations rather than letting `prisma migrate` generate/own them.
- The spec is in French; it's fine to write code, comments, and commit messages in English unless the user asks otherwise, but preserve French domain terms (e.g. table/column names already implied by the spec) where they'd otherwise create a mismatch with the schema.
- **Icons**: Iconify only (`@iconify/react/offline` + `@iconify-icons/lucide`), never hand-written SVG or another icon library — this is a hard project-wide rule, not a per-page choice. See [docs/DESIGN_SYSTEM.md §"Icônes"](docs/DESIGN_SYSTEM.md) for the exact import pattern.
- **Frontend visual verification**: per the standing "use the feature in a browser before reporting a UI change complete" rule, the established method in this repo is: start both dev servers (`npm run dev:backend`, `npm run dev:web`) backgrounded from repo root and poll until ready; register a throwaway account via a direct `curl -X POST http://localhost:3000/auth/register` call (avoids needing Google OAuth or a known password) to get a real JWT; drive headless Chromium via Playwright, injecting the JWT into `localStorage` (key `token`) with `page.addInitScript` before navigating; screenshot at 375/768/1280px and check console/pageerror/requestfailed/4xx-5xx response events; actually read the screenshots back, don't just trust "no errors". Afterward, clean up the throwaway user/org via `psql` (dependents before parents — see FK cascade note below) and stop both dev servers.
- **FK cascade gotcha**: several tables (`scans.ticket_id`, `notifications.user_id`/`order_id`, others) have no `ON DELETE CASCADE`. Deleting a parent row (`orders`, `users`) before its dependents — in a test's `afterAll`, in manual `psql` cleanup, anywhere — throws a Postgres FK violation. Inside Jest's `afterAll` this doesn't fail loudly: it just prevents `app.close()`/Prisma disconnect from running, so **Jest hangs indefinitely** instead of erroring. Always delete dependents first.
- **Next.js dev-server gotcha**: `npm run dev:web` and `npm run build --workspace=web` share the same `web/.next` directory. Running a production build while the dev server is still up clobbers its dev artifacts — the browser keeps requesting old chunk URLs that now 404, and the page hangs on "Chargement...". Fix: stop the dev server, `rm -rf web/.next`, restart `npm run dev:web`.
- Never run `npm install` / `npm ci` yourself — the user managesdependency installation manually. If a task requires a new package,add it to the relevant `package.json` and tell the user what to run, but do not execute the install.
- **Nominatim usage policy** (`backend/src/geocoding/`, see docs/SPEC.md and docs/INFRASTRUCTURE.md §12): no live-as-you-type autocomplete — search is explicit-trigger only (button/Enter), one request per search. Every request must originate from the backend (never the browser) with a descriptive `User-Agent` — Nominatim requires it and browsers can't reliably set it. Nominatim's real limit is ~1 req/s **combined across every caller**, not per-user — `NominatimGeocodingProvider` enforces this with an in-memory serialized queue (not just the per-route `@Throttle`, which only caps a single caller's own rate). Any new geocoding-adjacent code should call through the existing `GeocodingProvider` interface, never hit Nominatim directly.
