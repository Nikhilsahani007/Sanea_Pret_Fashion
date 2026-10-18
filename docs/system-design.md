# Sanéa Pret — System Design

Status: Draft for approval · Date: 2026-10-18

This document describes how the core business processes behave: stock, cart, checkout, orders, payments, content and enquiries.

## 1. Catalogue model in brief

- A **Product** is a design (e.g. one kurta style). It has a name, slug, descriptions, fabric, care, category, collections, SEO fields and a publish state (`DRAFT`, `PUBLISHED`, `ARCHIVED`).
- A **Variant** is one sellable unit: product × colour × size. It has its own SKU, price, optional compare-at price and stock.
- **Images** belong to a product and optionally to a colour, so choosing "Ivory" swaps the gallery.
- Price lives on the variant. A product-level "from" price is derived as the lowest active variant price.
- A product is visible on the storefront only when it is `PUBLISHED` and has at least one active variant.

## 2. Inventory model

Each variant has one `InventoryLevel` row:

| Field | Meaning |
|-------|---------|
| `onHand` | Physical units in stock, not yet shipped. |
| `reserved` | Units held by active checkout reservations or unshipped orders. |
| `available` | Derived: `onHand − reserved`. Never stored separately. |
| `lowStockThreshold` | Per-variant alert level. |
| `version` | Optimistic concurrency counter. |

Database constraints enforce `onHand ≥ 0`, `reserved ≥ 0` and `reserved ≤ onHand`. These checks are the final guard against overselling, even if application code has a bug.

### 2.1 Stock rules

| # | Rule |
|---|------|
| SR-1 | Stock is tracked per variant only. A product has no stock of its own. |
| SR-2 | Adding to cart does **not** reserve stock. The cart shows live availability and warns when a line exceeds it. |
| SR-3 | Starting prepaid payment creates a `StockReservation` for each line with a 15-minute expiry (configurable). |
| SR-4 | A reservation succeeds only if `available ≥ quantity` at that instant, checked and written atomically. |
| SR-5 | COD order placement reserves stock immediately and atomically, then the order is created in the same transaction. |
| SR-6 | When a prepaid payment is confirmed, its reservations convert to order allocations. `reserved` stays until dispatch. |
| SR-7 | On dispatch (`SHIPPED`), `onHand` and `reserved` both decrease by the shipped quantity. |
| SR-8 | On cancellation before dispatch, `reserved` decreases and the units become available again. |
| SR-9 | Expired reservations are released by a job every minute and also lazily on read. |
| SR-10 | A payment success that arrives after its reservation expired re-attempts the reservation. If stock is gone, the order is flagged `NEEDS_ATTENTION` and an automatic refund record is created. The customer is never told the order is confirmed unless stock is held. |
| SR-11 | Every change to `onHand` or `reserved` writes a `StockMovement` row with type, quantity, reason, actor and reference (order, reservation or adjustment). |
| SR-12 | Admin adjustments cannot push `onHand` below `reserved`. The admin sees how many units are committed to orders. |
| SR-13 | Returns that pass inspection are restocked by an explicit admin action, not automatically. |
| SR-14 | Archived or inactive variants cannot be reserved. |

### 2.2 Atomic reservation

Reservation uses a conditional update so two shoppers cannot take the last unit:

```sql
UPDATE "InventoryLevel"
SET reserved = reserved + $qty, version = version + 1
WHERE "variantId" = $variantId
  AND "onHand" - reserved >= $qty;
-- 0 rows updated ⇒ OUT_OF_STOCK for that line
```

All lines of a cart are reserved in one transaction, locking variant rows in a consistent order (sorted by variant ID) to avoid deadlocks. If any line fails, the whole transaction rolls back and the response lists each line's real availability.

## 3. Cart

- A cart has a random 256-bit token stored in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. Customers' carts are linked to their account and merged on sign-in (quantities summed, capped at availability).
- Cart lines store variant ID and quantity only. Prices are never taken from the client. Every cart read re-prices from current variant prices.
- Per-line quantity limit: 10 by default (configurable) to limit hoarding.
- Carts expire after 30 days of inactivity.

## 4. Checkout

