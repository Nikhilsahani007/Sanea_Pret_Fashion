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

- JSON only. `Content-Type: application/json; charset=utf-8`. Request bodies limited to 100 KB. The one exception is the admin image upload `POST /admin/media`, which takes the raw image bytes (§4, D-079).
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
| 413 | `PAYLOAD_TOO_LARGE` (JSON body over 100 KB; image upload over 15 MB) |
| 415 | `UNSUPPORTED_MEDIA_TYPE` (a request body that is not `application/json`; on the image upload, a `Content-Type` other than `image/jpeg`, `image/png` or `image/webp`, or file bytes that are not one of those formats or do not match the declared type). The status and code are the same on every route; the `message` is route-specific: JSON routes keep the JSON message, and the image upload has an image-specific message |
| 409 | `OUT_OF_STOCK`, `CART_FULL` (a cart already has 30 distinct lines, D-099), `INVALID_TRANSITION`, `PRICE_CHANGED`, `IDEMPOTENCY_CONFLICT`, `CONFLICT` (for example the last Owner, or an email that already has an account) |
| 422 | `COD_NOT_AVAILABLE`, `PIN_CODE_NOT_SERVICEABLE` |
| 429 | `RATE_LIMITED` (sent by the rate-limit middleware with `Retry-After` and `RateLimit` headers), `UPLOAD_QUEUE_FULL` (admin image upload only: this API process already has one upload processing and its waiting capacity full, `MEDIA_UPLOAD_QUEUE_WAITING`, default 2; nothing is stored; **no `Retry-After` or `RateLimit` header**, because no reliable wait estimate exists. Sent by the upload queue, not the rate-limit middleware) |
| 500 | `INTERNAL_ERROR` (no stack traces) |
| 503 | `UPLOAD_QUEUE_TIMEOUT` (admin image upload only: the upload waited 30 s in the queue without starting; nothing is stored), `UPLOAD_PROCESSING_TIMEOUT` (admin image upload only: the 60 s deadline counted from admission, covering queue wait, body reception and processing, ran out; **the upload is not saved**, and output produced later is discarded. The response does not mean processing has already stopped). Both are sent only while the client is still connected |

## 3. Public storefront endpoints

### Catalogue and search

