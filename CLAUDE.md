# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository currently contains only planning artifacts — no application code has been written yet:

- [docs/SPEC.md](docs/SPEC.md) — full French-language product/technical spec. Read this before implementing any module; it is the authoritative reference for roles, data model intent, and business rules.
- [db/schema.sql](db/schema.sql) — the PostgreSQL schema (tables, enums, constraints, triggers). This is the source of truth for anything Prisma can't express.
- [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — Prisma model definitions mirroring `db/schema.sql`. Lives under `backend/` (not the repo root) since the backend is the only consumer of the generated `PrismaClient`. **Deliberately omits** the `CHECK` constraints and the two capacity triggers (see "Critical business rules" below) — those are annotated in-file with a comment pointing back to `db/schema.sql` and must be added as hand-written SQL in a Prisma migration (`prisma migrate dev --create-only`), never regenerated from `schema.prisma` alone.

There is no build system, package manager, or test suite yet. When code is added, this file should be updated with the actual commands (install, build, lint, test, run single test) and any architecture that emerges across the backend, web, and mobile apps.

## Stack (per spec, not yet implemented)

| Layer                    | Choice                                                                                                                        | Alternative            |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Backend                  | Node.js + NestJS (TypeScript)                                                                                                 | Laravel (PHP)          |
| Database                 | PostgreSQL                                                                                                                    | —                      |
| Cache / queues           | Redis                                                                                                                         | —                      |
| Web frontend             | Next.js + Tailwind CSS                                                                                                        | —                      |
| Mobile (organizer, scan) | Flutter                                                                                                                       | React Native           |
| Payments                 | CinetPay or PayDunya (+ Stripe for international cards)                                                                       | IntouchPay             |
| File storage             | S3 / Cloudflare R2                                                                                                            | —                      |
| Hosting                  | DigitalOcean / Render                                                                                                         | AWS (Cape Town region) |
| ORM                      | Prisma — **must keep hand-written SQL triggers in manual migrations**, do not let the ORM regenerate the schema and drop them | Drizzle                |

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

## Development workflow

- Build one module at a time, in this order: DB migrations → auth/roles → events → ticket types (incl. anti-oversell logic) → orders/payments → scan → notifications. Don't jump ahead to a later module before the current one has passing tests.
- Start each module in plan mode; get the plan approved before writing code.
- For the two business rules above (overselling, scan anti-fraud), always write a concurrency test — e.g. simulate two simultaneous purchases of the last ticket, or two simultaneous scans of the same ticket, and assert only one succeeds. Don't consider either rule "done" without this test passing.
- Follow the roadmap phase order in [docs/SPEC.md](docs/SPEC.md#5-roadmap): build Phase 1 (MVP) features fully before touching Phase 2+ features (mobile money, promo codes, resale marketplace, etc.), even if they seem quick to add.
- Commit after each module is implemented and tested, with a descriptive message, before starting the next one.

## Working in this repo

- When implementing the schema, keep the two capacity triggers (`fn_reserve_ticket_capacity`, `fn_release_ticket_capacity`) as hand-maintained SQL — if using Prisma, add them as manual migrations rather than letting `prisma migrate` generate/own them.
- The spec is in French; it's fine to write code, comments, and commit messages in English unless the user asks otherwise, but preserve French domain terms (e.g. table/column names already implied by the spec) where they'd otherwise create a mismatch with the schema.
