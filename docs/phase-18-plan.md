# Phase 18 Plan — Live Payment Gateway (preparation only)

Status: **Blocked by OD-06 (which gateway) and your explicit approval before any live key (gate).** Only preparation that needs neither has been done. Date: 2026-10-24.

## Done (no gateway, no keys, no network)
| Item | Where | Evidence |
|------|-------|----------|
| Provider interface used by all checkout code | `apps/api/src/modules/payments/provider.ts` | Phase 15 tests |
| **Provider contract test**: create payment, verify own webhook with amount and currency, reject missing, tampered and foreign signatures, report failures, refund with a reference | `payments/provider-contract.ts`; run against the mock in `payments/mock.test.ts` | 7 passed |
| Mock refused in production (config and provider) | `platform/config.ts`, `payments/mock.ts` | `config.test.ts`, `mock.test.ts` |
| Production default `PAYMENT_PROVIDER=none`: online payment unavailable, COD works | `checkout/service.ts` | `checkout.db-test.ts` |
| Webhook pipeline, deduplication, amount check, late-payment and reconciliation logic, provider-agnostic | `payments/service.ts`, `payments/router.ts` | Phase 15 tests |

## To do once you choose a gateway (OD-06) and approve
1. Record the gateway decision (problem, options, recommendation, trade-offs) in `technology-decisions.md`; add its SDK only if it gives a real benefit over signed HTTPS calls.
2. Write `payments/<gateway>.ts` implementing `PaymentProvider`: hosted checkout or SDK order creation (card data never on our servers, SAQ A), HMAC webhook verification with the gateway's **timestamp tolerance** (security-design.md §5, not needed for the mock), `fetchStatus` returning the amount as well as the status (reconciliation must compare amounts for a live provider), refunds.
3. Configuration: `PAYMENT_PROVIDER=<gateway>`, key ID, key secret and webhook secret from the secret store; sandbox keys only in non-production. `.env.example` updated with names, never values.
4. Pass `describeProviderContract("<gateway>", …)` against the **sandbox** with a driver that triggers success and failure; add sandbox replay and refund tests (index Phase 18 verification).
5. Storefront: open the gateway's hosted page or SDK from `payment.clientPayload`; the order page already waits for the verified webhook.
6. Admin refunds call `provider.refund` instead of manual recording (D-161), keeping the manual path for COD.
7. Settings group `payments` (Owner only) for enabled methods (UPI, cards, net banking, wallets).
8. **Stop for your approval before any live key is configured.** Launch mode OD-22 (wait for the gateway, recommended) is yours.

## Not done
No gateway account, sandbox, keys or live capture. Nothing was configured or enabled.
