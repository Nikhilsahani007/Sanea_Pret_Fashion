# Sanéa Pret — Security Design

Status: Draft for approval · Date: 2026-10-18 · Target: OWASP ASVS 4.0 Level 2

## 1. Assets and threats

| Asset | Main threats |
|-------|--------------|
| Admin accounts | Credential stuffing, phishing, session theft, privilege escalation |
| Customer personal data (names, phones, addresses) | Data leak, insecure direct object reference (IDOR), enumeration |
| Orders and payments | Price tampering, fake payment confirmation, replayed webhooks, double orders |
| Inventory | Overselling through race conditions, stock hoarding by bots |
| Storefront content | Defacement, stored XSS via CMS content, unverified claims on the Rehma Foundation page |
| Media uploads | Malicious files, oversized uploads, metadata leaks (GPS in EXIF) |
| Secrets | Leaked `.env`, secrets in logs or git |

## 2. Authentication

### Admin
- Email and password. Passwords hashed with **Argon2id** (memory 64 MB, iterations 3, parallelism 1, tuned on target hardware).
- Minimum 12 and maximum 128 characters (the maximum bounds hashing work), checked case-insensitively against a bundled common-password list (D-063: SecLists top 100,000, keeping its 483 entries of 12+ characters; source and licence in `apps/api/src/modules/auth/data/README.md`). No composition rules. Hashing uses Node's built-in `crypto.argon2` (D-062).
- **TOTP multi-factor authentication required for all four roles** (Owner, Manager, Catalogue Editor, Fulfilment; D-032).
- Lockout: 5 failed attempts → 15-minute lock, plus IP rate limit. Wrong passwords and wrong 2FA codes both count. Generic error messages: every failure is `401 SIGN_IN_FAILED` (D-066).
- Sign-in is two steps: password, then a 5-minute signed 2FA challenge (not a session), then a TOTP code or a one-time recovery code. TOTP is RFC 6238 (6 digits, 30 s, ±1 step); each step is claimed atomically, so a code cannot be reused. 2FA secrets are AES-256-GCM encrypted with `MFA_ENCRYPTION_KEY`, with the key version stored (D-064, D-065).
- Staff are invited by the Owner. Invite links are single-use and expire in 48 hours; the token is in the URL fragment, so it never reaches server logs. Accepting sets the password and enrols 2FA; 10 recovery codes are shown once. Until Phase 16 the link is returned to the Owner to pass on (D-070). An Owner resets another admin with a new link (D-071). The first Owner is created with `npm run admin:create-owner` (D-069). No public admin sign-up.

### Customer
**Deferred to a later release (D-034).** Release one has guest checkout only; the rules below apply when accounts are added.
- Email and password with the same hashing. Guest checkout always available.
- Password reset tokens: 256-bit random, hashed at rest, single use, 30-minute expiry. Reset revokes other sessions.
- Phone OTP sign-in is a possible later addition (OD-10).

