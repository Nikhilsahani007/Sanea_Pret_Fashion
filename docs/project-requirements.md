# Sanéa Pret — Project Requirements

Status: Draft for approval · Date: 2026-10-18

Sanéa Pret is a premium Indian women's eastern-wear (pret) ecommerce brand. Tagline: **Effortless Elegance**.

This document records the confirmed business rules, the first-release scope, the sitemap and the main user flows. Anything not confirmed is listed in `open-decisions.md` with a recommended safe default. Items marked **[Assumption]** are working assumptions, not business decisions.

---

## 1. Confirmed business rules

| # | Rule | Source |
|---|------|--------|
| BR-1 | Brand name is "Sanéa Pret" (with the acute é). | Kickoff brief |
| BR-2 | Tagline is "Effortless Elegance". | Kickoff brief |
| BR-3 | Initial market is India only. Shipping addresses must be Indian (6-digit PIN code, Indian state and union-territory list). | Kickoff brief |
| BR-4 | Currency is INR. Prices are stored as integer paise and displayed with Indian digit grouping, e.g. `₹1,299` and `₹1,29,999`. | Kickoff brief |
| BR-5 | Product catalogue with collections, categories, product detail pages, search and filtering. | Kickoff brief |
| BR-6 | Full checkout supporting prepaid and cash on delivery (COD). | Kickoff brief |
| BR-7 | Payment architecture is designed now. Live payment-gateway integration is deferred until explicitly approved. Until then a mock provider is used. | Kickoff brief |
| BR-8 | Inventory is tracked per product variant (size × colour). Overselling must be prevented. | Kickoff brief |
| BR-9 | Customers can send product enquiries through the website and through WhatsApp. | Kickoff brief |
| BR-10 | Admin dashboard manages products, pricing, descriptions, homepage and catalogue content, inventory and orders. | Kickoff brief |
| BR-11 | Appropriate storefront content is editable without code changes. | Kickoff brief |
| BR-12 | A Rehma Foundation page exists. No unverified charity, equity, donation or legal claims are published. | Kickoff brief |
| BR-13 | The landing page follows the composition and browsing rhythm of nishorama.com, adapted to Sanéa Pret branding, without copying code, logos, photographs or brand assets. | Mandatory reference addendum |
| BR-14 | No invented products, customer reviews, testimonials, press or business statistics are published. | Kickoff brief |

## 2. Users and roles

| Role | Description | Access summary |
|------|-------------|----------------|
| Visitor | Anonymous shopper. | Browse, search, filter, cart, guest checkout, enquiries. |
| Customer | Shopper with an account. | Visitor access plus order history, saved addresses, wishlist. |
| Admin: Owner | Business owner. | Everything, including staff, payment settings and Rehma Foundation publishing. |
| Admin: Manager | Operations lead. | Catalogue, content, inventory, orders, enquiries. No staff or payment settings. |
| Admin: Catalogue editor | Merchandiser or content editor. | Products, collections, content. Read-only inventory. No orders. |
| Admin: Fulfilment | Packing and dispatch staff. | Orders (view, fulfilment updates), inventory adjustments. No pricing. |

The permission matrix is in `security-design.md` §4.

## 3. First release (R1) scope

### 3.1 Storefront
- Landing page following the Nishorama-derived structure (§6 here and `design-system.md` §3).
- Collection and category listing pages with filters (size, colour, price band, category, in-stock only) and sort (newest, price low to high, price high to low).
- Search across product name, description, category, collection and colour, with typo tolerance (PostgreSQL trigram).
- Product detail page: gallery, price, colour and size selectors that reflect per-variant stock, size guide, fabric and care, delivery and returns summary, "Enquire" and "Ask on WhatsApp" actions.
- Cart, persisted for guests with a server-side cart token and merged on sign-in.
- Checkout: contact, shipping address, delivery method, payment method (prepaid or COD), review, confirmation.
- Order confirmation page and email.
- Customer account: sign up, sign in, order history, order detail, addresses, wishlist.
- Admin-editable content pages: About, Rehma Foundation, Size Guide, Shipping, Returns and Exchanges, Privacy, Terms, Contact, FAQ.
- WhatsApp click-to-chat links with a prefilled message containing product name, SKU, chosen variant and URL.