Public catalogue and search responses carry `Cache-Control: public, max-age=60` (Q8-5); admin responses carry `no-store`. Only products that are published, in a published category and with at least one active variant are visible.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/catalogue/categories` | Published category tree (`name`, `slug`, SEO fields, `children`). A published child of an unpublished parent is not shown. |
| GET | `/catalogue/collections` | Published collections inside their schedule (`startsAt` ≤ now < `endsAt`, each optional), with the hero image's derivatives. |
| GET | `/catalogue/collections/:slug` | Collection detail; `404` when not published or outside its schedule. Its products: `/catalogue/products?collection=<slug>`. |
| GET | `/catalogue/products` | Listing. Query: `category` (slug; includes published sub-categories), `collection` (slug), `size` or `size[]` (size labels, repeatable), `colour` or `colour[]` (colour slugs), `priceMin`, `priceMax` (paise), `inStock` (`true`), `sort` (`newest` default, `price_asc`, `price_desc`), `limit` (1 to 48, default 24), `cursor` (opaque). Size, colour, price and stock filters must all hold for the **same active variant**. Returns `{ items, facets, nextCursor }`: items are summaries (`slug`, `name`, `fromPricePaise`, `currency`, `labels`, `colours`, `soldOut`, `primaryImage`); facets (`sizes`, `colours`, `categories`, `priceBands`) count visible products before the variant filters. Price bands are fixed: under ₹1,000; ₹1,000 to ₹2,000; ₹2,000 to ₹3,000; ₹3,000 to ₹5,000; ₹5,000 and over. Unknown parameters, bad ranges and tampered cursors give `400`. |
| GET | `/catalogue/products/:slug` | Product detail (§6): active variants with availability, colours (`id`, `slug`, `name`, `swatchHex`; the slug since Phase 13, for `?colour=` deep links), sizes, images by colour (derivatives only), size chart, rich-text description. `404` unless the product is published, its category is published and it has an active variant. |
| GET | `/search` | `q` (2 to 100 characters), plus the listing filters. `sort` is `relevance` (default; full-text rank plus trigram similarity) or a listing sort. Typo-tolerant (`pg_trgm`). Published, visible products only. 60 requests per minute per IP, shared with suggestions. |
| GET | `/search/suggest` | `q` (2 to 100 characters). Up to 6 suggestions: up to 2 published categories, then products (`{ categories, products }`, each `slug` and `name`). |

### Content
| Method | Path | Description |
|--------|------|-------------|
| GET | `/content/home` | **Published** blocks only (D-093):<br>• `announcement` (`{ text, href }`, inside its active window, or null);<br>• `hero.slides` (derivative images; a slide whose target is not public is omitted);<br>• `newIns`, `row2` (`{ title, items }`, items as catalogue summaries of **visible** products only);<br>• `tabbedGrid.tabs`.<br>Dates use the database clock. The editorial band is not served until OD-23. Category pills are a navigation menu. `public, max-age=60` |
| GET | `/content/navigation` | `{ menus: { HEADER, CATEGORY_PILLS, FOOTER_SHOP, FOOTER_HELP, FOOTER_ABOUT: [{ label, href }] }, footer: { contact, social } | null }`. A link appears only while its target is public: a published category, a scheduled published collection, a visible product, or a published (and, if required, verified) page. `public, max-age=60` |
| GET | `/content/pages/:slug` | `{ slug, title, seoTitle, seoDescription, body }` for a `PUBLISHED` page; a page that requires verification must also be verified. Image nodes become `{ type: "image", image: { url, width, height, alt, sources }, caption }`. Otherwise **404, identical to an unknown slug, with `no-store`**; this includes `rehma-foundation` until the Owner verifies and publishes it. `public, max-age=60` |
| GET | `/content/settings/public` | Phase 13: `{ whatsApp: { number, hours } | null }` from the store setting `contact.whatsapp` (`number` normalised to `+91…`; null until the Owner sets a valid one, OD-16). Contact details and the COD flag are added with their phases. `public, max-age=60` |

### Cart
| Method | Path | Description |
|--------|------|-------------|
| GET | `/cart` | `{ lines, subtotalPaise, currency, itemCount, warnings }`, `no-store`. **Never creates a cart or sets a cookie (D-099):** with no valid `__Host-sp_cart` cookie it returns the empty cart. Every read re-prices from current variant prices; each line has `variantId`, `productSlug`, `productName`, `colour` (`name`, `swatchHex`), `size`, `quantity`, `available` (true while on sale), `unitPricePaise`, `lineTotalPaise`, `stock` and `image` (derivatives only). `stock` is the catalogue's public state (D-135, amending D-099): `IN_STOCK`, `LOW_STOCK` with `remaining` (only at or below the low-stock level) or `SOLD_OUT` (D-082 as amended by Q8-2); no exact count above the low-stock level, so the cart exposes no more stock than the product page. `warnings: [{ variantId, code }]` with `QUANTITY_LIMIT`, `EXCEEDS_AVAILABLE` or `UNAVAILABLE`. A line that is not on sale has `available: false`, `unitPricePaise`, `lineTotalPaise`, `stock` and `image` null, and is left out of the subtotal; `itemCount` counts every line's units. Reading does not renew the cookie. |
| POST | `/cart/items` | `{ variantId, quantity }` (strict; 1 to the line limit). Adds or increments; a total above the line limit is capped at the limit and the response carries a `QUANTITY_LIMIT` warning for that line. **The first successful add creates the cart and sets `__Host-sp_cart`** (D-099). `404` for an unknown, inactive or not-visible variant (no cart is created). `409 CART_FULL` for a 31st distinct line. Returns the whole cart |
| PATCH | `/cart/items/:variantId` | `{ quantity }` (strict; 0 to the line limit); 0 removes. `404` if the cart or line does not exist. Returns the whole cart |
| DELETE | `/cart/items/:variantId` | Removes the line; `404` if the cart or line does not exist. Returns the whole cart |

Cart rules (D-099, `system-design.md` §3):
- **Token:** 256 random bits in cookie `__Host-sp_cart` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, `Max-Age` 30 days, renewed by each successful write). Only its SHA-256 hash is stored. An unknown, malformed or expired token is treated as no cart, without saying which.
- **Writes** need the CSRF token (`X-CSRF-Token`) and an allow-listed storefront Origin. Prices and totals are never accepted from the client (strict schemas).
- **Limits:** line quantity 1 to `CART_MAX_LINE_QUANTITY` (1 to 10, default 10; the database CHECK holds 10); at most 30 distinct lines; cart writes 60 per minute per IP (`429 RATE_LIMITED`).
- **Stock:** adding reserves nothing (SR-2); a quantity above availability is kept with a warning, and checkout refuses it.
- **Expiry:** carts expire 30 days after the last write; an hourly job deletes expired carts.

### Checkout
Phase 15 (`phase-15-plan.md`; D-186). Guest only (D-034). Every response is `no-store`. Writes need the CSRF token and the storefront Origin; 20 writes and 120 reads per minute per IP.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/checkout/quote` | `{ shippingAddress?, deliveryMethod?, paymentMethod? }` (`checkoutQuoteSchema`). Re-prices the bag: `{ cart, subtotalPaise, discountPaise, shippingPaise, codFeePaise, taxPaise, totalPaise, currency, cod: { available } or { available: false, reason }, deliveryEstimate, paymentMethods: { PREPAID, COD } }`. No side effects. `reason` is `COD_DISABLED`, `OVER_LIMIT`, `PIN_CODE_EXCLUDED` or `REFUSAL_LIMIT`. `taxPaise` is the GST contained in the prices from effective GST rules; 0 while none are entered (B-14). |
| POST | `/checkout/orders` | Header `Idempotency-Key` (a UUID, required). Body `{ contact, shippingAddress, billingAddress?, deliveryMethod, paymentMethod, expectedTotalPaise, notes? }` (`placeOrderSchema`, strict). Re-prices and returns `409 PRICE_CHANGED` with `{ totalPaise }` if the total differs; `409 CART_NOT_READY` for an empty bag or a line not on sale; `409 OUT_OF_STOCK` with each line's availability; `422 COD_NOT_AVAILABLE` with the reason; `422 PAYMENT_METHOD_UNAVAILABLE` for prepaid with no provider. One transaction reserves every line and creates the order, its items, its first status event and its payment, then empties the bag. COD → `PENDING_CONFIRMATION` (stock allocated at once); prepaid → `PENDING_PAYMENT` with a hold of `RESERVATION_TTL_MINUTES` and a payment session. `201 { order, payment, accessToken }`; a replay with the same key and body returns `200` with the same order and token; the same key with a different body is `409 IDEMPOTENCY_CONFLICT`. |
| GET | `/checkout/orders/:orderNumber/status` | Header `X-Order-Token` (the `accessToken`). `{ order, payment }`; a wrong or missing token is `404`, the same as an unknown order. Since Phase 16 `order.shipment` is the latest `{ courierName, trackingNumber, trackingUrl, shippedAt, deliveredAt }` or null. |
| POST | `/checkout/orders/:orderNumber/payment` | Headers `Idempotency-Key`, `X-Order-Token`. A new payment session for a `PENDING_PAYMENT` order whose hold is live; an open session is returned as it is. Otherwise `409 INVALID_TRANSITION`. |
| POST | `/checkout/mock/:providerPaymentId` | **Development and tests only**, mounted only with the mock provider (refused in production, D-107). Header `X-Order-Token`; body `{ outcome: "success" \| "failure" \| "timeout" }`. Sends the signed webhook the mock "gateway" would send; the browser return confirms nothing. |

