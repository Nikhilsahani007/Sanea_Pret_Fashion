# Sanéa Pret — API Specification

Status: Draft for approval · Date: 2026-10-18 · Base path: `/api/v1`

## 1. Boundaries

| Surface | Prefix | Callers | Auth |
|---------|--------|---------|------|
| Public storefront | `/api/v1/*` | Storefront, link-preview meta renderer | Optional customer session; cart token cookie |
| Customer account | `/api/v1/account/*` | Storefront | Customer session required **Deferred to a later release (D-034).** |
| Admin | `/api/v1/admin/*` | Admin app only | Admin session required, role checked per route |
| Webhooks | `/api/v1/webhooks/*` | Payment provider | Signature verification only, no session |
| Health | `/api/v1/health` | Load balancer | None; returns no internal details |

The admin surface accepts requests only from the admin origin (CORS allow-list) and uses a separate session cookie name and path from the storefront.

## 2. Conventions

- JSON only. `Content-Type: application/json; charset=utf-8`. Request bodies limited to 100 KB (uploads separate).
- Money fields are integers in paise, named `…Paise`, plus `currency: "INR"` on order-level objects.
- Pagination: cursor-based. `?limit=24&cursor=<opaque>`. Responses include `nextCursor`.
- Dates: ISO 8601 UTC strings.
- State-changing requests with a session cookie require the `X-CSRF-Token` header (see `security-design.md` §3).
- `Idempotency-Key` header (UUID) required on `POST /checkout/orders` and `POST /checkout/orders/:id/payment`.

### Error shape

```json
{
  "error": {
    "code": "OUT_OF_STOCK",
    "message": "Some items are no longer available in the quantity requested.",
    "details": [{ "variantId": "…", "requested": 2, "available": 1 }],
    "requestId": "01J…"
  }
}
```

