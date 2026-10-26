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

## 10. Built and verified (2026-10-26)

**Gate status: pending your review** (index Phase 13: you review the tests and screenshots). Nothing here is a gate approval.

**What was built:**
- **Database:** migration `20261026120000_enquiries`: tables `enquiry` and `whatsapp_click`, enum `enquiry_status`, six CHECKs (consent, contact, `+91` phone, text lengths, source, page path) registered in `handwritten.ts`. Applied to disposable databases only.
- **Shared contract (`@sanea/shared`):** `enquirySchema`, `whatsAppClickSchema`, `sitePathSchema`, `whatsAppLink`, `PublicSettings`; internal links also allow `/shop`, `/shop/<slug>` and `/new-in` (D-179).
- **API:**
  - `POST /api/v1/enquiries` and `POST /api/v1/events/whatsapp-click` (`modules/enquiries/router.ts`), with the honeypot, the 2-second timing check, 5 enquiries per hour per IP, 60 clicks per minute per IP, the IP stored as an HMAC, and no personal data in clicks;
  - `GET /api/v1/content/settings/public` (the WhatsApp number from the store setting `contact.whatsapp`, or null);
  - category links resolve to `/shop/<slug>` (D-179); product detail colours carry their slug.
- **Storefront:**
  - listings at `/shop`, `/shop/:slug`, `/new-in` and `/collections/:slug`, with size, colour, price-band and in-stock filters and the sort in the URL, "Load more", a filter panel beside the grid on wide screens and in a sheet on phones, and a polite result count;
  - `/categories/:slug` redirects to `/shop/:slug`;
  - the product page at `/products/:slug`: gallery by colour, colour and size choice kept in `?colour=<slug>&size=<label>`, sold-out sizes disabled, low-stock note, size guide from the size chart, add to bag, rich-text details, fabric, fit and care;
  - the enquiry form in a sheet (product and variant prefilled, consent required, errors listed and tied to fields);
  - "Ask on WhatsApp" only when a number is set, with the product, colour, size, SKU and page URL, and an anonymous click log;
  - the "coming soon" page is gone: anything not public is "Page not found".

**Evidence (commands run in the `phase-12-landing` worktree, Node 24.11.0):**

| Check | Result |
|-------|--------|
| `npm run format:check`, `npm run lint` (ESLint and the token check), `npm run typecheck` | Pass |
| Taste lint on `apps/storefront/src` | 0 FAIL, 0 WARN |
| `npm test` | 42 files, 746 tests pass (new: shared enquiry tests, `browse/browse.test.tsx`) |
| `npm run test:integration` (disposable PostgreSQL 18) | 20 files, 412 tests pass; `[P13-GATE]` E13-1 to E13-9 |
| `npm run audit` | 0 vulnerabilities |
| Storefront and admin production builds | Pass |
| End-to-end, full suite, twice (installed Chromium in place of Edge; validation-only config) | 23 of 23 pass each run, including `e2e/browse-and-enquire.spec.ts` (E2E-1 browsing steps on desktop, E2E-4 on a phone) with axe at 1440, 768 and 390 px and no horizontal scroll |
| Lighthouse 13.5.0, listing and product page | Mobile: performance 95 and 94, accessibility 100, CLS 0. Desktop: performance 100, accessibility 100 |

Screenshots: `docs/reviews/browsing/2026-10-26/` (listing, collection, product, filter sheet, enquiry errors and confirmation).

**Limits and open items:**
- All data is synthetic; no product photographs exist (B-06), so the gallery shows empty wells and the gallery-by-colour switch was not exercised with pictures.
- The brand fonts could not be fetched here; screenshots use fallback fonts.
- The WhatsApp number has no admin screen yet: until Phase 16 it is set as the store setting `contact.whatsapp`. OD-16 (the real number) is open.
- Delivery and returns text is not shown: it waits for OD-08 and OD-09.
- The enquiry consent wording needs your lawyer's view (OD-12).
- Enquiries are stored but there is no admin inbox until Phase 16.
- Lighthouse SEO is 83 (no meta description or `robots.txt`): Phase 17.
- The design choices in §8 (filter panel layout, cards per row, the colour-led "live thing") are built in their simplest form for your review.
