# Phase 6 Plan — Core Database Schema

Status: **Approved (D-051 to D-059); compatibility test passed (D-060); repository setup done on branch `phase-6-core-schema` from `14f2b35`.** Not committed. **Schema and migration written and validated on a disposable database (2026-10-19); not applied anywhere else.** Development seed and its tests done. Committed on `phase-6-core-schema` for draft PR #4. · Date: 2026-10-19

## Scope
Prisma schema and first migration for the Phase 6 tables in `database-design.md` §6 (catalogue, inventory, admin users, admin sessions, audit, content), local PostgreSQL through Docker Compose, a development seed with obviously fake data, and integration tests. No customer, cart, order, payment, enquiry, GST-rule or search tables, and no API routes.

## Decisions
D-051 PostgreSQL 18 · D-052 Prisma 7.10.1 pinned, no `dotenv` · D-053 generated client location, CI generation, lint ban · D-054 exclusions by phase · D-055 admin-only sessions · D-056 snake_case · D-057 append-only triggers · D-058 size reference data · D-059 integration tests. Full text: `DECISION-LOG.md`.

## Compatibility test (2026-10-19, D-060)
Throwaway folder in the session scratchpad, outside the repository; PostgreSQL 18.6 in a disposable container on `127.0.0.1` with a random password. Versions: Node 24.11.0, npm 11.1.0, prisma, @prisma/client and @prisma/adapter-pg 7.10.1 (`pg` 8.23.1), TypeScript 6.0.3; sandbox `npm audit` 0 vulnerabilities.

| # | Check | Result |
|---|-------|--------|
| 1 | Generated client (`prisma-client` generator, ESM, `.ts` files and imports) with the repository's strict compiler settings; run directly by Node 24 | **Pass**: no enums, namespaces or other non-erasable syntax; `tsc` exit 0; two deliberate type errors caught; runs without a build step |
| 2 | Drift with handwritten `citext`, CHECK constraints and an append-only trigger | **Pass, with a limitation**: schema vs database and migrations vs database both "No difference detected"; `migrate dev --create-only` produced an empty migration; a later column change generated only `ADD COLUMN`; a column dropped outside Prisma was detected (exit 2). **Limitation:** a dropped CHECK constraint or trigger is not detected, so integration tests must assert them |
| 3 | `uuidv7()` column defaults through Prisma | **Pass**: `create`, nested `create`, `createManyAndReturn` and interactive transactions return v7 IDs in creation order; foreign keys link to generated IDs; case-insensitive unique email gives P2002; session cascade works |
| 4 | Driver adapter in a single start-up lifecycle | **Pass**: start-up `$connect` plus `SELECT 1` fails in about 0.5 s with a wrong password or no database (exit 1, password not in the error); 50 concurrent queries on one client; on Linux, SIGTERM and SIGINT closed the server, then the database, exit 0 in 10 and 12 ms with a keep-alive connection open |

Findings that shape the implementation:
- Trigger errors must use the default SQLSTATE `P0001`. With `23001` Prisma reports a misleading foreign-key error (P2003).
- A query after `$disconnect()` silently reopens the pool (the process then stayed alive about 10.9 s), so shutdown closes the HTTP server first and the database last.
- `$connect()` alone does not prove the credentials; start-up also runs `SELECT 1`.
- `prisma migrate diff --from-migrations` needs a shadow database URL; `migrate dev` creates its own shadow database.

