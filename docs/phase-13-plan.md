# Phase 13 Plan — Browsing, Product Detail and Enquiries

Status: **Approved to start, 2026-10-26.** The Phase 12 gate is recorded as provisional (D-183) and the route is decided (D-179, `/shop/:slug`). Implementation in progress on `phase-12-landing`.

## 1. Scope (from the index)

From `MASTER-IMPLEMENTATION-INDEX.md` Phase 13:
- **Scope:** collection and category listings with filters and sorting, a product detail page with colour and size selection, size guide, enquiry form, WhatsApp links and click logging.
- **Deliverables:** storefront browsing routes; the `enquiries` module (public side).
- **Verification:** E2E-4 and the browsing steps of E2E-1, on desktop and mobile; the six gates in `design-system.md` §10.
- **Gate:** you review the tests and screenshots.

**Out of scope:**
- the admin enquiries inbox and staff notifications (Phase 16);
- checkout (Phase 15);
- accounts and wishlist (deferred, D-034);
- editorial or campaign pages and new homepage sections (OD-23).

## 2. Requirements

From `project-requirements.md` §3.1, §5 and UF-3 to UF-4, and `system-design.md` §9.

| Area | Requirement |
|------|-------------|
| Listings | Category and collection listings, plus New Ins and Shop all. Filters: size, colour, price band, category, in-stock only. Sort: newest, price low to high, price high to low. Cursor paging |
| Product detail | Gallery, price, colour and size selectors that reflect per-variant stock (public states only: `IN_STOCK`, `LOW_STOCK`, `SOLD_OUT`, D-082), size guide, fabric and care, delivery and returns summary, "Enquire" and "Ask on WhatsApp". Deep links `?colour=&size=` |
| Website enquiry | Name; phone or email (at least one); message; consent to be contacted; selected variant prefilled. Server-side validation, rate limit, honeypot (UF-3) |
| WhatsApp | `https://wa.me/<number>?text=…` with product name, SKU, chosen colour and size, and the URL; number from store settings; anonymous click log with no personal data (UF-4) |
| Design | `design-system.md` §6 components and §8 motion (filters: no animation beyond a 150 ms content crossfade). The "live thing" in §2 (colour choice changes the gallery and shifts the field one tone) is a design proposal, decided at this phase's review |

## 3. What already exists to reuse

**API** (`api-specification.md` §3, built in Phase 8, gate D-089):
- `GET /api/v1/catalogue/categories`, `/collections` and `/collections/:slug`;
- `GET /api/v1/catalogue/products`, with the listing filters, sort, `limit` and `cursor`;
- `GET /api/v1/catalogue/products/:slug` (detail: variants with availability, colours, sizes, images by colour, size chart, rich-text description);
- `GET /api/v1/search`, which shares the listing filters.

All of these are public, cached for 60 s, and return only visible products.

**Storefront:**
- `product/ProductCard.tsx` and `product/SizeSheet.tsx` (colour and size choice, add to bag);
- `ui/Picture.tsx` (derivatives only) and `ui/Sheet.tsx` (dialog);
- `cart/CartProvider.tsx`;
- `search/SearchPage.tsx`, whose results grid, sort and "Load more" are the model for listings;
- `lib/resource.ts`, `api/client.ts` and `shell/NotFound.tsx`, which already answers Phase 13 paths with "coming soon".

**Content:** size-guide and policy pages through `GET /api/v1/content/pages/:slug`.

**Missing:**
- an `enquiries` module and its tables (`Enquiry`, `WhatsAppClick`, `database-design.md` §6: Phase 13);
- `POST /enquiries` and `POST /events/whatsapp-click` (specified in `api-specification.md`, not built);
- the public settings endpoint `GET /content/settings/public` (specified, not found in the API code on 2026-10-26).

## 4. Route compatibility review (D-179, open)