### Payment webhooks
| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/payments/:provider` | No CSRF, cookies or Origin: the provider's signature (HMAC over the raw body, header `X-Mock-Signature` for the mock) is the only proof; an invalid one is `400 WEBHOOK_INVALID` and nothing is stored. Each event is stored raw once per provider event ID, then applied in one transaction with the order locked: captured → `CONFIRMED` (stock allocated); failed → the payment `FAILED`, the order waits for a retry; amount or currency mismatch → the order is flagged `AMOUNT_MISMATCH`; paid after cancellation or after the stock was sold → a refund record and a flag (SR-10). `200 { received: true }`. An unknown provider is `404`. |

### Enquiries and events
| Method | Path | Description |
|--------|------|-------------|
| POST | `/enquiries` | `{ productId?, variantId?, name, email?, phone?, message, consentToContact: true, sourcePath, website?, elapsedMs? }` (strict; `enquirySchema` in `@sanea/shared`). An email or an Indian mobile is required; the message is 10 to 2,000 characters. `website` is a honeypot and `elapsedMs` the time the form was open: a filled honeypot or under 2 s gets the same `201 { received: true }` and nothing is stored. A product or variant is linked only if it exists, is published and belongs together. The IP is stored as an HMAC. CSRF required. 5 per hour per IP (`429 RATE_LIMITED`). `no-store` |
| POST | `/events/whatsapp-click` | `{ productId?, variantId?, pagePath, sessionId }` (strict; `sessionId` is a random per-browser-session UUID). No personal data is accepted or stored. `204`. CSRF required. 60 per minute per IP. `no-store` |

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
| GET | `/admin/dashboard` (Phase 16): counted from real rows. `orders` `{ today, todayValuePaise (cancellations excluded), pendingCodConfirmation, needsAttention, toDispatch (confirmed or packed) }` for O M F; `lowStockVariants` (the `low_stock_variant` view) for all; `openEnquiries` (not closed) for O M. A figure the role may not use is left out | O M C F (content tailored to role) |
| GET/POST | `/admin/products` | GET: O M C F · POST: O M C |
| GET/PATCH | `/admin/products/:id` | GET: all · PATCH: O M C (price fields: O M only) |
| POST | `/admin/products/:id/publish` · `/archive` | O M C |
| GET/POST/PATCH | `/admin/products/:id/variants[/:variantId]` | GET: all · POST: O M (a variant needs a price, Q8-4) · PATCH: O M C (price fields `pricePaise`, `compareAtPricePaise`: O M only; a request from C that contains them is refused whole with `403 FORBIDDEN`) |
| GET/POST/PATCH/DELETE | `/admin/categories[/:id]` · `/admin/collections[/:id]` | O M C |
| GET/POST/PATCH | `/admin/colours[/:id]` · `/admin/size-charts[/:id]` (Q8-3) | O M C |
| GET | `/admin/sizes`: the six approved sizes (D-029) in order, `{ items: [{ id, label, position }] }`. Read only; sizes are migration reference data. Added for the admin variant form (`phase-8-ui-plan.md` §10) | O M C |
| GET | `/admin/collections/:id` (with its product order) | O M C |
| POST · PATCH/DELETE | `/admin/products/:id/images` · `/admin/products/:id/images/:imageId` (`mediaAssetId`, `colourId?`, `alt`, `role`, `position`) | O M C |
| PUT | `/admin/collections/:id/products` | O M C |
| GET | `/admin/inventory`. Query: `lowStock=true` (read through the `low_stock_variant` view), `sku` (prefix, case-insensitive), `productId`, `limit` (1 to 100, default 50), `cursor` (the last SKU). Ordered by SKU. Returns `{ items, nextCursor }`. Each item: `variantId`, `sku`, `productId`, `productName`, `productStatus`, `colour`, `size`, `isActive`, `onHand`, `reserved`, `available` (on hand − reserved), `lowStockThreshold`, `lowStock` (active and available ≤ threshold) | all |
| POST | `/admin/inventory/:variantId/adjustments` `{ type, delta, reason? }` (Q9-2):<br>• `type`: `RECEIVED` (`delta` > 0; reason optional), `ADJUSTMENT` or `CORRECTION` (reason 3 to 200 characters required).<br>• `delta`: a non-zero integer from −10 000 to 10 000.<br>On hand never goes below reserved: `409 CONFLICT` with `details: [{ code: "STOCK_BELOW_RESERVED", onHand, reserved }]` (SR-12).<br>`201` with `{ onHand, reserved, lowStockThreshold }`.<br>One movement (actor, reference `ADMIN`) and one audit row; the reason is not copied to the audit log | O M F |
| PATCH | `/admin/inventory/:variantId` `{ lowStockThreshold: 0..1000 }` (Q9-4). Audited; no movement | O M F |
| GET | `/admin/inventory/movements`. Query: `variantId`, `type`, `from`, `to` (ISO with offset; `to` after `from`), `limit`, `cursor` (movement id). Newest first. Each item: `id`, `variantId`, `sku`, `type`, `onHandDelta`, `reservedDelta`, `reason`, `referenceType`, `actorName` (never an email), `createdAt` | O M F |
| GET | `/admin/orders` (Phase 16). Query: `status`, `method` (`PREPAID`, `COD`), `needsAttention=true`, `q` (2 to 100 characters: order number, email or phone), `from`, `to` (dates, India time, inclusive), `before` (order id), `limit` (1 to 100, default 25). Newest first. `{ orders, nextBefore }`; each: `id`, `orderNumber`, `status`, `paymentMethod`, `totalPaise`, `itemCount`, `customerName`, `city`, `needsAttention`, `attentionReason`, `placedAt` | O M F |
| GET | `/admin/orders/:orderNumber`: `{ order, nextStatuses }`. The order with items (and units restocked), history (`actorName`, `reason`, `note`), payments with refunds, shipments, internal notes. `nextStatuses`: the moves this role may make now | O M F |
| POST | `/admin/orders/:orderNumber/transitions` `{ toStatus, note? (≤ 500), reason?, shipment? }`.<br>• `SHIPPED` needs `shipment { courierName, trackingNumber, trackingUrl? (https) }`.<br>• `CANCELLED` needs `reason`, one of the staff codes in `STAFF_CANCEL_REASONS` (D-181; the list is proposed); `OTHER` needs a note. A reason on any other move is `400`.<br>• A move that does not exist from the current status: `409 INVALID_TRANSITION`. A listed move the role's permission does not cover: `403` (declining an unconfirmed COD order needs `orders.declineCod`; cancelling a confirmed or packed one `orders.cancelRefund`).<br>• Cancelling a captured online payment records a pending refund.<br>Audited with the status and reason code only; the email that follows the change is recorded in `notification` | O M F (cancel: see D-181) |
| POST | `/admin/orders/:orderNumber/notes` `{ body (1 to 2000) }` → `201`. Append-only; audited without the text | O M F |
| POST | `/admin/orders/:orderNumber/refunds` `{ amountPaise, reason }` → `201`. Never more than was paid and not yet refunded: `409` with `details.reason` `OVER_REFUND` (and `refundablePaise`) or `NOTHING_PAID`. Paid outside the system in release one (UF-7) | O M |
| POST | `/admin/orders/:orderNumber/refunds/:refundId/complete` `{ outcome: REFUNDED or FAILED, reference? }`. The payment status follows; `409 ALREADY_COMPLETED` the second time | O M |
| POST | `/admin/orders/:orderNumber/restock` `{ lines: [{ itemId, quantity }] }` (SR-13): only for `RETURN_TO_ORIGIN` (O M F) or `RETURNED` (O M); never more than was sent (`409 OVER_RESTOCK`). One `RESTOCKED` movement per line | O M F |
| GET | `/admin/orders/:orderNumber/packing-slip`: ship-to, phone, items (SKU, name, variant, quantity), payment method and the COD amount to collect; no prices (not a GST invoice, B-14) | O M F |
| GET | `/admin/enquiries`. Query: `status` (`NEW`, `IN_PROGRESS`, `CLOSED`), `before`, `limit`. `{ enquiries, nextBefore }` | O M |
| PATCH | `/admin/enquiries/:id` `{ status?, assignedAdminId? (an active Owner or Manager, or null) }`. Audited without the content | O M |
| GET | `/admin/enquiries/assignees` (active Owners and Managers) · `/admin/enquiries/whatsapp-clicks?days=1..90` (anonymous taps per product) | O M |
| GET | `/admin/content/blocks`: every registry key (`site.announcement`, `home.hero`, `home.newIns`, `home.row2`, `home.tabbedGrid`, `home.editorial`, `site.footer`; Q10-1) with `draft`, `published`, `publishedAt`, `unpublishedChanges` | O M C |
| GET/PUT | `/admin/content/blocks/:key` (draft). The payload is validated by the shared schema for the key (`@sanea/shared` `CONTENT_BLOCKS`); referenced media and targets must exist (`400 TARGET_NOT_FOUND` at the field). An unknown key returns 404 | O M C |
| POST | `/admin/content/blocks/:key/publish`, `/unpublish`, `/discard` (Q10-5).<br>• Publish validates the draft again: `409` with `TARGET_NOT_FOUND`, or `NOTHING_TO_PUBLISH`.<br>• Discard copies `published` to `draft` (`409 NOTHING_PUBLISHED` without one) | O M C |
| GET/POST | `/admin/content/pages`: create `{ slug, title, seoTitle?, seoDescription? }`; the slug is **fixed** after creation | O M C |
| GET/PATCH | `/admin/content/pages/:slug` `{ title?, draftBody? (page rich text with image nodes, Q10-6), seoTitle?, seoDescription? }`. The slug and `requiresVerification` are not editable (400). The response has `draftVersion` | O M C (pages requiring verification: O M) |
| POST | `/admin/content/pages/:slug/publish` (`409 PAGE_EMPTY` for an empty body), `/unpublish` (status `ARCHIVED`), `/discard`. For a page requiring verification, publish needs `{ verified: true, draftVersion }`:<br>• a different version gives `409 DRAFT_CHANGED` (Q10-8);<br>• verifier and time are recorded;<br>• audited as `content.page_verified_published`, with the body hash | O M C (pages requiring verification: publish and unpublish O only) |
| GET/PUT | `/admin/content/navigation/:menu`: an allow-listed menu, replaced whole. `items: [{ label, target }]`, where the target is an entity or an internal `URL` path. GET adds `href` and `hidden` (target not public) | O M C |
| POST | `/admin/media`: the raw image bytes as the request body, not multipart (D-079). `Content-Type` must be `image/jpeg`, `image/png` or `image/webp`; at most 15 MB; the file's own bytes must match (D-078). Processed before the response: re-encoded without metadata, AVIF and WebP at 480, 960, 1440 and 2048 px (D-077, Q8-11). Optional header `X-Upload-Filename`: a display name, sanitised and stored; never logged and never used in paths. Returns the media asset with its derivative URLs. One upload is processed at a time per API process, and up to `MEDIA_UPLOAD_QUEUE_WAITING` (default 2) wait. Outcomes: `429 UPLOAD_QUEUE_FULL` when the queue is full; `503 UPLOAD_QUEUE_TIMEOUT` after 30 s of waiting; `503 UPLOAD_PROCESSING_TIMEOUT` when 60 s from admission pass, with nothing saved; `413 PAYLOAD_TOO_LARGE` for a declared or streamed body over 15 MB, including chunked bodies; `415 UNSUPPORTED_MEDIA_TYPE` with an image-specific message. Node's 300 s server request timeout is separate and unchanged. Phase 8 queue policy (D-088; values approved 2026-10-21; `MEDIA_UPLOAD_QUEUE_WAITING` 0 to 4, per process; `phase-8-plan.md` §5.7). · GET `/admin/media` | O M C |
| GET/PUT | `/admin/settings/shipping` `{ flatFeePaise, freeShippingThresholdPaise, deliveryEstimate }` · `/admin/settings/cod` `{ enabled, maxOrderPaise, feePaise, excludedPinPrefixes, refusalLimit, confirmWithinHours }` (Phase 16; the same schemas checkout reads, D-186). Audited with the values (no personal data) | O M |
| GET/PUT/DELETE | `/admin/settings/whatsapp` `{ number (Indian mobile), hours? }` (OD-16). DELETE removes the number, and the storefront then shows no WhatsApp link | O M |
| GET/PUT | `/admin/settings/:group` (store, payments): later phases | O (store also M) |
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
  "images": [{ "colourId": "…", "url": "…", "width": 1440, "height": 1800, "alt": "…", "role": "PRIMARY" }],
  "labels": ["NEW"]
}
```

`availability` is `IN_STOCK`, `LOW_STOCK` or `SOLD_OUT` (D-082 as amended by Q8-2). Available means on hand minus reserved. `LOW_STOCK` applies when 0 < available ≤ the variant's `lowStockThreshold`, and only then is `"remaining": n` included, for "Only 2 left" (real numbers only). `IN_STOCK` and `SOLD_OUT` never carry a count, so exact stock above the threshold is not exposed publicly.

`labels` come from an allow-list; in release one it contains only `NEW` (Q8-8). Image `url`s point only to public derivatives; originals are never exposed (Phase 8 safeguard 1). `description` is structured rich text: no HTML, and links only to allowed internal paths (Q8-10, Phase 8 safeguard 2). Its text nodes store their words as a string under the key `text` (R2).

## 7. Versioning

Breaking changes go to `/api/v2`. Additive fields are allowed within v1. Shared Zod schemas are the contract, and the API's OpenAPI document is generated from them for reference.