| HTTP | Typical codes |
|------|---------------|
| 400 | `VALIDATION_FAILED` (details list field paths), `MALFORMED_JSON` (body is not valid JSON), `INVITE_INVALID` (invite or reset link unknown, used, revoked or expired), `PASSWORD_REJECTED` (details: `TOO_SHORT`, `TOO_LONG` or `TOO_COMMON`) |
| 401 | `UNAUTHENTICATED`, `SIGN_IN_FAILED` (one generic answer for wrong email, password, code, locked or inactive account; D-066) |
| 403 | `FORBIDDEN`, `CSRF_FAILED` |
| 404 | `NOT_FOUND` |
| 413 | `PAYLOAD_TOO_LARGE` (JSON body over 100 KB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` (a request body that is not `application/json`) |
| 409 | `OUT_OF_STOCK`, `INVALID_TRANSITION`, `PRICE_CHANGED`, `IDEMPOTENCY_CONFLICT`, `CONFLICT` (for example the last Owner, or an email that already has an account) |
| 422 | `COD_NOT_AVAILABLE`, `PIN_CODE_NOT_SERVICEABLE` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (no stack traces) |

## 3. Public storefront endpoints

### Catalogue and search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalogue/categories` | Published category tree. |
| GET | `/catalogue/collections` | Published collections. |
| GET | `/catalogue/collections/:slug` | Collection detail. |
| GET | `/catalogue/products` | Listing. Query: `category` (slug, includes child categories), `collection` (slug), `size` (label, repeatable), `colour` (slug, repeatable), `priceMin`, `priceMax` (paise), `inStock=true`, `sort` (`newest`, `price_asc`, `price_desc`, `relevance` with `q`), `limit` (≤ 48, default 24), `cursor`. Unknown parameters → 400. Returns `{ items, nextCursor, total, facets: { sizes, colours, categories, priceBands } }`; each facet counts products matching every other filter. |
| GET | `/catalogue/products/:slug` | Product detail with variants, per-variant `available` (capped display, see §6), images by colour. |
| GET | `/search` | `q`, plus the same filters. Full-text match (prefix on the last word) or a trigram name match for typos. 60 requests per minute per IP. |
| GET | `/search/suggest` | `q` (≥ 2 chars). Up to 6 suggestions: `{ products: [{ slug, name }], categories: [{ slug, name }] }`. 60 per minute per IP. |

### Content
| Method | Path | Description |
|--------|------|-------------|
| GET | `/content/home` | Published homepage blocks: announcement, hero slides, category pills, product rows, tabbed grid. Product rows are resolved to product summaries. |
| GET | `/content/navigation` | Header, pills and footer menus. |
| GET | `/content/pages/:slug` | Published page. `rehma-foundation` returns 404 until verified and published. |
| GET | `/content/settings/public` | WhatsApp number, contact details, COD availability flag. |

### Cart
| Method | Path | Description |
|--------|------|-------------|
| GET | `/cart` | Current cart, or an empty one; reading never creates a cart or cookie (D-149). Re-priced lines with `warning` (`UNAVAILABLE`, `SOLD_OUT`, `ONLY_N_LEFT`), `itemCount`, `subtotalPaise`, `readyForCheckout`. |
| POST | `/cart/items` | `{ variantId, quantity }`. Adds or increments; creates the cart and its `__Host-sp_cart` cookie on first use. `409 OUT_OF_STOCK` above free stock; `409 CONFLICT { reason: LINE_LIMIT, max: 10 }`; `409 CONFLICT { reason: UNAVAILABLE }` for unpublished or inactive items. |
| PATCH | `/cart/items/:variantId` | `{ quantity }`. 0 removes. |
| DELETE | `/cart/items/:variantId` | Remove line. |

### Checkout
| Method | Path | Description |
|--------|------|-------------|
| POST | `/checkout/quote` | `{ shippingAddress, deliveryMethod, paymentMethod }` → totals, COD eligibility, delivery estimate. No side effects. |
| POST | `/checkout/orders` | `{ contact, shippingAddress, billingAddress?, deliveryMethod, paymentMethod, expectedTotalPaise }`. Re-prices; returns `409 PRICE_CHANGED` if the total differs from `expectedTotalPaise`. Reserves stock and creates the order. COD → `PENDING_CONFIRMATION`. Prepaid → `PENDING_PAYMENT` and a payment session. |
| POST | `/checkout/orders/:orderNumber/payment` | Restart a payment session for a `PENDING_PAYMENT` order whose reservation is still active. |
| GET | `/checkout/orders/:orderNumber/status` | Requires the order access token returned at placement (guest) or the owning customer session. |

### Enquiries and events
| Method | Path | Description |
|--------|------|-------------|
| POST | `/enquiries` | `{ productId?, variantId?, name, email?, phone?, message, consentToContact: true, sourcePath, website?, elapsedMs? }` → `201 { received: true }`. Email or phone required. 5 per hour per IP, 3 per hour per email or phone. `website` is a honeypot; a filled honeypot or `elapsedMs` under 2000 gets the same answer but nothing is stored. |
| POST | `/events/whatsapp-click` | `{ productId?, variantId?, pagePath, sessionId }` (random per browser session, no personal data) → `204`. 60 per minute per IP. |

### Customer auth and account

**Deferred to a later release (D-034).** These endpoints are not built in release one.
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/customer/sign-up` | email, password, name, phone. |
| POST | `/auth/customer/sign-in` | Sets session cookie, merges guest cart. |
| POST | `/auth/customer/sign-out` | |
| POST | `/auth/customer/password-reset/request` | Always returns 202 (no account enumeration). |
| POST | `/auth/customer/password-reset/confirm` | token, new password. |
| GET | `/auth/csrf` | Issues CSRF token. |
| GET | `/account/me` · PATCH `/account/me` | Profile. |
| GET/POST/PATCH/DELETE | `/account/addresses[/:id]` | Addresses. |
| GET | `/account/orders` · `/account/orders/:orderNumber` | Own orders only. |
| GET/POST/DELETE | `/account/wishlist[/:productId]` | Wishlist. |

## 4. Admin endpoints

Role legend: O Owner, M Manager, C Catalogue editor, F Fulfilment.

| Method | Path | Roles |
|--------|------|-------|
| POST | `/admin/auth/sign-in` `{ email, password }` → `{ challenge, expiresAt }` (no session yet) | public, rate-limited |
| POST | `/admin/auth/mfa` `{ challenge, code }` or `{ challenge, recoveryCode }` → sets `__Host-sp_admin`, returns `{ admin, csrfToken }` | public, rate-limited |
| POST | `/admin/auth/sign-out` · GET `/admin/auth/me` (→ `{ admin, csrfToken }`) | all |
| POST | `/admin/auth/invites/inspect` · `/invites/enrol` (→ `{ otpauthUri, secret }`) · `/invites/accept` `{ token, name?, password, code }` (→ `{ recoveryCodes }`) | invite-link holder, rate-limited |
| POST | `/admin/staff/invites` `{ email, role }` · `/admin/staff/:id/reset` (→ `{ inviteUrl, expiresAt }`); PATCH `/admin/staff/:id` `{ role?, isActive? }` | O |
| GET | `/admin/dashboard` | O M C F (content tailored to role) |
| GET/POST | `/admin/products` | GET: O M C F · POST: O M C |
| GET/PATCH | `/admin/products/:id` | GET: all · PATCH: O M C (price fields: O M only) |
| POST | `/admin/products/:id/publish` · `/archive` | O M C. Publish returns `409 CONFLICT` with `details.reasons` (`CATEGORY_NOT_PUBLISHED`, `NO_ACTIVE_VARIANT`, `NO_PRIMARY_IMAGE`) until the product is ready |
| GET/POST/PATCH | `/admin/products/:id/variants[/:variantId]` | O M C (price: O M). Creating a variant sets its price, so POST needs O M |
| PUT | `/admin/products/:id/images` `{ images: [{ mediaAssetId, colourId?, alt, role }] }` (replaces the ordered list; one PRIMARY and one HOVER per colour) | O M C |
| GET/POST/PATCH/DELETE | `/admin/categories[/:id]` · `/admin/collections[/:id]` | O M C |
| PUT | `/admin/collections/:id/products` | O M C |
| GET | `/admin/inventory` (filters: lowStock, sku, product) | all |
| POST | `/admin/inventory/:variantId/adjustments` `{ delta, type?: RECEIVED \| ADJUSTMENT \| CORRECTION, reason }` → `409 CONFLICT { reason: BELOW_RESERVED \| NEGATIVE_ON_HAND }` when it would take stock below reserved or zero | O M F |
| PATCH | `/admin/inventory/:variantId` `{ lowStockThreshold }` (Phase 9, additive) | O M F |
| GET | `/admin/inventory/movements` | O M F |
| GET | `/admin/orders` (filters: status, method, date, needsAttention) | O M F |
| GET | `/admin/orders/:orderNumber` | O M F |
| POST | `/admin/orders/:orderNumber/transitions` `{ toStatus, note?, shipment? }` | O M F (cancel: O M) |
| POST | `/admin/orders/:orderNumber/notes` | O M F |
| POST | `/admin/orders/:orderNumber/refunds` | O M |
| GET/PATCH | `/admin/enquiries[/:id]` | O M |
| GET | `/admin/enquiries/whatsapp-clicks` | O M |
| GET/PUT | `/admin/content/blocks/:key` (draft) | O M C |
| POST | `/admin/content/blocks/:key/publish` · `/unpublish` (keys: D-145; PUT body `{ draft }`) | O M C |
| GET/POST/PATCH | `/admin/content/pages[/:slug]` | O M C (rehma-foundation: O M) |
| POST | `/admin/content/pages/:slug/publish` · `/unpublish` | O M C (rehma-foundation: O only, with `verified: true`; otherwise `409 VERIFICATION_REQUIRED`) |
| GET/PUT | `/admin/content/navigation/:menu` | O M C |
| POST | `/admin/media` (raw image body, `Content-Type: image/jpeg`, `image/png` or `image/webp`, at most 15 MB; optional `X-Filename` header, URL-encoded) → `201 { asset }` · GET `/admin/media` | O M C |
| GET/POST/PATCH | `/admin/colours[/:id]` · GET `/admin/sizes` (reference data) · GET/POST/PATCH `/admin/size-charts[/:id]` (Phase 8, additive) | GET: all · writes: O M C |
| GET/PUT | `/admin/settings/:group` (store, shipping, cod, payments) | O (store, shipping, cod also M) |
| GET/POST/PATCH | `/admin/staff[/:id]` | O |
| GET | `/admin/audit-log` | O |

## 5. Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/payments/:provider` | Raw body preserved for signature check. Verified, stored, deduplicated, processed. Always returns 200 after durable storage so the provider stops retrying; processing errors are handled internally. Disabled for `mock` in production. |

## 6. Product detail response (example shape)

```json
{
  "id": "…",
  "slug": "sample-kurta-a",
  "name": "Sample Kurta A",
  "fromPricePaise": 349900,
  "currency": "INR",
  "colours": [{ "id": "…", "name": "Ivory", "swatchHex": "#F3EEE3" }],
  "sizes": [{ "id": "…", "label": "M" }],
  "variants": [
    { "id": "…", "colourId": "…", "sizeId": "…", "sku": "TEST-KA-IV-M",
      "pricePaise": 349900, "compareAtPricePaise": null,
      "availability": "IN_STOCK" }
  ],
  "images": [{ "colourId": "…", "url": "…", "avifSrcset": "… 480w, … 960w", "webpSrcset": "…", "width": 1440, "height": 1800, "alt": "…", "role": "PRIMARY" }],
  "labels": ["NEW"]
}
```

`availability` is `IN_STOCK`, `LOW_STOCK` (with `"remaining": n` when n ≤ threshold, used for "Only 2 left" — real numbers only), or `SOLD_OUT`. Exact stock counts above the threshold are not exposed publicly.

## 7. Versioning

Breaking changes go to `/api/v2`. Additive fields are allowed within v1. Shared Zod schemas are the contract, and the API's OpenAPI document is generated from them for reference.