### 4.1 Steps
1. **Contact:** email and Indian mobile number (+91, 10 digits starting 6–9).
2. **Shipping address:** name, address lines, city, state (fixed list), 6-digit PIN code. Billing address equals shipping by default.
3. **Delivery method:** from shipping rules (e.g. standard). Shipping fee is computed by the server.
4. **Payment method:** "Pay online" or "Cash on delivery". COD shown only when eligible.
5. **Review and place order.**

### 4.2 Server-side pricing
`subtotal = Σ(variant price × qty)` → minus automatic discount (if any rule is active) → plus shipping fee → plus COD fee (if any) = `total`. Tax display follows OD-05 (default: prices are GST-inclusive, and the invoice shows the GST component). All sums use integer paise.

### 4.3 COD eligibility (configurable defaults)
- Order total between ₹0 and a maximum (default ₹15,000; see OD-07).
- PIN code serviceable for COD (list or rule; default: all valid Indian PIN codes until a courier list exists).
- Customer not flagged for repeated COD refusals.
- Optional COD fee (default ₹0).

### 4.4 Order placement sequence

**Prepaid**

```
Client                     API                                  DB / Provider
  │ POST /checkout/orders   │                                      │
  │ (Idempotency-Key)       │ validate, re-price, check rules      │
  │────────────────────────▶│ BEGIN                                │
  │                         │  reserve all lines (atomic)          │
  │                         │  create Order PENDING_PAYMENT        │
  │                         │  create Payment CREATED              │
  │                         │ COMMIT                               │
  │                         │ provider.createPayment() ───────────▶│
  │◀── payment session ─────│                                      │
  │ customer pays on provider page / SDK                           │
  │                         │◀──── webhook payment.succeeded ──────│
  │                         │ verify signature, dedupe event       │
  │                         │ BEGIN                                │
  │                         │  Payment CAPTURED                    │
  │                         │  Order CONFIRMED, reservations→order │
  │                         │ COMMIT; enqueue confirmation email   │
  │ GET /orders/:no (poll)  │                                      │
  │◀── CONFIRMED ───────────│                                      │
```

The browser redirect after payment is only a hint. The order is confirmed by the verified webhook, or by a server-side status query to the provider.

**COD:** one transaction reserves stock and creates the order as `PENDING_CONFIRMATION` with a `Payment` of method `COD` and status `PENDING`.

## 5. Order lifecycle

```
                     ┌───────────────────┐
  prepaid ─────────▶ │  PENDING_PAYMENT  │ ── payment failed / expired ──▶ CANCELLED
                     └─────────┬─────────┘
                               │ payment captured
                               ▼
  COD ──▶ PENDING_CONFIRMATION ─── confirmed by staff ──▶ CONFIRMED ──▶ PACKED ──▶ SHIPPED ──▶ DELIVERED
                 │                                           │            │           │            │
                 └── not confirmed in window / refused ──▶ CANCELLED ◀───┴────────────┘            │
                                                                     (before dispatch)              │
                                                     SHIPPED ──▶ RETURN_TO_ORIGIN (COD refused)     │
                                                     DELIVERED ──▶ RETURN_REQUESTED ──▶ RETURNED ───┘
                                                     any ──▶ NEEDS_ATTENTION (exception flag, not a terminal state)
```

| Status | Stock effect | Who can move it |
|--------|--------------|-----------------|
| PENDING_PAYMENT | Reserved (with expiry) | System |
| PENDING_CONFIRMATION | Reserved | System (create), Manager/Owner/Fulfilment (confirm, cancel) |
| CONFIRMED | Reserved | System or staff |
| PACKED | Reserved | Fulfilment, Manager, Owner |
| SHIPPED | onHand and reserved decreased | Fulfilment, Manager, Owner |
| DELIVERED | None | Fulfilment, Manager, Owner |
| CANCELLED | Reservation released | System, Manager, Owner |
| RETURN_TO_ORIGIN | Restock on receipt (manual) | Fulfilment, Manager, Owner |
| RETURN_REQUESTED / RETURNED | Restock after inspection (manual) | Manager, Owner |