### Sessions
- Server-side sessions in PostgreSQL. Cookie holds a random 256-bit token; the database stores only its SHA-256 hash.
- Release one has admin sessions only: table `admin_session`, linked to `admin_user` by a foreign key with `ON DELETE CASCADE` (D-055). Customer sessions return with accounts (D-034).
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` (storefront) and `SameSite=Strict` (admin), `Path=/`, host-only with the `__Host-` prefix. The admin cookie is `__Host-sp_admin` (D-067).
- With an admin session, state-changing admin requests must send that session's CSRF token, an HMAC of the session ID returned by `/admin/auth/mfa` and `/admin/auth/me` (D-068).
- Admin sessions: 8-hour absolute, 30-minute idle timeout. Customer sessions: 30-day absolute, 7-day idle.
- Session ID rotated on sign-in and privilege change. Sign-out deletes the server session.
- Tokens are never stored in `localStorage`.

## 3. Request protection

| Control | Implementation |
|---------|----------------|
| CSRF | **Phase 5 to 6 (D-045):** Origin allow-list check plus a signed double-submit token. `GET /api/v1/auth/csrf` sets cookie `__Host-sp_csrf` and returns the same token in the JSON body; every POST, PUT, PATCH and DELETE must send it in `X-CSRF-Token`. The token is `nonce.issuedAt.signature`, where the signature is HMAC-SHA-256 over the nonce and timestamp with `CSRF_SECRET`, so it cannot be forged without the secret. The header must equal the cookie (constant-time comparison), the signature must verify, and the token expires after 12 hours. **From Phase 7:** tokens are bound to the server-side session. Cookie attributes in every environment: `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, `__Host-` prefix (D-132). Local development on `http://localhost` with a same-origin dev proxy; Safari or non-localhost hosts need local HTTPS (D-132, `phase-5-plan.md`). |
| CORS | Explicit allow-list: storefront origin for public routes, admin origin for `/api/v1/admin` and paths beneath it. Admin paths are matched on the pathname only (query string ignored) and case-insensitively, as Express routes are; look-alikes such as `/api/v1/administrator` stay public. The same rule selects the origin for the CSRF Origin check. Credentials allowed only for those origins. |
| Security headers | `helmet`: strict Content-Security-Policy (no inline scripts; nonce or hash if needed), `frame-ancestors 'none'`, HSTS (prod), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` minimal. |
| Input validation | Zod schemas on every route for body, query and params. Unknown fields rejected. String lengths bounded. |
| Output encoding | React escapes by default. CMS rich text is stored as structured JSON and rendered through an allow-list renderer. `dangerouslySetInnerHTML` is banned by lint rule. |
| SQL injection | Prisma parameterised queries. Raw SQL only through `Prisma.sql` tagged templates, reviewed. |
| Rate limiting | Sign-in 5/min per IP and per account; enquiries 5/hour per IP; checkout order creation 10/hour per cart; search 60/min per IP. |
| Rate-limit storage | **In memory, single API instance only (D-047).** Counters are not shared between instances or kept across restarts. A shared store is a **mandatory decision before any multi-instance deployment (Phase 19)**. Global default: 300 requests per minute per IP, health endpoint exempt (D-048); stricter per-route limits arrive with the routes that need them. |
| Bot protection | Honeypot fields and timing checks on enquiry and sign-up forms. A CAPTCHA (e.g. Cloudflare Turnstile) is held in reserve if abuse appears. |
| Body limits | 100 KB JSON; 15 MB per upload, admin-only route. |

## 4. Authorisation

Role-based access control enforced in the API by middleware that reads the role from the server-side session. The admin UI hides controls the role cannot use, but the API is the authority.

| Permission | Owner | Manager | Catalogue editor | Fulfilment |
|------------|:-----:|:-------:|:----------------:|:----------:|
| View products | ✔ | ✔ | ✔ | ✔ |
| Edit product content | ✔ | ✔ | ✔ | |
| Edit prices | ✔ | ✔ | | |
| Publish or archive products | ✔ | ✔ | ✔ | |
| Adjust inventory | ✔ | ✔ | | ✔ |
| View orders and customer details | ✔ | ✔ | | ✔ |
| Fulfilment transitions | ✔ | ✔ | | ✔ |
| Cancel confirmed or packed orders, issue refunds | ✔ | ✔ | | |
| Decline unconfirmed COD orders | ✔ | ✔ | | ✔ |
| Edit homepage and pages | ✔ | ✔ | ✔ | |
| Publish Rehma Foundation page | ✔ | | | |
| Enquiries | ✔ | ✔ | | |
| Store, shipping, COD settings | ✔ | ✔ | | |
| Payment settings | ✔ | | | |
| Tax settings and GST rules | ✔ | | | |
| Staff management | ✔ | | | |
| Audit log | ✔ | | | |

Cancellation rules (D-160, decided 2026-10-25): Fulfilment, Manager and Owner may decline a COD order that is still waiting for confirmation; only Owner and Manager may cancel a confirmed or packed order; no order is cancelled after dispatch (return to origin or a return instead). Every cancellation needs a reason code, and the code `OTHER` needs a note. The API checks the permission and the allowed-transitions table; the reason is kept in the order history and the audit entry, the note only in the order history.

Object-level checks: customers can read only their own orders, addresses and wishlist (applies once accounts exist; deferred, D-034). Guest order status requires an unguessable order access token, not just the order number.

## 5. Payment and checkout integrity

- Prices, discounts, shipping and totals are always computed on the server. The client's `expectedTotalPaise` is only used to detect changes.
- Orders are confirmed only from a verified webhook signature or a server-to-server status query, never from a browser redirect parameter.
- Webhook amount and currency are compared with the stored order. Mismatch → reject and flag.
- Webhook events deduplicated by provider event ID. Replays older than the provider's tolerance window are rejected when the provider supplies timestamps.
- Idempotency keys prevent duplicate orders from double taps or retries.
- Card data never reaches Sanéa Pret servers (hosted checkout, PCI DSS SAQ A scope).
- The mock provider cannot be enabled in production; startup fails if configured.

## 6. Media upload safety

- Admin-only. MIME type verified by magic bytes. Only JPEG, PNG, WebP.
- Re-encoded with `sharp`, which strips EXIF and other metadata.
- Stored under random keys. Never served from the API origin, never executed.
- Image pixel dimensions capped (e.g. 8000 × 8000) to prevent decompression bombs.

## 7. Secrets and configuration

- All secrets come from environment variables. `.env` is git-ignored; `.env.example` lists every variable with no real values.
- Config is validated at startup with Zod; missing secrets stop the process.
- Production secrets live in a managed secret store (e.g. AWS Secrets Manager) once infrastructure is approved.
- Logs redact `authorization`, `cookie`, `password`, `token`, `otp`, phone and email fields.
- Dependency scanning (`npm audit` in CI, Dependabot or Renovate) and secret scanning (gitleaks) in CI.

## 8. Privacy (DPDP Act 2023)

- Collect only what checkout and enquiries need.
- Clear consent text for being contacted on enquiries, and a separate opt-in for marketing (unticked by default).
- Privacy policy describes purposes, retention and a contact for data requests. Written or reviewed by a lawyer (OD-12).
- Customers can request account deletion; order records are retained for legal reasons with personal fields minimised where allowed.
- IP addresses stored only as salted hashes for rate limiting and abuse checks.

## 9. Audit and monitoring

- Every admin write is recorded in `AuditLog` with before and after values (secrets excluded).
- The audit log is append-only in the database: a trigger rejects UPDATE, DELETE and TRUNCATE, so not even the API's own database user can rewrite it (D-057).
- Alerts (once hosting exists): spike in failed sign-ins, webhook signature failures, orders flagged `needsAttention`, 5xx rate.
- Admin sign-in notifications by email for new devices (Phase 16, master index).

## 10. Top risks and mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| R1 | Overselling during a drop or sale | High | High | Atomic conditional reservation, DB check constraints, concurrency tests. |
| R2 | Fake payment confirmation | Medium | High | Webhook signature verification and server-side status query only. |
| R3 | Admin account takeover | Medium | High | Argon2id, MFA, lockout, short sessions, audit log. |
| R4 | COD fraud and refusals | High | Medium | COD limits, staff confirmation step, per-customer COD block, expiry of unconfirmed orders. |
| R5 | Stored XSS via CMS | Low | High | Structured content only, allow-list renderer, strict CSP. |
| R6 | IDOR on orders | Medium | High | Ownership checks, order access tokens, tests for cross-account access. |
| R7 | Unverified claims on Rehma Foundation page | Medium | High (legal, reputational) | Owner-only publish with verification flag; placeholder content by default. |
| R8 | Secrets committed to git | Low | High | `.gitignore`, gitleaks in CI, `.env.example` only. |
| R9 | Enquiry and sign-up spam | High | Low | Rate limits, honeypot, CAPTCHA in reserve. |
| R10 | Third-party font/CDN outage or tracking | Low | Medium | Self-host fonts and assets. |
