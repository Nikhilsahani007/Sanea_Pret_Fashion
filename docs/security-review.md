# Security Review — Release One (Phase 17)

Date: 2026-10-26. Branch `phase-12-landing`. Reviewer: Claude (engineering), control by control against `security-design.md`. This is an engineering self-review with test evidence, **not** an independent penetration test; one is recommended before launch (Phase 19).

Legend: **Met**: implemented and tested. **Partly**: implemented with a stated limit. **Open**: not done; owner or phase named.

## Authentication and sessions (§2)

| Control | Status | Evidence |
|---------|--------|----------|
| Argon2id passwords, length limits, common-password list | Met | Phase 7 auth tests |
| TOTP for every staff role; single-use codes; secrets encrypted (AES-256-GCM) | Met | Phase 7 sign-in tests |
| Lockout after 5 failures; one generic `SIGN_IN_FAILED` | Met | sign-in tests |
| Server sessions, token hashes only, `__Host-` cookies, absolute and idle expiry | Met | sign-in tests; e2e sign-out test |
| Invites single-use, time-limited, token in the URL fragment | Met | staff tests; e2e invite set-up |
| Sign-in email for a new device (§9) | **Open** | Needs an email provider (B-08, D-190) |
| Customer accounts | Not applicable | Deferred (D-034) |

## Request protection (§3)

| Control | Status | Evidence |
|---------|--------|----------|
| CSRF: Origin check and signed double-submit; bound to the session for staff | Met | `csrf.test.ts`; every integration test's write helpers |
| Webhooks exempt from CSRF and verified by signature instead | Met | checkout webhook tests |
| CORS allow-list | Met | `origins.test.ts`, `app.test.ts` |
| Security headers, CSP, HSTS in production | Met | `security-headers.ts`, `app.test.ts` |
| Validation on every route; unknown fields refused | Met | each module's 400 cases |
| No raw HTML rendering | Met | **Lint rule added in this review**: `dangerouslySetInnerHTML`, `innerHTML` and `outerHTML` writes and `insertAdjacentHTML` are errors in both apps and the shared package (a probe file is flagged twice). Content is structured JSON. The bot preview HTML escapes every value (`seo.db-test.ts`) |
| SQL injection | Met | Prisma queries and tagged `$queryRaw` templates. **In this review** the demo seed's one `$queryRawUnsafe` (a constant statement) became a tagged template, so `Unsafe` raw SQL appears only in tests and fixtures |
| Rate limits | Partly | Sign-in, enquiries, search, cart writes, checkout (20 writes and 120 reads per minute per IP), WhatsApp clicks, and **10 new orders per hour per cart, added in this review** to match §3 (`order-limit.test.ts`). In memory, one API instance only (D-047): a shared store is required before scaling out (Phase 19) |
| Body limits | Met | `app.test.ts` (100 KB JSON), media tests (15 MB) |

## Authorisation (§4)

| Control | Status | Evidence |
|---------|--------|----------|
| Role matrix enforced in the API | Met | `role-matrix.db-test.ts`: 16 permissions × 4 roles; real routes for staff, audit, orders, enquiries, settings and the dashboard |
| Order moves by role; cancellations by permission with a reason (D-181) | Met | `transitions.test.ts`; `admin-orders.db-test.ts` (16 role and state cases) |
| Guest order pages need the access token | Met | wrong or missing token is `404` (checkout tests) |

## Payment and checkout integrity (§5)

| Control | Status | Evidence |
|---------|--------|----------|
| Server pricing; the client's total only compared | Met | price-changed tests |
| Confirmation only from a verified webhook or a server status query | Met | webhook and reconciliation tests |
| Amount and currency checked; mismatches flagged | Met | amount-mismatch test |
| Provider events deduplicated | Met | duplicate-event test |
| Idempotency keys | Met | replay and conflict tests |
| No card data on our servers | Met | no card fields exist; the mock page asks for none |
| Mock provider impossible in production | Met | config refuses `PAYMENT_PROVIDER=mock` in production (`config.test.ts`) |
| No overselling | Met | atomic reservations, concurrency tests, CHECK constraints |
| Webhook replay window by provider timestamp | Open | The mock sends none; required for the live adapter (Phase 18, OD-06) |

## Media (§6)

| Control | Status | Evidence |
|---------|--------|----------|
| Staff only; file signature checked; JPEG, PNG, WebP; re-encoded without metadata; random keys | Met | Phase 8 media tests |
| Public images on https in production | Met | config refuses a non-https media URL in production |

## Secrets, logging and supply chain (§7)

| Control | Status | Evidence |
|---------|--------|----------|
| Secrets from the environment only; `.env.example` current; no `.env` tracked | Met | `git ls-files` lists no `.env`; `.env.example` lists every variable |
| Configuration validated at start | Met | `config.test.ts` |
| Log redaction | Met | **Extended in this review** to the `X-Order-Token` and `X-Mock-Signature` headers (`app.test.ts`); the email log provider masks addresses |
| `npm audit` and gitleaks in CI | Met | `.github/workflows/ci.yml`; local `npm audit`: 0 vulnerabilities |
| Production secret store | Open | Phase 19, with hosting approval (OD-18) |

## Privacy (§8)

| Control | Status | Evidence |
|---------|--------|----------|
| Collect only what is needed; consent on enquiries | Met | enquiry tests; checkout asks for contact and address only |
| IP addresses only as keyed hashes | Met | enquiries, audit and sessions |
| Search engines kept out of the bag, checkout, orders and search | Met | `robots.txt` and `noindex` (`seo.db-test.ts`) |
| Analytics | Met (none) | No third-party analytics or tracking scripts; fonts self-hosted (OD-20 default) |
| Privacy policy, terms, retention | **Open** | No legal text has been written by engineering. Lawyer-approved text is needed (OD-12, B-09) |

## Audit and monitoring (§9)

| Control | Status | Evidence |
|---------|--------|----------|
| Staff writes audited without personal data | Met | orders, refunds, enquiries and settings tests check the audit rows |
| Audit log, stock movements, order history and order notes append-only | Met | `append-only.db-test.ts` (four tables) |
| Alerts | Open | Needs hosting and monitoring (Phase 19) |

## Fixed in this review

1. The guest order token and the mock webhook signature could reach request logs: both headers are now redacted, with a test.
2. Nothing enforced the ban on raw HTML: a lint rule now does, checked with a probe file.
3. Order placement lacked the per-cart limit of §3: 10 new orders per cart per hour, with a test.
4. The demo seed used `$queryRawUnsafe`: now a tagged template.

## Open before launch

- Independent penetration test or review (Phase 19).
- Shared rate-limit store and job runner before a second API instance (D-047).
- Live gateway adapter with webhook timestamp checks (Phase 18, OD-06).
- Legal texts (OD-12) and the analytics decision with legal review (OD-20).
- Email provider (OD-19), which also enables the new-device sign-in email.
