# Phase 16 Plan — Admin Operations and Notifications

Status: **Evidence ready, awaiting your approval (D-079).** D-160 needs you to settle a difference between two specifications. Date: 2026-10-24.

## Migration `20261024200000_admin_operations` (needs your approval before any kept database)
- **Generated:** enum `notification_status`; tables `order_note` (order, admin, body, time) and `notification` (order, template, recipient, provider, status, error, time); indexes; three foreign keys, all `RESTRICT`.
- **Handwritten:** CHECKs on the note length, the four email templates, and an error exactly when failed; `order_note` append-only (UPDATE, DELETE, TRUNCATE rejected).
- Disposable databases only; drift check "No difference detected".

## Implementation
| Area | Files |
|------|-------|
| API orders | `modules/orders/admin-router.ts`: list (status, method, attention, dates in India time, search by number, email or phone; cursor), detail (items, history with staff names, payments and refunds, shipments, notes, the moves this role may make), transitions through the Phase 15 state machine (shipment required for SHIPPED; cancelling a captured online payment records a pending refund), internal notes, refunds (record, never more than paid; complete as refunded or failed with a reference), restock after return (SR-13), packing slip. Every write audited without personal data |
| API enquiries | `modules/enquiries/admin-router.ts`: inbox with status filter and cursor; status and assignee (active Owner or Manager) updates, audited; WhatsApp clicks per product |
| API dashboard | `modules/orders/dashboard.ts`: per-role figures from real rows (D-164) |
| Notifications | `modules/notifications/`: plain-text templates, log provider with masked recipient, `notifyOrder` records each attempt; sent after COD placement, payment confirmation, admin moves, expiry cancellations and reconciliation |
| Admin app | `pages/Home.tsx` (dashboard tiles linking to filtered lists), `Orders.tsx`, `OrderDetail.tsx` (next-step buttons from the API, shipment form, notes, refunds, restock), `PackingSlip.tsx` (print view; shell hidden when printing), `Enquiries.tsx`, `Settings.tsx` (shipping and COD forms, D-150), navigation entries by permission |

## Verification
| Check | Result |
|-------|--------|
| `admin-orders.db-test.ts` | 11 passed: list filters and search, catalogue editor 403, unknown filter 400; detail with role-specific next moves; COD to delivery with stock out, COD collected, history with staff names, three emails recorded, audit without the customer's email; Fulfilment cannot cancel a confirmed order, Manager can (stock back, cancel email); invalid status and http tracking link rejected; captured payment cancelled → pending refund → completed with reference; over-refund and nothing-paid refused; restock only after return, by role, never more than sent; notes append-only; packing slip without prices; enquiries inbox by role, assignee rules, audit without content; dashboard figures by role, 401 without a session |
| Unit | `notifications/templates.test.ts` 7 |
| Schema and catalogue tests | Updated for the two tables, three foreign keys, CHECKs and triggers |
| End-to-end `admin-orders.spec.ts` | E2E-2 (storefront COD order → Fulfilment confirms, packs, prints the slip, ships with tracking, delivers; the guest's page follows), catalogue editor sees no orders, E2E-5 (hero line edited and published, storefront shows it), E2E-6 (stock set to zero → product sold out, bag warns, checkout blocked) |
| Screenshots | `docs/reviews/admin-operations/2026-10-24/` |

## Not done or open
- B-08: no real email is sent until you choose a provider and sender domain (OD-19).
- Refunds are paid outside the system in release one; Phase 18 adds gateway refunds.
- Packing slips are not invoices; GST invoices wait for the accountant (B-14).
