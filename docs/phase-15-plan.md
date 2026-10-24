# Phase 15 Plan — Checkout, Orders, COD and Mock Payments

Status: **Evidence ready, awaiting your approval (D-079).** The checkout defaults are proposals (B-07 stays open, D-150). Built on the demo seed (TEST data). Date: 2026-10-24.

## Migration `20261024180000_orders_payments` (needs your approval before any kept database)
- **Generated:** enums `order_status`, `payment_method`, `payment_status`, `actor_type`, `refund_status`; tables `order`, `order_item`, `order_status_event`, `shipment`, `payment` (with `client_payload`), `payment_event` (unique provider + event ID), `refund`, `gst_rule`; `stock_reservation.order_id`; indexes; ten foreign keys, all `RESTRICT`.
- **Handwritten:** sequence `order_number_seq`; 19 CHECKs (order number format; amounts non-negative; `total = subtotal − discount + shipping + COD fee`; currency `INR`; `+91` phone; COD fee only on COD; 32-byte token hash; attention reason only when flagged; item quantity 1–10 and line total = unit × quantity; GST rate 0–100 %; payment and refund amounts positive; payment status valid for its method; refund reason; shipment text; GST rule rates, threshold pairing, dates and HSN prefix); `order_status_event` append-only (UPDATE, DELETE and TRUNCATE rejected).
- **No GST rate is inserted** (B-14). Disposable databases only; drift check "No difference detected".
- **Revised 2026-10-25, before approval (D-167, proposal):** `gst_rule` now has price bands in a new table `gst_rule_slab` (CGST, SGST, IGST in basis points; one open band per rule); rules for one HSN prefix cannot overlap in time (exclusion constraint, `btree_gist` extension); `order` gains `seller_state`, `place_of_supply_state`, `supply_type`; `order_item` replaces `gst_rate_bps` with component rates and amounts. The single-rate CHECKs are replaced by 6 CHECKs on bands, lines and the order snapshot (23 in all). Eleven foreign keys. Re-verified on disposable databases: drift check "No difference detected". Details and the accountant's open questions: `proposals/gst-model.md`.

## Implementation
| Area | Files |
|------|-------|
| Shared | `checkout/checkout.ts` (shipping and COD settings with the OD-07/OD-08 proposed defaults, quote and placement schemas), `orders/transitions.ts` (allowed-transitions table with roles, `canTransition`, `nextStatuses`, order number pattern) |
| Checkout | `modules/checkout/pricing.ts` (pure: subtotal, no discount (OD-17), flat fee and free threshold, COD fee, COD eligibility by total, PIN prefix, refusals and switch; GST contained in inclusive prices from effective-dated rules; order numbers in India time), `service.ts` (quote, placement in one transaction with Idempotency-Key replay and conflict, PRICE_CHANGED, COD_NOT_AVAILABLE, OUT_OF_STOCK, order access token, retry payment), `router.ts`, `settings.ts` |
| Orders | `modules/orders/service.ts` (state machine: table check, stock release on cancel, dispatch takes stock out with a shipment, COD payment follows delivery or refusal, status events with actor), `jobs.ts` (lapsed prepaid holds cancel the order; COD unconfirmed after 48 hours cancelled; reconciliation) |
| Payments | `modules/payments/provider.ts` (interface), `mock.ts` (refused in production; signed webhooks; success, failure, timeout), `service.ts` (store once, apply under the order lock, amount check, SR-10 late payments with system refund records, reconciliation), `router.ts` (`/webhooks/payments/:provider`, raw body, no CSRF) |
| Platform | config `PAYMENT_PROVIDER` (`mock`/`none`, mock refused in production) and `MOCK_PAYMENT_SECRET`; new error codes; webhook raw body and CSRF exemption; CORS allows `X-Order-Token`; settings groups `shipping` and `cod` |
| Storefront | `pages/Checkout.tsx` (contact, address with Indian states, billing toggle, delivery, payment with COD eligibility reasons, review; validation with the shared schema, focus on the first error, server errors mapped to fields, total change and stock change messages), `MockPay.tsx` (labelled test page, no card data), `OrderStatus.tsx` (polls while waiting for payment, retry after failure), `lib/orders.ts` (token in session storage); checkout pages load on demand |

## Verification
| Check | Result |
|-------|--------|
| `checkout.db-test.ts` | 34 passed: quote and settings; COD placement (stock allocated, status, payment, events, bag emptied, token hash only); status needs the token; COD ineligible by PIN and by refusals even when requested; PRICE_CHANGED; Idempotency-Key replay and conflict; key required; empty and changed bag; last-unit race (one 201, one 409); unknown fields; prepaid hold of 15 minutes; browser return does not confirm, verified webhook does; failure → retry → success; timeout → hold expiry cancels and releases; invalid signature stores nothing; duplicate processed once; amount mismatch flags; unknown provider 404; late payment re-reserved, sold out (refund, flag, cancel) and after cancel; reconciliation; COD 48-hour expiry; lifecycle to delivery with stock and COD collection; invalid moves and roles; cancel releases once; history append-only; CHECKs; no GST rule; settings permissions and validation; mock refused in production; no provider → no webhook |
| Unit | `pricing.test.ts` 9, `transitions.test.ts` 5, `checkout.test.ts` 5, config 1 new |
| Schema and catalogue tests | Table, foreign-key, uuid, money and CHECK lists updated; sequence and trigger checks |
| End-to-end `checkout.spec.ts` | 5 passed: E2E-1 desktop and mobile (pill → filter → product → bag → pay online → test success → confirmation), E2E-3 mobile (test failure → retry → success), E2E-2 storefront part (COD placed), field errors focused and nothing placed. Full suite 39 passed |
| Screenshots | `docs/reviews/checkout/2026-10-24/` |
| Gate | format, lint, typecheck, token check, 537 unit, 394 database tests, build, `npm audit` 0 at commit `1ea8eb6` |

## Not done or open
- B-07: shipping fee, COD rules, returns text and launch offer are your decisions; the defaults are proposals.
- B-14: no GST rate; invoices are not generated.
- E2E-2 admin part (confirm, pack, ship, deliver) is Phase 16 with the admin order screens; the API state machine is tested here.
- Live payment is Phase 18 (OD-06). In production today `PAYMENT_PROVIDER` defaults to `none`: online payment is unavailable and COD works.
- Emails for order events arrive with the notifications module in Phase 16.