### 3.2 Admin
- Sign-in, role-based authorisation and audit logging.
- Products: create, edit, archive; variants (size × colour), SKU, price, compare-at price, images per colour, descriptions, fabric, care, SEO fields, publish state.
- Categories and collections: create, edit, order, assign products, publish state.
- Inventory: per-variant on-hand quantity, reserved quantity (read-only), adjustments with reasons, low-stock threshold, movement history.
- Orders: list, filter, detail, status transitions, COD confirmation, cancellation with stock release, internal notes, packing-slip print view.
- Homepage and content: hero slides, category pills, homepage product rows, announcement bar, content pages, footer links, WhatsApp number, contact details.
- Enquiries inbox: website enquiries and WhatsApp click logs, with status (new, in progress, closed).
- Settings: shipping rules, COD rules, tax display, store contact information.
- Dashboard: today's orders, pending COD confirmations, low-stock variants, open enquiries, all from real data.

### 3.3 Out of scope for R1
- Live payment-gateway capture (designed, not integrated, per BR-7).
- International shipping and multi-currency.
- Courier API integration. Tracking numbers are entered manually in R1.
- WhatsApp Business API automation. R1 uses click-to-chat only.
- Product reviews and ratings. Nothing is shown until real reviews exist.
- Loyalty, gift cards and discount codes beyond one optional automatic discount rule.
- Native mobile apps and marketplace sync.

## 4. Non-functional requirements

| Area | Requirement |
|------|-------------|
| Performance | Landing-page Largest Contentful Paint ≤ 2.5 s on a mid-range Android phone over 4G. Cumulative Layout Shift < 0.1. Interaction to Next Paint < 200 ms. |
| Mobile | Mobile-first. Core flows usable one-handed at 360 px width. Tap targets ≥ 44 × 44 px. |
| Accessibility | WCAG 2.2 AA for storefront and admin. The hero carousel has a pause control and stops on focus and under reduced motion. |
| Security | OWASP ASVS Level 2 as the target. See `security-design.md`. |
| Privacy | India's Digital Personal Data Protection Act 2023 obligations as applicable. Legal review before launch. |
| Availability | 99.5% monthly for the storefront in R1. |
| Data integrity | No order is created for stock that does not exist. Every stock change is recorded as a movement. Money is stored as integers. |
| Observability | Structured JSON logs with request IDs, error tracking, health endpoint. |
| SEO | Per-page titles, descriptions, Open Graph tags, canonical URLs, sitemap.xml and structured product data. The rendering approach is in `system-architecture.md` §6. |
| Browsers | Last two versions of Chrome, Safari, Firefox and Edge; Safari iOS 16+; Chrome Android. |

## 5. Sitemap

### Storefront

```
/                                    Landing page
/new-in                              New Ins listing
/collections                         All collections
/collections/:collectionSlug         Collection listing
/shop                                Shop all
/shop/:categorySlug                  Category listing
/products/:productSlug               Product detail (?colour=&size= deep links)
/search?q=                           Search results
/cart                                Cart (also a drawer)
/checkout                            Checkout
/checkout/confirmation/:orderNumber  Order confirmation
/account/sign-in                     Sign in
/account/sign-up                     Sign up
/account/forgot-password             Password reset
/account                             Account overview
/account/orders                      Order history
/account/orders/:orderNumber         Order detail
/account/addresses                   Saved addresses
/account/wishlist                    Wishlist
/rehma-foundation                    Rehma Foundation (verified content only)
/about                               About Sanéa Pret
/contact                             Contact and enquiry form
/size-guide                          Size guide
/faq                                 FAQ
/policies/shipping                   Shipping policy
/policies/returns                    Returns and exchanges policy
/policies/privacy                    Privacy policy
/policies/terms                      Terms of service
*                                    Not found
```

### Admin (separate app on its own origin)

```
/sign-in
/                                    Dashboard
/products  /products/new  /products/:id
/categories  /collections
/inventory  /inventory/movements
/orders  /orders/:orderNumber
/enquiries  /enquiries/:id
/content/homepage  /content/pages  /content/pages/:slug  /content/navigation
/media
/settings/store  /settings/shipping  /settings/payments  /settings/staff
/audit-log
```

The real category list (kurtas, co-ord sets, suits, dupattas and so on) is an open decision. The URL structure does not depend on it.

## 6. Landing page structure from the mandatory reference

The live nishorama.com landing page was inspected as text on 2026-10-18. The screen recording mentioned in the brief was **not found** in the repository. Motion timing, slide duration and hover behaviour are therefore unverified (see `open-decisions.md` OD-01).

