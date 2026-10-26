# Phase 16 Plan — Admin Operations and Notifications

Status: **Gate passed 2026-10-26 (D-192); P16-1 and P16-2 confirmed.** Started on your approval of the Phase 15 gate (D-188). The email provider is deferred (D-190), so emails go to the log provider only. Ported from the reference branch's Phase 16, adapted to the canonical modules; the reference work is a candidate, not a decision (D-175).

## 1. Scope (index Phase 16)

Admin order list and detail, status transitions, packing slip, cancellation with reasons (D-181), refund records, restock after returns, enquiries inbox, admin dashboard, transactional email through the log provider. Added on the same footing: a store settings screen for delivery, cash on delivery (D-186) and the WhatsApp number (OD-16), which Phase 13 left for this phase (D-185).

## 2. Decisions this phase needs from you

| # | Question | What is built (proposed) |
|---|----------|--------------------------|
| P16-1 | The cancellation reason codes. D-181 fixes the rules (a code always; `OTHER` needs a note) but not the list. | Staff codes: customer asked to cancel; customer could not be reached; suspected fraud; out of stock; address cannot be served; other (note required). System codes: payment not completed in time; not confirmed within the window; paid after the hold expired with the stock gone. Taken from the reference branch (its D-170). A database CHECK and a test keep the list and the code in step. |
| P16-2 | Where staff land after signing in. | The new dashboard ("Today"), not the product list. |

## 3. Migration `20261027090000_admin_operations` (disposable databases only)

- **Generated:** enum `notification_status`; tables `order_note` and `notification`; column `order_status_event.reason`; indexes; three foreign keys, all `RESTRICT`.
- **Handwritten:** CHECKs on the note length, the four email templates, an error exactly when a send failed, a reason exactly on a cancellation and only from the list, and a note with `OTHER`; `order_note` append-only (UPDATE, DELETE and TRUNCATE rejected).
- **Drift:** after `migrate deploy` on a fresh database, `prisma migrate diff` against the schema prints an empty migration.

## 4. Implementation

| Area | Files |
|------|-------|
| Shared | `orders/transitions.ts`: `CANCEL_REASONS`, `STAFF_CANCEL_REASONS`; each cancellation move names the permission the API checks. `enums/permissions.ts`: `orders.declineCod` (O M F, D-181); `security-design.md` §4 row added |
| Orders service | `transition` checks the move's permission (403) and the reason (400); every cancellation records its code. Jobs and payments pass the system codes |
| API orders | `modules/orders/admin-router.ts`: list (filters, search, India dates, cursor), detail with the role's next moves, transitions, notes, refunds (record and complete), restock, packing slip. Writes audited without personal data |
| API dashboard | `modules/orders/dashboard.ts`: figures per role from real rows |
| API enquiries | `modules/enquiries/admin-router.ts`: inbox, status and assignee (active Owner or Manager), assignees, WhatsApp taps per product |
| API settings | `modules/checkout/settings-router.ts`: delivery, cash on delivery and WhatsApp, validated with the schemas their readers use; audited |
| Notifications | `modules/notifications/`: plain-text templates; the log provider writes the subject and a masked address; `notify` records every attempt and never undoes an order change. Sent after a COD placement, payment confirmation, staff moves, expiry cancellations and reconciliation |
| Guest order page | `orderSummary` adds the latest shipment; the storefront page says packed, on its way, delivered or returned, with courier, tracking number and link |
| Admin app | `orders/`: `Dashboard` (tiles linking to filtered lists), `Orders`, `OrderDetail` (next steps from the API, shipping form, reason and note on cancelling, notes, refunds, restock), `PackingSlip` (prints without the shell), `Enquiries`, `Settings`; navigation by permission |
| Bag | A sold-out line now says "Sold out. Remove it to check out." instead of asking to lower the quantity |

## 5. Verification (2026-10-26)

| Check | Result |
|-------|--------|
| Unit | 821 passed (shared transitions and reasons, notification templates, admin screens: `orders/orders.test.tsx` 8) |
| Integration | 488 passed in 23 files; `orders/admin-orders.db-test.ts` 31: filters and search, detail moves by role, COD to delivery with stock out and payment collected, three emails recorded, audit without the customer's email, cancellation by role and state (16 cases), reasons and notes, refunds, restock, notes append-only, packing slip without prices, enquiries, dashboard by role, store settings |
| Schema | Tables, foreign keys (45), uuid keys, append-only triggers and CHECKs checked against the live catalogue; the reason list matches the shared codes |
| End to end | 34 passed (`operations.spec.ts` 6: E2E-2 admin part, D-181 decline, role limits, enquiries and settings, E2E-5, E2E-6); axe clean and no horizontal scroll at 1440, 768 and 390 px |
| Other | format, ESLint, design tokens, typecheck, `npm audit` (0), Taste lint (0 fail, 0 warn), both production builds |
| Screenshots | `docs/reviews/operations/2026-10-26/` |

Fixed while testing: the order page and the packing slip scrolled sideways on tablets and phones (tables now fit or scroll in their own region); a checkout test left the page before the bag had saved (it now waits).

## 6. Not done or open

- B-08: no real email is sent until you choose a provider and sender domain (OD-19, D-190).
- Refunds are paid outside the system in release one; gateway refunds come with Phase 18.
- Packing slips are not GST invoices (B-14).
- Staff management screens are not built; the Owner invites staff through the API, as before.
- CI has not run on these commits.