Every transition is validated against an allowed-transitions table in the orders service and written to `OrderStatusEvent` with actor and timestamp. Invalid transitions return `409 INVALID_TRANSITION`.

## 6. Payment architecture

### 6.1 Provider abstraction

```ts
interface PaymentProvider {
  readonly name: 'mock' | 'razorpay' | 'cashfree' | 'payu';
  createPayment(input: { orderId: string; amountPaise: number; customer: {...}; idempotencyKey: string }):
    Promise<{ providerPaymentId: string; clientPayload: unknown }>;
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookEvent; // throws if invalid
  fetchStatus(providerPaymentId: string): Promise<PaymentStatus>;
  refund(input: { providerPaymentId: string; amountPaise: number; reason: string }): Promise<RefundResult>;
}
```

- R1 ships with `MockPaymentProvider`, which simulates success, failure and delay in development and tests. It refuses to load when `NODE_ENV=production`.
- Live providers are added later behind the same interface, after approval (OD-06).
- Card data never touches Sanéa Pret servers. The provider's hosted checkout or SDK collects it, keeping PCI DSS scope to SAQ A.

### 6.2 Payment states
`CREATED → AUTHORISED → CAPTURED`, or `FAILED`, or `EXPIRED`. Refunds: `REFUND_PENDING → REFUNDED`, or `REFUND_FAILED`. COD: `PENDING → COLLECTED`, or `NOT_COLLECTED`.

### 6.3 Safety rules
- Amount and currency in the webhook must equal the stored order total, or the event is rejected and the order flagged.
- Webhook events are stored raw (`PaymentEvent`) and processed idempotently by provider event ID.
- A reconciliation job queries the provider for payments stuck in `CREATED` beyond 30 minutes.

## 7. Content management

Editable storefront content is modelled as typed blocks, not free HTML:

| Block type | Fields |
|------------|--------|
| `announcement_bar` | text (≤ 90 chars), link, active dates |
| `hero_slide` | desktop image, mobile image, alt text, campaign line, CTA label, CTA target (collection/category/product/page), focal point, order, active dates |
| `category_pills` | ordered list of {label, target} |
| `product_row` | title, source (collection, category, newest, manual list), max items, layout |
| `tabbed_grid` | tabs: {label, source} |
| `editorial_band` | image(s), heading, short text, link |
| `footer` | link groups, contact, social links |

- Each block has `draft` and `published` JSON payloads validated by Zod schemas from `packages/shared`.
- Publishing copies draft to published and writes an audit entry. The storefront reads only published content, cached for 60 seconds and invalidated on publish.
- Pages (About, Rehma Foundation, policies) use structured rich text (headings, paragraphs, lists, links, images). Stored as JSON and rendered through an allow-listed renderer, never as raw HTML.

## 8. Search and filtering

- PostgreSQL full-text search (`tsvector` on name, description, category, collection, colour names) plus `pg_trgm` for typo tolerance and prefix suggestions.
- Facets computed from published, in-stock-aware variants: size, colour, category, price bands.
- Filter state is in the URL query string, so results are shareable and the back button works.
- Moving to a dedicated search engine (Meilisearch, OpenSearch) is deferred until the catalogue exceeds a few thousand products.

## 9. Enquiries

- Website enquiry: stored with product and variant reference, contact details, message, consent flag, source page, status. Rate-limited per IP and per phone or email.
- WhatsApp: the storefront builds `https://wa.me/<number>?text=<encoded message>` using the number from store settings. A click event (product, variant, timestamp, anonymous session ID) is logged with no personal data.
- Admin inbox lists both, with filters and status changes. Email notification to staff on new enquiry is planned for Phase 16 (master index).

## 10. Media

- Uploads accepted: JPEG, PNG, WebP up to 15 MB. File type checked by magic bytes, not extension.
- `sharp` strips metadata and produces AVIF and WebP at widths 480, 960, 1440, 2048.
- Original kept privately. Derivatives served publicly through the CDN.
- Alt text required before an image can be published.

## 11. Notifications

R1 transactional emails: order placed (COD), order confirmed, order shipped, order cancelled, password reset, staff invite. Provider abstraction like payments. A console/log provider in development. SMS and WhatsApp notifications are deferred.