| Order | Pattern observed on the reference | Sanéa Pret adaptation |
|-------|----------------------------------|-----------------------|
| 1 | Announcement bar with an offer message | Admin-editable announcement bar. Hidden when empty. Only real, approved offers. |
| 2 | Minimal header: logo, main links, search, account, cart | Wordmark, search, account, wishlist, cart with live count. Menu button on mobile. |
| 3 | Pill-shaped category navigation (Kurtis, Dresses, Sets, Tops, Bottoms, Collections) | Admin-editable category pills linking to real categories and collections. |
| 4 | Hero carousel of campaign banners with slide indicators; collection names act as CTAs | Full-bleed campaign hero with the oversized "SANÉA PRET" wordmark overlaid, a short campaign line and one CTA. Up to five admin-managed slides with indicators and a pause control. |
| 5 | "New Ins" row: front and back image, name, price, "Add" button | "New Ins" horizontal row directly below the hero: image, second image on hover, name, price, compact label, quick-add that opens a size picker. |
| 6 | Further themed product rows (Most Wanted, festive, curated) | Admin-composed product rows bound to collections. No "bestseller" label unless backed by order data. |
| 7 | Tabbed collection area (Restocked, Bottoms, Tops, Dresses) | Tabbed product grid bound to admin-chosen collections or categories. |
| 8 | Footer: social links, address, hours, policies, payment methods | Footer with full-width wordmark, contact, WhatsApp, policies, Rehma Foundation link and only the payment methods that are actually live. |

## 7. Key user flows

### UF-1 Browse to purchase, prepaid
1. Visitor lands on `/` and taps a category pill or the hero CTA.
2. On the listing page they filter (size M, colour Ivory) and sort by newest.
3. On the product page they choose a colour, then a size. Unavailable sizes are disabled and labelled "Sold out".
4. They add to bag. The cart drawer confirms the item and shows the subtotal.
5. Checkout collects email and phone, then a shipping address with PIN code validation, then delivery method, then "Pay online".
6. On review, the server re-prices the cart and re-checks stock. Stock is reserved for 15 minutes.
7. A payment session starts with the provider (mock in R1). On a verified success webhook, the order becomes `CONFIRMED` and the reservation is committed.
8. The customer sees the confirmation page and receives an email with the order number.

### UF-2 Cash on delivery
Steps 1 to 5 as UF-1, then:
6. "Cash on delivery" is offered only when the cart total and PIN code meet the COD rules.
7. On "Place order", the server atomically decrements stock and creates the order as `PENDING_CONFIRMATION`.
8. Admin confirms the order by phone or WhatsApp, moving it to `CONFIRMED`. Unconfirmed COD orders older than the configured window are cancelled and their stock released.

### UF-3 Website enquiry
1. On a product page the shopper taps "Enquire".
2. The form asks for name, phone or email (at least one), a message and consent to be contacted. The selected variant is prefilled.
3. The server validates, rate-limits and stores the enquiry. Admin sees it in the inbox.

### UF-4 WhatsApp enquiry
1. The shopper taps "Ask on WhatsApp".
2. A `wa.me` link opens with product name, SKU, chosen colour and size and the product URL prefilled.
3. The click is logged anonymously so admin can see enquiry interest per product. The conversation happens in WhatsApp.

### UF-5 Admin stock adjustment
1. A fulfilment user searches a SKU in Inventory.
2. They enter an adjustment, e.g. +12 with reason "Stock received".
3. The server writes a stock movement and updates on-hand quantity in one transaction, and records an audit entry.

### UF-6 Admin homepage edit
1. A catalogue editor opens Content → Homepage.
2. They reorder hero slides, upload a campaign image with alt text, and edit the CTA label and target.
3. They save a draft, preview it, then publish. The storefront reads only the published version.

### UF-7 Fulfilment
`CONFIRMED` → `PACKED` (packing slip printed) → `SHIPPED` (courier and tracking number entered, customer notified) → `DELIVERED`. For COD orders, cash collection is recorded at delivery.

### UF-8 Cancellation and returns
Admin cancels before dispatch, stock is released, and prepaid orders get a refund record (refund executed manually in R1). Returns after delivery follow the returns policy, which is an open decision.

## 8. Rehma Foundation page rules
- It is a CMS page with slug `rehma-foundation`, editable only by Owner or Manager.
- Initial content is a neutral placeholder saying information will be published soon.
- The development team writes no mission statement, figures, donation percentages, registration numbers, 80G tax-exemption claims, equity claims or partner names.
- Publishing the page requires the Owner to tick a "content verified" confirmation. The confirmation is recorded in the audit log.
- There is no donation or payment collection on this page in R1.

## 9. Content rules
- Development seed data is obviously fake ("Sample Kurta A", SKUs prefixed `TEST-`) and is never loaded into production.
- No invented reviews, ratings, testimonials, press logos, follower counts or customer statistics.
- "Bestseller" or "Trending" labels appear only when computed from real order data or set deliberately by an admin.
- Sample copy in design work is marked as sample and listed for replacement before launch.
