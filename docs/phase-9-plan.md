# Phase 9 Plan — Inventory and Stock Reservation

Status: **Approved by you on 2026-10-22 (D-090), with Q9-1 to Q9-5 as recommended. Migration review stop before commit; a draft PR for CI is authorised (step 5).** · Date: 2026-10-22 · Base: `phase-9-inventory` from `phase-8-catalogue` at `b6e9223` (Phase 8 gate passed, D-089; draft PR #6 open and unmerged)

This plan covers Phase 9 of `MASTER-IMPLEMENTATION-INDEX.md`. The database part, the API and the admin screens each wait for the approvals listed in §10.

## 1. Scope (from the index)

**In scope:**
- stock levels;
- adjustments;
- movements;
- the low-stock view;
- the atomic reservation service and its expiry job;
- the admin inventory screens.

**Verification:** the overselling and movement tests in `testing-strategy.md` §3 pass.

**Gate:** your review of the concurrency test output.

**Out of scope:**
- checkout and orders (Phase 15);
- converting a reservation to an order allocation (SR-6);
- dispatch (SR-7) and cancellation (SR-8): these need orders and are built with them in Phases 15 and 16;
- a payment arriving after expiry (SR-10, Phase 15 and 18);
- returns and restocking (SR-13);
- any storefront change.

The service functions here are what those phases will call.

## 2. What already exists (Phases 6 and 8)

| Item | State |
|------|-------|
| `inventory_level` | One row per variant (created with the variant, Q8-7). CHECKs: `on_hand >= 0`; `0 <= reserved <= on_hand`; `low_stock_threshold >= 0`; `version >= 0` (D-105) |
| `stock_movement` | Append-only by trigger (D-057). CHECKs: a reason is required for `ADJUSTMENT` and `CORRECTION`; at least one delta is non-zero; a reference type and ID come together or not at all |
| `stock_reservation` | CHECKs: `quantity > 0`; an `ACTIVE` reservation has an `expires_at` later than `created_at`. Index (status, expires_at). No `order_id` until Phase 15 (D-054) |
| Public availability | `availabilityOf()` in `@sanea/shared` reads on hand minus reserved (D-082, Q8-2) |
| Permissions | `inventory.adjust` for O M F; `products.view` for everyone (`@sanea/shared` `PERMISSIONS`) |
| Error code | `OUT_OF_STOCK` (409), with per-variant `{ variantId, requested, available }` details (`api-specification.md` §2) |
| Development seed | Writes a `RECEIVED` movement for its stock, so the ledger matches the levels |

## 3. Design

### 3.1 Module `apps/api/src/modules/inventory/`

| File | Contents |
|------|----------|
| `service.ts` | `reserve`, `release`, `expireDue`, `adjust`, `setThreshold`, `availability`. Each runs in one transaction, and every stock change writes exactly one movement per variant (SR-11) |
| `job.ts` | The expiry job: started by `main.ts`, every 60 s (SR-9); stopped on shutdown; never started in tests |
| `router.ts` | The admin routes (§3.4) |
| `schemas.ts` | Request validation (strict, bounded) |

### 3.2 Reservation (SR-3, SR-4, SR-9, SR-14)

`reserve(lines, { ttlMs })` takes the lines of one cart or order. In one transaction it:
1. **Merges** repeated variants and **sorts** the lines by variant ID. Every transaction locks inventory rows in that order, so concurrent multi-line reservations cannot deadlock.
2. **Lazily releases** expired reservations for those variants first (SR-9), so a stale hold never refuses a shopper.
3. **Treats a line as unavailable** if the variant is inactive, or its product is not `PUBLISHED`. Such a line counts as available 0 (SR-14; Q9-3).
4. **Applies the conditional update** for each line (`system-design.md` §2.2):
   ```sql
   UPDATE inventory_level
   SET reserved = reserved + $qty, version = version + 1
   WHERE variant_id = $variant AND on_hand - reserved >= $qty
   ```
5. **If any line updates 0 rows,** reads the real availability of every line, throws `OUT_OF_STOCK` with `[{ variantId, requested, available }]`, and rolls everything back.
6. **Otherwise,** inserts one `stock_reservation` (`ACTIVE`, `expires_at` = now + TTL) and one `RESERVED` movement (`reserved_delta` +qty, reference `RESERVATION`) per line.
7. **Returns** the reservation IDs and the expiry time.

The database CHECK `reserved <= on_hand` stays the final guard, even if this code had a bug (D-105).

`release(ids)`:
- `ACTIVE` → `RELEASED`, with `reserved` reduced and one `RELEASED` movement per reservation;
- repeating the call changes nothing, so it is idempotent.

### 3.3 Expiry job (SR-9)

`expireDue(now, batch = 200)` claims due reservations safely, even with several API processes:
```sql
SELECT id, variant_id, quantity FROM stock_reservation
WHERE status = 'ACTIVE' AND expires_at <= now()
ORDER BY variant_id, id
LIMIT 200
FOR UPDATE SKIP LOCKED
```
It then locks the inventory rows in variant order, sets each reservation to `EXPIRED`, reduces `reserved`, and writes one `RELEASED` movement each.

It repeats while full batches come back. Errors are logged with no stock data beyond counts, and the next tick retries.

**Configuration:**
- `RESERVATION_TTL_MINUTES`: integer 5 to 60, default 15 (SR-3: "configurable").
- The job interval is fixed at 60 s (SR-9).

### 3.4 Admin API (`/api/v1/admin/inventory`, no-store)

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/admin/inventory` | `products.view` (all) | Filters: `lowStock=true`, `sku` (prefix), `productId`, cursor and `limit`. Each row: variant ID; SKU; product ID, name and status; colour; size; active; on hand; reserved; available; threshold; low stock (available ≤ threshold) |
| POST | `/admin/inventory/:variantId/adjustments` | `inventory.adjust` (O M F) | `{ type: RECEIVED \| ADJUSTMENT \| CORRECTION, delta, reason? }` (Q9-2):<br>• `RECEIVED` needs a positive `delta`; its reason is optional.<br>• `ADJUSTMENT` and `CORRECTION` need a reason of 3 to 200 characters.<br>• `delta` is a non-zero integer from −10 000 to 10 000.<br>A conditional update keeps `on_hand + delta >= reserved`; otherwise `409 CONFLICT` with `{ code: STOCK_BELOW_RESERVED, onHand, reserved }` (SR-12).<br>Writes one movement (actor, reference `ADMIN`) and one audit row |
| PATCH | `/admin/inventory/:variantId` | `inventory.adjust` | `{ lowStockThreshold: 0..1000 }`. Audit row; no movement (not a stock change). **New route** (Q9-4) |
| GET | `/admin/inventory/movements` | `inventory.adjust` (O M F) | Filters: `variantId`, `type`, `from`, `to`, cursor. Newest first. Each row includes the actor's name, never their email |

### 3.5 Migration (Q9-1)

`2026102xxxxxxx_inventory_low_stock` adds only what `database-design.md` §5 lists for Phase 9:
- **An expression index** on `inventory_level ((on_hand - reserved - low_stock_threshold))`.
- **A view, `low_stock_variant`:**
  - for active variants with `on_hand - reserved - low_stock_threshold <= 0`, sold-out included;
  - columns: `variant_id`, `on_hand`, `reserved`, `available`, `low_stock_threshold`.
  - It is read through `$queryRaw`, since Prisma does not model it.
  - The view and the index are added to the handwritten-object lists in `apps/api/src/db/handwritten.ts`, so the schema tests check they exist, as they do for the search triggers.

No table or column changes. It is validated like `20261021180245_catalogue_search` (§10d of the Phase 8 plan):
- applied to disposable databases only;
- a drift check;
- a down-check (drop view and index).

### 3.6 Admin screens (CSS Modules, shared tokens, the existing shell)

- **Inventory** (navigation for all roles):
  - a table: SKU, product, colour, size, on hand, reserved, available, threshold, status chip with text;
  - filters: low stock only, SKU, product;
  - for O M F, per row:
    - an **Adjust stock** form: type, quantity, reason, with a confirmation showing the new on-hand figure;
    - a **Low-stock level** edit.
  - Catalogue editors see the table read-only, with a note.
- **Stock movements** (O M F): newest first, with filters and paging; each row shows type, deltas, reason, actor and time.
- **Product editor:** the variants table's "In stock" column links to Inventory, filtered to the product.
- **States:** loading, empty, error and forbidden, as in Phase 8.
- **Checks:** axe and screenshots at 1440, 768 and 390 px.

### 3.7 Specification amendments (with the API work)

- **`api-specification.md` §4:** the request and response shapes above, the new `PATCH` route, `STOCK_BELOW_RESERVED`, and the adjustment types.
- **`system-design.md` §2:** the expiry job's `SKIP LOCKED` claim, the lazy release in the reservation path, SR-14 as applied (§3.2), and `RESERVATION_TTL_MINUTES`.
- **`database-design.md` §3.2:** the view name and index.
- **`.env.example`:** `RESERVATION_TTL_MINUTES`.

## 4. Tests

**The gate's concurrency tests** (`inventory.db-test.ts`, real PostgreSQL 18.6). Parallel requests use separate connections: a pool of at least 20, or one client per worker. Each test writes a `[P9-CONC]` summary line to the output for your review.

| # | Case (`testing-strategy.md` §3) | Pass condition |
|---|------|----------------|
| C1 | Two concurrent reservations for the last unit | Exactly one succeeds; the other gets `OUT_OF_STOCK` with available 0 |
| C2 | Fifty concurrent reservations of 1 for 10 units | Exactly 10 succeed; `reserved` = 10; available never negative |
| C3 | Fifty concurrent reservations of random quantities 1 to 3 for 20 units | The successful quantities sum to at most 20, and to exactly `reserved` |
| C4 | A multi-line cart where one line is short | Whole rollback: no reservation rows, no movements, levels unchanged; details list every line's real availability |
| C5 | Opposite-order two-line carts, 40 concurrent | No deadlock (`40P01`) or serialisation errors; every call succeeds or gets `OUT_OF_STOCK` |
| C6 | Expiry: due reservations, two job runs at once plus a reservation in flight | Each is expired exactly once (one `RELEASED` movement); `reserved` correct |
| C7 | Lazy release | An expired hold does not block a new reservation before the job runs |
| C8 | Concurrent adjustments and reservations | `on_hand` never goes below `reserved`; refused adjustments return `409 STOCK_BELOW_RESERVED` |
| C9 | Direct SQL | Negative `on_hand`, `reserved > on_hand`, and movement UPDATE, DELETE or TRUNCATE are all rejected by the database |
| C10 | Ledger reconciliation after every test | For every variant, the sum of `on_hand_delta` = `on_hand` and the sum of `reserved_delta` = `reserved`; one movement per stock change |
| C11 | SR-14 | An inactive variant or unpublished product gives `OUT_OF_STOCK` with available 0 |
| C12 | Release twice | One `RELEASED` movement |

**Also:**
- **API tests:** the role matrix on the real routes (C views; O M F adjust; unauthenticated 401; CSRF), validation, audit rows, the low-stock filter, movement paging, and the TTL configuration (5 to 60).
- **Unit tests:** line merging and sorting, adjustment rules, configuration.
- **Admin:**
  - component tests: the adjust form, the role rules, errors;
  - end to end (Edge):
    - fulfilment receives stock and makes an adjustment;
    - a refusal below `reserved`;
    - the low-stock filter;
    - the catalogue editor sees the table read-only;
    - the public product detail changes from SOLD_OUT to IN_STOCK;
  - axe; screenshots.
- **Coverage:** the `inventory` module at 90% or more of lines (`testing-strategy.md` §6).

## 5. Dependencies

None.

## 6. Questions for you (approved 2026-10-22 as recommended, D-090)

| # | Question | Recommendation |
|---|----------|----------------|
| Q9-1 | Approve the migration in §3.5 (an expression index and the `low_stock_variant` view; no table changes) | Yes |
| Q9-2 | Adjustment types: `RECEIVED` (positive, reason optional), `ADJUSTMENT` and `CORRECTION` (reason required). All for O M F, per the existing matrix | Yes |
| Q9-3 | Reservable means the variant is active **and** its product is `PUBLISHED` (SR-14: "archived or inactive variants"). Other lines count as available 0 | Yes. Category status is not checked: it already gates publishing (D-083) |
| Q9-4 | Add `PATCH /admin/inventory/:variantId` to set the low-stock level (O M F, audited); the specification has no way to change it | Yes |
| Q9-5 | `RESERVATION_TTL_MINUTES` from 5 to 60, default 15. The job runs in each API process every 60 s, safe with several processes through `SKIP LOCKED`. Lazy release happens in the reservation path only; public availability can lag by at most one job interval, plus the 60 s catalogue cache (Q8-5) | Yes |

## 7. Acceptance criteria

| ID | Criterion |
|----|-----------|
| P9-AC1 | C1 to C12 pass on PostgreSQL 18.6, locally and in CI; the `[P9-CONC]` output is recorded for your review |
| P9-AC2 | Every stock change writes exactly one movement; the ledger reconciles with the levels |
| P9-AC3 | Adjustments never push `on_hand` below `reserved`; the database constraints hold under direct SQL |
| P9-AC4 | The admin routes enforce the matrix (view: all; adjust, threshold and movements: O M F); adjustments and threshold changes are audited |
| P9-AC5 | The expiry job releases due reservations exactly once with several runners, and stops cleanly on shutdown |
| P9-AC6 | The admin inventory and movements screens work for every role, with the Phase 8 UI standards (axe clean at 3 widths, no horizontal scroll at 390 px, keyboard-operable forms, screenshots) |
| P9-AC7 | No new dependency; format, lint (with the token check), typecheck, unit, integration, end-to-end and audit all pass; CI green on a draft PR |
| P9-AC8 | The specifications match the implementation |

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Deadlocks between multi-line reservations and the expiry job | One lock order (variant ID) everywhere; C5 and C6 test it |
| Pool exhaustion under a burst | A reservation transaction is short (no network calls inside it); a test runs 50 concurrent calls; the pool size is documented for Phase 19 |
| Clock differences between the API and the database | Expiry uses the database's `now()`, not the API clock |
| Stale public availability after expiry | At most one job interval plus the 60 s cache (Q9-5); reservations themselves never see stale data |

## 9. Sequence and stop points

| Step | Work | Needs your approval |
|------|------|---------------------|
| 1 | Approve this plan and Q9-1 to Q9-5 | **Done** 2026-10-22 (D-090) |
| 2 | Write and validate the migration on disposable databases | **Done** (§10.1); **approved by you 2026-10-23** (D-091) |
| 3 | Service, job, routes and the concurrency tests | **Done** (§10.2, §10.3), uncommitted |
| 4 | Admin screens, component and end-to-end tests, screenshots | **Done** (§10.4), uncommitted |
| 5 | Commit and normal push of reviewed work; CI on a draft PR | Push: standing authorisation. **Draft PR authorised** 2026-10-22 (never merged) |
| 6 | **Phase 9 gate:** your review of the concurrency test output | **Yes** |

## 10. Progress and evidence (2026-10-23)

**Built and tested. Migration approved on 2026-10-23 (D-091) and committed with the rest of the work.**

### 10.1 Migration `20261022233000_inventory_low_stock` (for your review)

**Contents:**
- the expression index `inventory_level_low_stock_idx` on `(on_hand - reserved - low_stock_threshold)`;
- the view `low_stock_variant`: active variants at or below their level, sold out included;
- no table or column changes.

Both objects are in `apps/api/src/db/handwritten.ts`, with checks against the migration SQL and the live catalogue.

**Validation** on a disposable PostgreSQL 18.6 container (loopback, random password never printed), with synthetic rows only:

| Check | Result |
|-------|--------|
| `prisma migrate deploy` on a fresh database (4 migrations) | Applied; `migrate status` up to date |
| Drift: `migrate diff --from-config-datasource --to-schema --exit-code` | Exit 0: Prisma ignores the view and the expression index and does not try to drop them |
| View rows, with 4 variants: plenty; at its level; sold out; inactive and low | Exactly two: at its level (available 2 of 2) and sold out (0). Not the plentiful or inactive variants |
| Planner (`enable_seqscan = off`) | `Bitmap Index Scan on inventory_level_low_stock_idx` |
| Down (`DROP VIEW`, `DROP INDEX`), then drift | Succeeds; exit 0; no views left |
| Up again (the migration SQL re-run) | 1 view and 1 index; drift exit 0 |
| Integration setup (template migrate and drift check) and the catalogue tests | Pass |

### 10.2 What was built

- **`apps/api/src/modules/inventory/`:**
  - `service.ts`: `reserve`, `release`, `expireDue`, `adjust`, `setThreshold`, `availabilityOf`;
  - `job.ts`: the 60 s expiry job;
  - `reads.ts`: the stock list (low stock through the view) and the movement history;
  - `schemas.ts` and `router.ts`: the four admin routes.
- **API wiring:**
  - `main.ts` starts the job and stops it on shutdown, before the database disconnects;
  - `app.ts` mounts the routes;
  - `config.ts` adds `RESERVATION_TTL_MINUTES` (5 to 60, default 15);
  - the error registry adds `OUT_OF_STOCK` (409), already documented in `api-specification.md` §2.
- **Admin:**
  - **Inventory:** stock by variant, with key figures first on phones, a low-stock filter, a SKU search, and a link from the product editor. For O M F, a stock-change form with a live preview and a floor at reserved, plus a low-stock level form;
  - **Stock movements** (O M F): the ledger, with filters and paging;
  - navigation entries (Inventory for everyone; Stock movements for O M F).
- **Specification amendments** (§3.7):
  - `api-specification.md` §4: shapes, the `PATCH` route, `STOCK_BELOW_RESERVED`;
  - `system-design.md` §2.3;
  - `database-design.md` §5;
  - `.env.example`.

### 10.3 Concurrency test output (the Phase 9 gate)

From the full integration run on a disposable PostgreSQL 18.6. Parallel calls use their own client with a pool of 40.

```
C1 last unit, 2 concurrent: 1 reserved, 1 OUT_OF_STOCK; on_hand 1, reserved 1
C2 50 concurrent x1 for 10 units: 10 reserved, 40 OUT_OF_STOCK, other errors 0; on_hand 10, reserved 10, available 0
C3 50 concurrent x(1..3) for 20 units: 20 units reserved in 11 reservations; available 0
C4 three-line cart, one line short: rolled back; no reservations or movements; each line's availability reported
C5 40 concurrent two-line carts in opposite orders: 30 reserved, 10 OUT_OF_STOCK, 0 deadlocks or other errors
C6 30 due holds, 2 concurrent expiry runs (7 + 7) and a reservation in flight (lazy 16): 30 expired once, 30 RELEASED movements; reserved 5
C7 expired hold released lazily by the next reservation; the job was not needed
C8 20 reservations and 10 adjustments of -3 at once: 11 reserved, 3 adjustments applied, 7 refused (STOCK_BELOW_RESERVED); on_hand 11, reserved 11
C9 direct SQL: 8 invalid writes all rejected by CHECKs or the append-only trigger
C11 inactive variant, draft and archived products: OUT_OF_STOCK with available 0; nothing reserved
C12 the same reservation released twice concurrently: one release, one RELEASED movement
```

- **C10 (ledger reconciliation)** runs after every test in the file: for every variant, the sum of `on_hand_delta` equals `on_hand` and the sum of `reserved_delta` equals `reserved`. No drift in any test.
- **Varying counts:** the counts in C3, C6 and C8 depend on scheduling and change between runs. The asserted invariants always hold: never oversold, each expired once, never below reserved.

### 10.4 Results

| Command | Result |
|---------|--------|
| `npm run format:check`, `npm run lint` (with `check:tokens`), `npm run typecheck` | Clean |
| `npm test` | 35 files, **666 passed** (646 before, plus 20) |
| `npm run test:integration` (disposable PostgreSQL 18.6) | 16 files, **364 passed** (341 before, plus 23: 22 inventory and 1 view check) |
| `npx playwright test` (installed Edge) | **10 passed**, including the new inventory journey:<br>• receive and adjust stock;<br>• a refusal below 0;<br>• the low-stock level and filter;<br>• the public product going from `SOLD_OUT` to `LOW_STOCK` (3 remaining);<br>• the ledger with the actor;<br>• the catalogue editor view-only, with a 403 from the API.<br>Axe was clean at three widths |
| `npm run build -w @sanea/admin` | Built (140 KB JavaScript, 3.7 KB CSS, gzipped) |
| `npm run audit` | 0 vulnerabilities |

**Screenshots** in `docs/reviews/admin/2026-10-23/`: every admin screen, including `inventory-*.png` and `stock-movements-*.png`, at 1440, 768 and 390 px. The e2e run now writes to a folder named after the run date, so earlier gate evidence is never overwritten. An earlier run of this phase had regenerated 14 files in the Phase 8 folder; they are left unstaged, and the committed Phase 8 evidence is unchanged.

**Fixes from reviewing the screens:**
- the stock-change form stayed open after a save;
- the error read "below the 0 units reserved";
- "1 units";
- the key figures were off-screen on phones.

### 10.5 Not done, or open

- **Coverage:** `testing-strategy.md` §6 asks for 90% line coverage of `inventory`. You approved `@vitest/coverage-v8` on 2026-10-23, but it was **not installed**: it must match Vitest exactly (5.0.5), and 5.0.5 was released on 2026-10-15, under the two-week rule. Older releases require older Vitest. It can be installed from 2026-10-29, or sooner with an exception from you. Until then coverage is not measured.
- **Order-dependent behaviour:** SR-6 to SR-8 and SR-10 depend on orders (Phases 15 and 16). `release` is ready for them.
- **Phase 9 gate:** needs the migration review, a commit, CI on a draft PR (authorised), and your review of §10.3.
