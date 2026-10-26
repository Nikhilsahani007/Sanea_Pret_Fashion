# Phase 15 Plan — Checkout, Orders, COD and Mock Payments

Status: **Approved to start, 2026-10-26** (Phase 13 gate D-185; B-07 answered as D-186). Built on `phase-12-landing`.

## 1. Scope (from the index)

- **Scope:** order and payment tables migration, checkout steps, server pricing, shipping and COD rules, reservations at checkout, order state machine, mock payment provider, webhook pipeline, reservation and COD expiry jobs.
- **Deliverables:** `checkout`, `orders` and `payments` modules; checkout routes.
- **Verification:** E2E-1, E2E-2 (storefront part) and E2E-3; payment, COD and order-lifecycle tests in `testing-strategy.md` §3.
- **Gate:** you review the end-to-end output.

**Out of scope:** admin order screens, staff COD confirmation, packing and dispatch, refunds made by staff, the settings screens and email (Phase 16); the live gateway (Phase 18); customer accounts (D-034).

## 2. Decisions this phase uses

| Topic | Rule | Source |
|-------|------|--------|
| COD | Up to ₹15,000 per order, no fee, all valid PIN codes; staff confirm within 24 hours; unconfirmed COD orders are cancelled after 48 hours and their stock released | D-186 (OD-07) |
| Shipping | A flat fee and an optional free-shipping threshold, both ₹0 / off until the Owner sets them; tracking entered by hand | D-186 (OD-08) |
| Returns | No policy text written by us; the order states support returns | D-186 (OD-09) |
| Launch offer | None; the discount stays at 0 | D-186 (OD-17) |
| GST | Prices include GST; the GST contained is computed from effective-dated rules entered by the Owner after accountant verification. No rate is entered by the system; until one is, the tax component is 0 | D-030, D-033, B-14 |
| Payments | Mock provider only; it refuses to load in production | D-107 |
| Order numbers | `SP-YYMM-NNNNNN`; at most 10 units per line | D-115 |
| Guest checkout | No accounts; the order status page needs the access token returned at placement | D-034 |

## 3. Design

- **Source:** the reference branch's Phase 15 (commits `1ea8eb6` and `2682bc9` on `claude/amazing-faraday-21s6uc`), whose base schema matches this branch's. It is ported and adapted to this branch's platform helpers and storefront, not merged (D-174).
- **Database:** `order`, `order_item`, `order_status_event` (append-only, D-057), `shipment`, `payment`, `payment_event`, `refund`, `gst_rule`; `stock_reservation.order_id`; the order-number sequence; handwritten CHECKs for totals, currency, phone, COD fee, payment method and status, and GST rule shape. Disposable databases only until you approve it for a real one.
- **Placement:** one transaction re-prices the cart, checks COD eligibility, reserves every line (all or none), and creates the order, its items, its first status event and its payment. Prepaid orders are `PENDING_PAYMENT` with the configured hold (`RESERVATION_TTL_MINUTES`, 15 minutes, SR-3); COD orders are `PENDING_CONFIRMATION`, their holds converted to allocations at once (SR-5); the job cancels them after the confirmation window. An `Idempotency-Key` returns the same order on a retry, and a different body with the same key gets `409 IDEMPOTENCY_CONFLICT`. A total that differs from `expectedTotalPaise` gets `409 PRICE_CHANGED`.
- **Payments:** a provider interface (`system-design.md` §6.1) with the mock provider. Webhooks are verified by HMAC, stored raw, processed once per provider event ID, and checked for amount and currency (a mismatch flags the order). A browser redirect never confirms an order.
- **Jobs:** expired prepaid holds cancel their orders; unconfirmed COD orders are cancelled after the window; payments stuck in `CREATED` for 30 minutes are reconciled with the provider.
- **Storefront:** `/checkout` (contact, address, delivery, payment, review), the mock payment page (development only), and `/orders/:orderNumber` with the access token, which polls until the order is confirmed or cancelled.

## 4. Stop points

- The migration is applied only to disposable databases.
- No live gateway, no real money, no email.
- The gate is your review of the end-to-end output; this plan does not pass it.

## 5. Built and verified (2026-10-26)

**Gate status: pending your review** of the end-to-end output (index Phase 15). Nothing here is a gate approval.

**What was built** (ported from the reference branch and adapted, §3):
- **Database:** migration `20261026180000_orders_payments`; its generated SQL is identical to the reference migration's. Applied to disposable databases only.
- **Shared contract:** checkout settings and request schemas, and the order transition table (`@sanea/shared`).
- **API:**
  - `checkout`, `orders` and `payments` modules: quote, placement, status, payment retry, the mock payment endpoint (development only) and the webhook pipeline;
  - order jobs (unpaid holds, unconfirmed COD after 48 hours, reconciliation after 30 minutes), started by `main.ts` with the same provider instance;
  - the inventory service gained `reserveIn` (holds inside the order's transaction, tied to the order), `convert`, `releaseOrder` and `shipOrder`; `reserve` keeps its behaviour;
  - configuration `PAYMENT_PROVIDER` (mock refused in production; `none` by default there) and `MOCK_PAYMENT_SECRET`.
- **Storefront:** `/checkout`, `/checkout/pay/mock/:paymentId` (test page) and `/orders/:orderNumber`, loaded on demand; the bag's Checkout button opens once every line is on sale and within stock.

**Adaptations from the reference, deliberate:**
- Stock holds keep this branch's database clock (Phase 9), so expiry, re-reservation and the unpaid-order job use `now()` in SQL.
- A line above the available stock is refused with `409 OUT_OF_STOCK` and each line's availability (D-178), not `CART_NOT_READY`.
- No server-state library in the storefront (U8-2).
- No email is claimed on the order page (email arrives in Phase 16), and no links to unpublished terms or returns pages.

**Evidence (commands run in the `phase-12-landing` worktree, Node 24.11.0):**

| Check | Result |
|-------|--------|
| `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run audit` | Pass; 0 vulnerabilities |
| Taste lint on `apps/storefront/src` | 0 FAIL, 0 WARN |
| `npm test` | 46 files, 794 tests pass (new: shared checkout and transitions, pricing, configuration, checkout pages) |
| `npm run test:integration` (disposable PostgreSQL 18) | 21 files, 449 tests pass; 34 in `checkout.db-test.ts`: quote, COD and prepaid placement, idempotency, price change, out of stock, concurrency on the last unit, webhooks (signature, duplicate, amount mismatch), late payments (SR-10), reconciliation, COD expiry, every transition and role, append-only history, database CHECKs, mock refused in production |
| Storefront and admin production builds | Pass; checkout pages are separate chunks (13.5 kB) |
| End-to-end, full suite, twice | 28 of 28 pass each run, including `e2e/checkout.spec.ts`: E2E-1 on desktop and mobile, E2E-3 on mobile, the storefront part of E2E-2, and field errors; axe clean at 1440, 768 and 390 px on checkout, the confirmation and the COD order page |

Screenshots: `docs/reviews/checkout/2026-10-26/`.

**Limits and open items:**
- Staff confirmation of COD orders, packing, dispatch, refunds and the settings screens are Phase 16; until then settings are the D-186 defaults and staff actions exist only in the service (tested).
- No live gateway (OD-06, Phase 18) and no email (OD-19, Phase 16).
- No GST rate is entered; the tax component shows 0 until the Owner enters accountant-verified rules (B-14).
- The returns and terms texts are not published (OD-09, OD-12).
- Lighthouse was not run on checkout: it needs a bag cookie; Phase 17 measures it.
- CI has not run on these commits (it runs on pull requests).
