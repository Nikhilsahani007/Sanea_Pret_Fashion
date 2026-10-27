# Phase 18 Plan — Live Payment Gateway (PhonePe)

Status: **Built and tested against a fake PhonePe on 2026-10-27, on `phase-12-landing`. The sandbox run needs your PhonePe sandbox credentials; the gate needs that run and your approval. No production key is configured.** Started on the Phase 17 gate (D-194) with OD-06 answered: PhonePe Payment Gateway (D-195).

## 1. Scope (index Phase 18)

The gateway adapter behind the payment interface, sandbox testing, gateway refunds, reconciliation job. Verification: sandbox success, failure, refund and webhook replay tests pass; the mock provider is refused in production mode. Gate: **you explicitly approve the gateway before any live key is configured.**

## 2. Sources

PhonePe's developer site is not reachable from the build environment. The endpoints, fields and webhook check come from PhonePe's official Node SDK, `@phonepe-pg/pg-sdk-node` 2.0.6 from the npm registry (Apache-2.0), **read but not installed**: the adapter uses plain `fetch`, so no dependency was added.

| Item | Value |
|------|-------|
| Hosts | Sandbox `https://api-preprod.phonepe.com/apis/pg-sandbox` (token and payments). Production: token `https://api.phonepe.com/apis/identity-manager`, payments `https://api.phonepe.com/apis/pg` |
| Token | `POST /v1/oauth/token`, form-encoded `client_id`, `client_secret`, `client_version`, `grant_type=client_credentials`; header `Authorization: <token_type> <access_token>`, renewed half-way through its life and once after a `401` |
| Payment | `POST /checkout/v2/pay` `{ merchantOrderId, amount (paise), expireAfter (s), paymentFlow: { type: PG_CHECKOUT, message, merchantUrls: { redirectUrl } } }` → `{ orderId, state, expireAt, redirectUrl }` |
| Order status | `GET /checkout/v2/order/{merchantOrderId}/status?details=false` → `state` PENDING, COMPLETED or FAILED, `amount` |
| Refund | `POST /payments/v2/refund` `{ merchantRefundId, originalMerchantOrderId, amount }`; status `GET /payments/v2/refund/{merchantRefundId}/status` |
| Webhook | `Authorization` equals SHA-256 hex of `username:password` set on the dashboard; body `{ event (or type), payload }` |

## 3. Implementation

| Area | Files |
|------|-------|
| Adapter | `apps/api/src/modules/payments/phonepe.ts`: one merchant order per payment attempt (`<order number>_<payment ID>`, at most 63 characters); only a `https://*.phonepe.com` payment page is accepted; webhook check in constant time; event ID = event name, PhonePe's order or refund ID and the state, so a replay is stored once; errors carry status and code, never credentials |
| Interface | `provider.ts`: `gatewayRefunds`, refund events, `fetchStatus` returns the amount, `refund` takes our refund ID, `fetchRefundStatus`. `providers.ts` chooses mock, PhonePe or none |
| Configuration | `PAYMENT_PROVIDER=phonepe` with `PHONEPE_*` (`.env.example`). `PHONEPE_ENV=production` is refused unless `NODE_ENV=production` **and** `PHONEPE_LIVE_APPROVED=true`, the switch for your gate. The mock stays refused in production |
| Webhooks | `payments/service.ts`: refund events settle the refund once (amount checked); unknown events are stored and ignored; reconciliation compares PhonePe's reported amount |
| Refunds | `payments/refunds.ts`: staff record a refund as before; for a PhonePe payment the order job sends it within a minute (marked sent first, so a crash is found by the status check), never sends it twice (same refund ID), and settles it from the refund webhook or status. Marking it by hand is refused (`409 GATEWAY_REFUND`). Automatic refunds for orders paid after cancellation (SR-10) are sent the same way. `settleRefund` is shared with the manual path |
| Storefront | `checkout/orders.ts` `openPayment`: the mock's page as a route, or PhonePe's page on a `phonepe.com` host over https, nothing else. PhonePe returns the shopper to `/orders/<number>`, which polls until the webhook confirms |
| Admin | Order detail: a PhonePe refund shows "sent to PhonePe, waiting for its answer" and has no "Mark refunded" |
| Sandbox | `npm run phonepe:sandbox` (`scripts/phonepe-sandbox.ts`): token, a ₹1 payment you pay or decline on PhonePe's sandbox page, status polling, then a full refund and its status. Refuses production |

No schema change and no migration: `payment.provider` and `refund.provider_refund_id` already hold what PhonePe needs.

## 4. Verification

**Run on 2026-10-27 (fake PhonePe, disposable PostgreSQL 18):**

| Check | Result |
|-------|--------|
| `phonepe.test.ts` (unit, 6) | Token request fields and caching, renewal half-way and after `401`; payment request body; a non-PhonePe page refused; errors without secrets; order and refund state mapping; refund request body; webhook accepted only with the right SHA-256, upper or lower case; replay gives the same event ID; failed, refund and SDK-style events mapped; merchant order IDs within limits |
| `config.test.ts` | Every PhonePe credential required; production mode needs `NODE_ENV=production` and `PHONEPE_LIVE_APPROVED=true`; sandbox allowed on a production-mode staging server |
| `phonepe.db-test.ts` (integration, 5) | Order opens PhonePe's page; forged webhooks rejected and nothing stored; authentic completion confirms; replay stored once; failure waits for retry; wrong amount flagged, not confirmed; reconciliation confirms a stuck payment from PhonePe's status; staff refund sent once, refused by hand, settled by refund webhook (replayed safely); refund settled from status when no webhook arrives |
| `orders.test.ts` (storefront) | Only the mock route or a `https://*.phonepe.com` page is opened |
| Whole suite | Format, lint, typecheck; 832 unit, 501 integration (25 files) and 39 end-to-end tests pass |

**Needs you (the gate):**
1. PhonePe sandbox credentials in `.env` (`PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`) and a webhook username and password set on the sandbox dashboard.
2. `npm run phonepe:sandbox` twice: once paying (success, then refund) and once declining (failure).
3. Webhook delivery and replay: the API reachable over https (a staging server from Phase 19, or a tunnel), the webhook URL `<API>/api/v1/webhooks/payments/phonepe` on the dashboard, one order paid through the storefront, then the same webhook re-sent from the dashboard: the order is confirmed once and the replay is stored once.
4. Your approval of the gateway. Only then are production keys and `PHONEPE_LIVE_APPROVED=true` set, on the production server (Phase 19).

## 5. Not done or open

- The sandbox run and the webhook replay against PhonePe itself (§4, needs your credentials and a reachable API).
- PhonePe's settlement reports are not imported; reconciliation covers payments and refunds by status only.
- Launch mode (OD-22) stays open.
