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
- Minimum 12 characters, checked against a breached-password list (k-anonymity range check or a bundled top-100k list). No composition rules.
- **TOTP multi-factor authentication required** for Owner and Manager, optional for others in R1 (OD-11 recommends required for all).
- Lockout: 5 failed attempts → 15-minute lock, plus IP rate limit. Generic error messages.
- Staff are invited by the Owner. Invite links are single-use and expire in 48 hours. No public admin sign-up.

### Customer
- Email and password with the same hashing. Guest checkout always available.
- Password reset tokens: 256-bit random, hashed at rest, single use, 30-minute expiry. Reset revokes other sessions.
- Phone OTP sign-in is a possible later addition (OD-10).

### Sessions
- Server-side sessions in PostgreSQL. Cookie holds a random 256-bit token; the database stores only its SHA-256 hash.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` (storefront) and `SameSite=Strict` (admin), `Path=/`, host-only with the `__Host-` prefix.
- Admin sessions: 8-hour absolute, 30-minute idle timeout. Customer sessions: 30-day absolute, 7-day idle.
- Session ID rotated on sign-in and privilege change. Sign-out deletes the server session.
- Tokens are never stored in `localStorage`.

## 3. Request protection

| Control | Implementation |
|---------|----------------|
| CSRF | Synchroniser token from `GET /auth/csrf`, sent in `X-CSRF-Token` on every state-changing request; plus `SameSite` cookies and an `Origin` header check. |
| CORS | Explicit allow-list: storefront origin for public routes, admin origin for `/admin`. Credentials allowed only for those origins. |
| Security headers | `helmet`: strict Content-Security-Policy (no inline scripts; nonce or hash if needed), `frame-ancestors 'none'`, HSTS (prod), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` minimal. |
| Input validation | Zod schemas on every route for body, query and params. Unknown fields rejected. String lengths bounded. |
| Output encoding | React escapes by default. CMS rich text is stored as structured JSON and rendered through an allow-list renderer. `dangerouslySetInnerHTML` is banned by lint rule. |
| SQL injection | Prisma parameterised queries. Raw SQL only through `Prisma.sql` tagged templates, reviewed. |
| Rate limiting | Sign-in 5/min per IP and per account; enquiries 5/hour per IP; checkout order creation 10/hour per cart; search 60/min per IP. |
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
| Cancel orders, issue refunds | ✔ | ✔ | | |
| Edit homepage and pages | ✔ | ✔ | ✔ | |
| Publish Rehma Foundation page | ✔ | | | |
| Enquiries | ✔ | ✔ | | |
| Store, shipping, COD settings | ✔ | ✔ | | |
| Payment settings | ✔ | | | |
| Staff management | ✔ | | | |
| Audit log | ✔ | | | |

Object-level checks: customers can read only their own orders, addresses and wishlist. Guest order status requires an unguessable order access token, not just the order number.

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