| Source | Category route |
|--------|----------------|
| `project-requirements.md` §5 (baseline) | `/shop/:categorySlug`, `/collections/:collectionSlug`, `/shop`, `/new-in`, `/products/:productSlug` |
| Canonical code (Phase 11) | Search suggestions link categories to `/categories/:slug` (`search/SearchBox.tsx`, `hrefOf`); `NotFound` treats `/products`, `/categories`, `/collections`, `/shop` and `/new-in` as "coming soon" |
| CMS navigation and landing CTAs | The API resolves link targets to `/categories/:slug`, `/collections/:slug`, `/products/:slug` and `/pages/:slug` (`apps/api/src/modules/content/visibility.ts`, the `add(...)` calls; read 2026-10-26). A change of route therefore touches the API's link resolution as well as the storefront |
| D-179 (proposed) | `/shop/:slug` preferred, pending this review |

**Questions to settle before implementation:**
1. The API emits `/categories/…` today (above). Accepting D-179 means changing that resolution and the search links together. Entity links are stored by type and ID (`navigation_item.target_type` and `target_id` in `prisma/schema.prisma`; `ctaTarget` in `packages/shared/src/content/blocks.ts`), so they follow a route change automatically. Links of kind `URL` hold a literal path, and any that point at `/categories/…` would need editing or a redirect. Check the stored content for these before implementation.
2. Whether `/categories/:slug` should redirect to `/shop/:slug`, if D-179 is accepted, so that existing links keep working.
3. Content pages are at `/pages/:slug` (Phase 11), while the baseline lists `/about`, `/size-guide`, `/faq` and `/policies/*`. Should this be kept as is, or aliased?
4. Effects on the link-preview meta endpoint (Phase 17, OD-14).

**Decided 2026-10-26 (D-179):** `/shop/:slug`, with `/categories/:slug` redirecting to it.

## 5. Data and assets required

- **B-06:** real products with names, prices in paise, sizes and colours per variant, stock, descriptions, fabric and care, a size chart, and at least one photograph per colour with alt text.
- **OD-03:** the real category and sub-category list.
- **OD-16:** the WhatsApp number, and whether it is a Business account; business-hours text.
- **Policies:** the delivery and returns summary text (OD-08, OD-09). It is shown as "to be confirmed" until supplied, and never written by engineering.
- **Q11-5 and OD-13:** the Rehma or Rahma name, and the verified content. Needed only where pages link to it.

## 6. Dependencies

- **Phase 12 gate recorded** (your visual approval; B-03, B-04, B-06).
- **D-179 decided** (§4).
- **Your approval of the enquiries migration** (new tables; disposable databases only until then).
- **The canonical lock-file audit finding is cleared** (`body-parser` high), so that CI can pass. This needs a separate approval.

## 7. Tests and accessibility

- **Unit and component:** filter and sort state in the URL; variant availability; WhatsApp message encoding (`testing-strategy.md` §3, "Enquiries"); enquiry form validation.
- **Integration (database):** enquiry storage, rate limits and honeypot; click logging with no personal data; listing filters against seeded data.
- **End-to-end:** E2E-4 (enquiry and WhatsApp, mobile) and the browsing steps of E2E-1 (landing, pill, filter, product, add to bag), on desktop and mobile.
- **Accessibility:**
  - axe with the WCAG 2.0 to 2.2 A and AA tags at 1440, 768 and 390 px;
  - filters operable by keyboard, with result counts announced;
  - gallery and swatches keyboard-reachable;
  - focus returns after the size guide and enquiry dialogs;
  - reduced motion respected.
- **Performance:** Lighthouse on a listing and a product page, recorded against the Phase 17 budget (performance ≥ 85, accessibility ≥ 95). The budget is enforced at Phase 17.
- **Screenshots:** the listing, a filtered listing, and the product page (including the enquiry and size guide), at desktop and mobile.

## 8. Unresolved decisions and blockers

- **Blockers:** B-06, OD-03, OD-16, D-179; the enquiries migration approval; the audit finding.
- **Design choices for your review:**
  - filters as a side panel on desktop and a sheet on a phone;
  - the colour-led "live thing" (`design-system.md` §2);
  - the number of cards per row on listings (P12-9 chose fewer and larger cards for the landing rows).
- **Consent wording for enquiries:** it needs your lawyer's view under OD-12, since it collects personal data.

## 9. Stop points

Implementation starts only after:
1. the Phase 12 gate is recorded;
2. you approve this plan, with or without changes;
3. D-179 is decided;
4. the migration is approved before it is applied anywhere but a disposable database.