Clean-up: container and sandbox folder removed; one dangling Docker volume pruned (almost certainly the test container's data volume; its name was not checked first). Images `postgres:18.6-alpine` and `node:24.11.0-bookworm-slim` kept for later use.

## Repository setup (done, not committed)
- **Packages:** `prisma` 7.10.1 (root, dev); `@prisma/client` 7.10.1 and `@prisma/adapter-pg` 7.10.1 (`@sanea/api`). `npm audit` 0 vulnerabilities.
- **`prisma/schema.prisma`:** generator and datasource only, no models yet. Output `apps/api/src/generated/prisma`.
- **`prisma.config.ts`:** loads `.env` with `process.loadEnvFile` when the file exists. The datasource is optional, so `prisma generate` works in CI without a database; database commands fail with Prisma's own error until `DATABASE_URL` is set.
- **`compose.yaml`:**
  - `postgres:18.6-alpine`, user `sanea`, database `sanea_dev`;
  - the password is required from `.env` (no default; Compose refuses to start without it);
  - published only on `127.0.0.1`, port 5433 by default (`POSTGRES_PORT`). 5433 because a native PostgreSQL 18 service already holds 5432 on this machine (`BLOCKERS.md` E-02);
  - health check;
  - volume at `/var/lib/postgresql`, the PostgreSQL 18 layout.
- **Ignore rules:** generated client ignored by Git, Prettier and ESLint.
- **Lint:** the existing Prisma import ban now also covers `packages/`.
- **Scripts and CI:** root scripts `db:generate` and `db:validate`. CI runs `npm run db:generate` after `npm ci`.
- **`.env.example`:** `POSTGRES_PASSWORD`, `POSTGRES_PORT`, `DATABASE_URL` (names only).

## Milestone 1: schema and migration SQL (done, not applied)
- `prisma/schema.prisma`: 20 models, 9 enums, Phase 6 tables only.
- `prisma/migrations/20261018193745_core_schema/migration.sql` (615 lines):
  1. `citext`;
  2. 498 lines generated by `prisma migrate diff --from-empty`, byte-identical to a fresh run;
  3. 26 CHECK constraints;
  4. append-only triggers on `stock_movement` and `audit_log` (UPDATE, DELETE, TRUNCATE);
  5. the six approved sizes.
- `apps/api/src/db/handwritten.ts` lists every handwritten object. `schema.test.ts` (no database) checks:
  - each listed object is in the SQL, and no unlisted CHECK exists;
  - the size rows;
  - the Phase 6 table list;
  - no GST, order or search columns;
  - snake_case names, `uuidv7()` keys, `timestamptz`, integer paise;
  - session cascade and hash storage;
  - `citext` email;
  - role parity with `@sanea/shared`.
- Mutation check: deleting one CHECK and one trigger from the SQL failed 4 tests; the file was restored byte-identical.
- Not yet verified: that the SQL runs, and the behaviour of each rule. Both need a database, so they wait for your migration approval.
- Finding: `prisma migrate diff --from-empty` prints nothing and exits 0 when no datasource URL is configured. It was run with a placeholder URL to `127.0.0.1:1` (nothing listening, no database reachable).
- Finding: the generated client files start with `// @ts-nocheck`, so `tsc` does not check their internals. Their exported types still reach our code (compatibility check 1).

## Milestone 2: validation on a disposable database (2026-10-19)
Approved by you for validation only. Target:
- Compose project `sanea-p6-validation` running `postgres:18.6-alpine`, published only on `127.0.0.1:55433`;
- database `sanea_test`, random password never printed;
- the host's PostgreSQL service on 5432 was not touched;
- removed afterwards with its volume and network.

Correction before applying: `stock_reservation_expiry_check` now also requires `expires_at > created_at` while `ACTIVE`.

| Check | Result |
|-------|--------|
| `prisma validate`, `prisma generate` | Pass |
| `prisma migrate deploy` on an empty database | 1 migration applied |
| `prisma migrate status` | Up to date |
| Drift: schema vs database | No difference (exit 0) |
| Drift: migrations folder replayed in a shadow database vs database | No difference (exit 0) |
| Live catalogue | 20 tables, 26 CHECKs (all validated), 22 foreign keys with the approved delete rules, every index, 4 enabled triggers, `citext`, the trigger function, 17 `uuidv7()` defaults, six sizes |
| Limitation re-confirmed | After dropping one trigger, Prisma still reported no difference; the catalogue query found 3 of 4 |
| `npm run test:integration` | 6 files, 125 tests passed; the template is migrated and drift-checked first; each file uses its own cloned database |
| Guards | Refuses to run without `TEST_DATABASE_URL`, with a database not named `sanea_test…`, or with a non-loopback host |

Findings:
- `ON DELETE RESTRICT` reports SQLSTATE `23001`, not `23503`.
- PostgreSQL rounds a fractional number written to an integer column (12.5 becomes 13) instead of rejecting it, so the API must reject non-integer paise (already in `@sanea/shared`).

## Milestone 3: development seed (2026-10-19)
- **`apps/api/src/db/seed.ts`** (`npm run db:seed`, wired as Prisma's seed command):
  - 2 categories, 2 colours and 3 products, all named "Sample …";
  - 22 variants with `TEST-` SKUs, using only the approved sizes;
  - stock levels including sold-out variants, plus one RECEIVED movement per stocked variant;
  - no admin, media or content rows.
- **Refusals:** `NODE_ENV=production`, a missing or malformed `DATABASE_URL`, or a non-loopback host. It is idempotent: a second run changes nothing, because movements are append-only.
- **Tests:** `seed.test.ts` (7 tests, no database) and `seed.db-test.ts` (6 tests).
- **Disposable database:** integration suite 7 files, 131 tests passed. Real `npm run db:seed`: the first run created 3 products and 22 variants, the second changed nothing; the production and remote-host runs exited 1. The database was removed afterwards.

## Next milestones
1. CI on draft PR #4, then your review of the Phase 6 gate.
2. After approval, apply it to the local Compose database. Add the development seed (refuses production; "Sample …" names, `TEST-` SKUs).
3. Integration tests: one cloned database per file; constraints, triggers and publishing rules through direct SQL; the existence of every handwritten object; seed contents; role parity with `@sanea/shared`. Add `test:integration` and the CI job with a PostgreSQL 18 service.
4. Gate report. Commit, push and draft PR #4 need separate approval.

## Acceptance criteria
P6-AC1 to P6-AC11 as approved with the plan. Results: `PROJECT-STATUS.md`.
