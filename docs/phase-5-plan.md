# Phase 5 Plan — API Platform Skeleton

Status: **Approved (D-049); implemented on branch `phase-5-api-platform`; commit and draft PR #3 authorised (D-133).** Completion gate pending. · Date: 2026-10-19

## Scope
`apps/api` platform layer only: Express app, configuration validation, logging, standard error format, security headers, CORS, CSRF, body limits, rate limiting and the health endpoint. No business routes, database, sessions, authentication, checkout, payments, UI or infrastructure.

## Decisions
- D-045 CSRF: Origin check plus signed double-submit token; session-bound from Phase 7.
- D-046 New error codes: `MALFORMED_JSON` (400), `PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415).
- D-047 In-memory rate limits for one instance; shared store mandatory before multi-instance deployment.
- D-048 300 requests per minute per IP; health exempt.
- D-132 CSRF cookie strategy, below (confirmed 2026-10-19).

## CSRF cookie strategy (D-132, confirmed)
- **Every environment** uses the production cookie: name `__Host-sp_csrf`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, `Max-Age` 12 hours. No relaxed development variant exists.
- **Local development** runs on `http://localhost`. Chrome, Edge and Firefox treat `localhost` as a secure context, so they store `Secure` and `__Host-` cookies over HTTP there. The storefront and admin Vite dev servers will proxy `/api` to the API, so the browser sees one origin and `SameSite=Strict` holds. For Safari or a non-localhost host, use local HTTPS.
- **Browser behaviour on `http://localhost`:** Chromium browsers (Chrome, Edge) and Firefox treat `localhost` as a secure context and store the cookie. Safari does not store `Secure` cookies over plain HTTP, so Safari testing needs local HTTPS (for example a locally trusted certificate on the dev server). Use `localhost`, not `127.0.0.1` or a LAN address, unless the dev server runs HTTPS.
- **How the frontend uses it:** call `GET /api/v1/auth/csrf` with credentials; the response body is `{ "csrfToken": "…" }` and the same value is set in the cookie. Send it as `X-CSRF-Token` on every POST, PUT, PATCH and DELETE. The cookie is `HttpOnly`, so scripts never read it; the header value comes from the response body.
- **Server check:** Origin in the allow-list for the path; cookie and header both present; header equals cookie (constant-time); signature valid for `CSRF_SECRET`; not older than 12 hours. Any failure: `403 CSRF_FAILED`.

## Verification of the cookie strategy (2026-10-19)
Real headless browsers, a page served by a stand-in for the Vite dev server on `http://localhost:5199` that proxies `/api` to the API (`NODE_ENV=development`). Scratch script only, nothing added to the repository.

| Browser | Cookie stored | Attributes as stored | `isSecureContext` | Cookie readable by JS | POST with token | Without token | Tampered token |
|---------|---------------|----------------------|-------------------|-----------------------|-----------------|---------------|----------------|
| Edge 155.0.4283.45 | Yes, `__Host-sp_csrf` | Secure, HttpOnly, SameSite=Strict, Path=/, host-only `localhost`, expires in 12 h | true | No | 404 (CSRF passed, no route) | 403 | 403 |
| Chrome 154.0.8037.100 | Yes, `__Host-sp_csrf` | Same | true | No | 404 | 403 | 403 |

Not verified: Firefox and Safari (not installed). Note: a page must not be served by the API itself, because the API's `default-src 'none'` CSP blocks `fetch` from such a page; pages come from the dev server.

## Graceful shutdown on Linux (2026-10-19)
Docker `node:24.11.0-bookworm-slim` (Linux 5.15, WSL2 engine), real `node apps/api/src/main.ts`, health checked, one idle keep-alive connection held open, then the signal sent.

| Signal | Health | Shutdown logged | Exit code | Time to exit | stderr |
|--------|--------|-----------------|-----------|--------------|--------|
| SIGTERM | 200 `{"status":"ok"}` | Yes | 0 | 16 ms | empty |
| SIGINT | 200 `{"status":"ok"}` | Yes | 0 | 24 ms | empty |

Run with `--unhandled-rejections=strict`; no error text in output. Start-up in the container took 42 to 86 s because modules load from a Windows OneDrive bind mount; start-up on Windows directly is under a second.

## Dependencies (exact)
Runtime in `@sanea/api`: express 5.3.0, helmet 8.3.0, cors 2.8.6, cookie-parser 1.4.7, express-rate-limit 8.7.1, pino 10.4.0, pino-http 11.0.0, zod 4.6.7, `@sanea/shared` (workspace). Dev: supertest 7.3.1, @types/express 5.0.6, @types/cors 2.8.19, @types/cookie-parser 1.4.10, @types/supertest 7.2.1.

## Acceptance criteria
P5-AC1 to P5-AC12 as presented in the plan review. Results: `PROJECT-STATUS.md`.
