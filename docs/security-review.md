# Security Review — Release One (Phase 17)

Date: 2026-10-24. Reviewer: Claude (engineering), against `security-design.md`. This is an engineering self-review with test evidence, **not** an independent penetration test; one is recommended before launch (B-11, Phase 19).

Legend: **Met**: implemented and tested. **Partly**: implemented with a stated limit. **Open**: not done; owner or later phase named.

## Authentication and sessions (§2)
| Control | Status | Evidence |
|---------|--------|----------|
| Argon2id, 12–128 characters, common-password list | Met | `auth-primitives.test.ts`, `sign-in.db-test.ts` (Phase 7) |
| TOTP for all four roles; codes single-use; secrets AES-256-GCM | Met | `sign-in.db-test.ts`, `admin-auth.db-test.ts` |
| Lockout after 5 failures, generic `SIGN_IN_FAILED` | Met | `sign-in.db-test.ts` |
| Server sessions, token hash only, `__Host-` cookies, 8 h absolute / 30 min idle | Met | `sign-in.db-test.ts`; e2e sign-out test |
| Invites single-use, 48 h, token in URL fragment | Met | `staff` tests (Phase 7) |
| Admin sign-in email for new devices (§9) | **Open** | Needs device history and a real email provider (B-08); sessions are deleted at sign-out, so "new device" cannot be decided yet. Proposed for after OD-19 |
| Customer accounts and reset tokens | Not applicable | Deferred (D-034) |

## Request protection (§3)
| Control | Status | Evidence |
|---------|--------|----------|
| CSRF: Origin check plus signed double-submit; session-bound for admin | Met | `csrf.test.ts`, every db-test's write helpers |
| Webhooks exempt from CSRF, signature-verified instead | Met | `checkout.db-test.ts` (invalid signature, no Origin) |
| CORS allow-list by path | Met | `origins.test.ts`, `app.test.ts` |
| Helmet headers, CSP, HSTS in production | Met | `app.test.ts` |
| Zod validation on every route, unknown fields rejected | Met | each module's db-test (400 cases) |
| No raw HTML rendering | Met | **Lint rule added in this review**: `dangerouslySetInnerHTML` and `innerHTML`/`outerHTML` writes are errors in the apps and packages (the document claimed a rule that did not exist). SEO preview HTML escapes every value (`seo.db-test.ts`) |
| SQL injection | Met | Prisma queries and `$queryRaw` tagged templates in application code; `$queryRawUnsafe` appears only in tests and fixtures |
| Rate limits | Partly | Sign-in, enquiries, search, cart, checkout (20/min per IP, plus **10 orders per hour per cart, added in this review** to match §3), status reads, WhatsApp clicks. In-memory, single instance only (D-047): a shared store is required before scaling out (Phase 19) |
| Body limits | Met | `app.test.ts` (100 KB), media tests (15 MB) |

## Authorisation (§4)
| Control | Status | Evidence |
|---------|--------|----------|
| Role matrix enforced in the API | Met | `role-matrix.db-test.ts`: 15 permissions × 4 roles, plus real order, enquiry, settings and dashboard routes |
| Order transitions by role | Met | `transitions.test.ts`, `admin-orders.db-test.ts` |
| Guest order status needs the access token | Met | `checkout.db-test.ts` (wrong or missing token → 404) |
| Fulfilment cancelling unconfirmed COD orders | Needs your decision | D-160: the two specifications differ |

## Payment and checkout integrity (§5)
| Control | Status | Evidence |
|---------|--------|----------|
| Server pricing; client total only compared | Met | `PRICE_CHANGED` tests; unknown `totalPaise` field rejected |
| Confirmation only from a verified webhook or server status query | Met | browser-return test; reconciliation test |
| Amount and currency check; mismatch flags | Met | amount-mismatch test |
| Events deduplicated by provider event ID | Met | duplicate-event test |
| Replay window by provider timestamp | Not applicable yet | The mock sends no timestamps; required for the live adapter (Phase 18) |
| Idempotency keys | Met | replay and conflict tests |
| No card data on our servers | Met | No card fields exist; the mock page asks for none |
| Mock provider impossible in production | Met | config refuses `PAYMENT_PROVIDER=mock`; provider refuses to load (`config.test.ts`, `checkout.db-test.ts`) |
| Overselling | Met | atomic reservation (`inventory.db-test.ts`, 50 concurrent), last-unit placement race test, CHECK constraints |

## Media (§6)
| Control | Status | Evidence |
|---------|--------|----------|
| Admin only, magic bytes, JPEG/PNG/WebP, re-encoded without metadata, 8000 px cap, random keys | Met | `catalogue.db-test.ts` media cases (Phase 8) |
| Never served by the API in production | Met | config requires an https media URL in production |

## Secrets, logging and supply chain (§7)
| Control | Status | Evidence |
|---------|--------|----------|
| Secrets from environment only; `.env.example` current | Met | `.env.example` lists `PAYMENT_PROVIDER`, `MOCK_PAYMENT_SECRET`; no `.env` tracked |
| Config validated at start | Met | `config.test.ts` |
| Log redaction | Met | **Extended in this review** to the `X-Order-Token` and mock signature headers (`app.test.ts`); email recipients in the log provider are masked |
| `npm audit` in CI, gitleaks in CI | Met | `.github/workflows/ci.yml`; local `npm audit`: 0 vulnerabilities |
| Production secret store | Open | Phase 19, needs hosting approval (B-11) |

## Privacy (§8)
| Control | Status | Evidence |
|---------|--------|----------|
| Collect only what is needed; enquiry consent required | Met | `enquiries.db-test.ts`; checkout asks for contact and address only |
| IP addresses only as keyed hashes | Met | enquiries, audit and session tables |
| Marketing opt-in | Not applicable | No marketing messages in release one |
| Privacy policy, terms, retention | **Open** | Placeholder pages only; lawyer-approved text needed (OD-12, B-09). No legal text has been written by engineering |
| Analytics | Met (none) | No third-party analytics or tracking scripts (OD-20 default); fonts self-hosted |

## Audit and monitoring (§9)
| Control | Status | Evidence |
|---------|--------|----------|
| Admin writes audited without personal data | Met | settings, orders, refunds, enquiries tests check no email in audit rows |
| Audit log, stock movements, order history and notes append-only | Met | `append-only.db-test.ts` (four tables) |
| Alerts | Open | Needs hosting and monitoring (Phase 19) |

## Findings fixed in this review
1. `X-Order-Token` would have been written to request logs: now redacted (test added).
2. No lint rule enforced the raw-HTML ban: rule added and checked with a probe file.
3. Order creation lacked the per-cart limit of §3: added (10 per hour per cart).

## Open items for launch
- Independent penetration test or review (recommended, Phase 19).
- Shared rate-limit store and job runner before more than one API instance (D-047).
- Live gateway adapter with webhook timestamp checks (Phase 18, OD-06).
- Legal texts (OD-12) and the analytics decision with legal review (OD-20).
