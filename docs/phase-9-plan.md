# Phase 9 Plan — Inventory and Stock Reservation

Status: **Evidence ready, awaiting your approval (D-079).** Date: 2026-10-24, branch `claude/amazing-faraday-21s6uc`.

## Scope (index Phase 9)
Stock levels, adjustments, movements, the low-stock view, the atomic reservation service and its expiry job. No checkout (Phase 15). No migration: the Phase 6 tables, CHECKs and append-only triggers are used as they are.

## Implementation
| Area | Files |
|------|-------|
| Service | `apps/api/src/modules/inventory/service.ts`: `reserve` (all lines or none, variant-ID lock order, conditional `UPDATE … WHERE on_hand − reserved ≥ qty AND variant active`, real availability on failure), `release`, `releaseExpired` (row locks, so concurrent sweeps count each hold once; also called lazily before each reservation), `adjust` (`RECEIVED`, `ADJUSTMENT`, `CORRECTION`; refuses `onHand` below `reserved` or zero) |
| Job | `jobs.ts`: in-process sweep every 60 s, started only by `main.ts` (single instance, like D-047) |
| API | `router.ts`: `GET /admin/inventory` (all roles; `lowStock`, `sku`, `product`), `POST /admin/inventory/:variantId/adjustments` (O M F, reason required, audited), `PATCH /admin/inventory/:variantId` (low-stock level, O M F, audited, additive), `GET /admin/inventory/movements` (O M F) |
| Admin UI | `apps/admin/src/pages/Inventory.tsx`: levels with free units and low-stock filter, adjust panel with reason, low-stock level, recent movements |

Every stock change writes exactly one `stock_movement` row in the same transaction (SR-11). Reservation movements reference the reservation (`RESERVATION`, id); the link to orders comes with Phase 15 (D-054).

## Verification
| Check | Result |
|-------|--------|
| `inventory.db-test.ts` (PostgreSQL 18.4, disposable) | 18 passed, three consecutive runs |
| Two concurrent checkouts for the last unit | Exactly one succeeds; the other gets `OutOfStock` with `available: 0` |
| Fifty concurrent checkouts for ten units | Exactly 10 succeed; `onHand − reserved` = 0, never negative; 10 reservations and 10 movements |
| Twenty concurrent two-line carts in opposite line orders, 5 + 5 units | 5 succeed; no deadlock |
| Multi-line cart with one short line | Whole hold rolled back; no movement written; the short line reported with its real availability |
| Expiry | Lazy release on the next reservation; three concurrent sweeps release four holds exactly once |
| Adjustments | Cannot go below reserved (409 `BELOW_RESERVED` through the API) or below zero; 20 concurrent receipts serialised to 20 |
| Movements equal the level | Sum of movement deltas equals `on_hand` and `reserved` |
| Database last guard | Direct SQL `reserved > on_hand` rejected by `inventory_level_reserved_check` |
| Roles | Catalogue editor cannot adjust (403) or read movements; all roles read levels; unauthenticated 401 |
| End-to-end | Fulfilment receives 2 units through the screen; the public product detail changes from `SOLD_OUT` to `LOW_STOCK` with `remaining: 2` (screenshot `docs/reviews/admin/2026-10-24/inventory-1440.png`) |

## Gate
Concurrency evidence above, for your review. No new decisions beyond the additive threshold route (recorded here) and the single-instance job (same constraint as D-047, to be decided before Phase 19).
