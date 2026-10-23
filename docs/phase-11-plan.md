# Phase 11 Plan — Storefront Shell, Search and Cart

Status: **Approved in principle on 2026-10-23 (D-098)**, with Q11-1 to Q11-4 and Q11-6 to Q11-11 as recommended, Q11-10 resolved to option A (§9), and the cart contract reconciled (D-099). **Q11-5 stays open.** The cart migration is a separate approval gate: it stops for your review before commit, and is applied only to disposable test databases until then. · Date: 2026-10-23 · Base: `phase-11-storefront` from `phase-10-content` at `4634762` (Phase 10 gate passed, D-095; draft PRs #6, #7 and #8 open and unmerged)

This plan covers Phase 11 of `MASTER-IMPLEMENTATION-INDEX.md`. It also records the logo you supplied and the proposed palette: both **approved in principle on 2026-10-23 (D-096)**, the palette as proposed implementation colours, not verified brand colours, with the admin palette unchanged. OD-15 is closed (D-097). Q11-5 stays open.

## 1. Scope (from the index)

**In scope:**
- **Storefront base styles** on the shared tokens (TD-002), with the proposed palette (§3.3, Q11-3).
- **Header:** logo, main links, search with suggestions, cart button with live count. Account and wishlist controls are not shown (D-034).
- **Search results page** (`/search?q=`).
- **Category pills** (navigation menu `CATEGORY_PILLS`).
- **Announcement bar** (published `site.announcement`).
- **Footer** (footer menus and the published `site.footer` block).
- **Cart API** (`cart` module) and **cart drawer** for guests, plus the `/cart` page.

**Depends on:**
- Phases 8, 9 and 10: passed (D-089, D-092, D-095).
- TD-001 and TD-002: decided (D-085, D-086): CSS Modules and shared custom-property tokens, no Tailwind.
- OD-02: the logo and palette approved in principle (D-096); a vector logo export is still needed before Phase 12 (B-04).

**Verification:**
- `design-system.md` §10 gates 1, 5 and 6 at 390, 768 and 1440 px;
- the cart tests pass.

**Gate:** your review of screenshots and test output.

**Out of scope:**
- **The landing page** (hero, monument wordmark, product rows, tabbed grid): Phase 12. In Phase 11, `/` shows the shell only (§4.3).
- **Listing pages and product detail** (`/shop`, `/collections`, `/products/:slug`): Phase 13.
- **Checkout, orders and stock reservation from the cart** (SR-2: adding to the cart reserves nothing): Phase 15.
- **Customer accounts, wishlist and cart merging:** deferred (D-034).
- **Store settings** (`/content/settings/public`): its own plan, before Phase 13.
- **Any brand claims or foundation text** from the Instagram caption (§3.5).

## 2. What already exists

| Area | State |
|------|-------|
| `apps/storefront` | Placeholder (`src/index.ts` only); no dependencies, no Vite, no routes |
| Tokens | `packages/shared/src/tokens/`: `brand.css` (primitives), `storefront.css` and `admin.css` (semantic layers with the same names), `fonts.css`. The check `scripts/check-design-tokens.mjs` refuses hard-coded values in the UI apps |
| Fonts | Panchang 700, Switzer 400 and 500, fetched by `npm run fonts:fetch` into git-ignored `apps/*/public/fonts/` (ITF FFL, `font-licences.md`) |
| Public API | Catalogue, search and suggestions (Phase 8); content home, navigation and pages (Phase 10) |
| CSRF | `GET /api/v1/auth/csrf` and the signed double-submit token (D-045) for every state-changing request |
| Cart tables | **Not created.** `database-design.md` §6 assigns `Cart` and `CartItem` to Phase 11 |
| e2e | Playwright with installed Edge, axe at three widths; admin only |

## 3. Brand inputs (OD-02, OD-15)

### 3.1 The logo as supplied

- **Source:** your screenshot of the Instagram post by `saneapret` (1773 × 898 PNG, SHA-256 `06f22c95addd4d37488c73aa52c088213e5f1a83f02dde7482b36e04c622a95c`), supplied on 2026-10-23. **The screenshot itself is not committed**; only the logo crop is.
- **Content:** "SANÉA" in black high-contrast serif capitals, with the acute accent on the É, and "EFFORTLESS ELEGANCE" in spaced serif capitals below. Black ink on a warm ivory ground measured at `#F9F5E9`.
- **The authoritative reference** is `docs/brand/logo-supplied-crop.png`: a lossless crop of the logo panel only (889 × 334 px, 24 px margin). It excludes the Instagram interface, the caption and the profile icon in the panel's corner.
- **Derived for review (not yet used by any app):**
  - `docs/brand/logo-lockup-transparent.png`: wordmark and tagline on transparency.
  - `docs/brand/logo-wordmark-transparent.png`: "SANÉA" only (889 × 236 px), for the header, where the tagline would be about 4 px tall and unreadable.
  - Method: alpha computed from each pixel's difference from the measured ground, with black ink. Recomposited over the ground, every pixel is within 10 of 255 levels of the source.

**Limitation:** the logo is a raster screenshot, about 840 px wide, with slightly soft edges under magnification. It is good enough for the header (about 120 to 200 CSS px wide, so up to 400 px at 2×) and the footer. It is **not good enough** for the landing page's monument wordmark (`clamp(64px, 13.5vw, 220px)` tall, roughly 1300 CSS px wide at 1440, so about 2600 px at 2×). **Requested:** a vector export (SVG or PDF) or a transparent PNG at least 3000 px wide, from whoever made the logo, before Phase 12. Q11-1.

**É check (OD-15):**
- In the logo, the accent is drawn and intact (`docs/brand/` crops).
- In the site fonts, É and é come from the font files themselves, not a fallback, in Panchang 700, Switzer 400 and Switzer 500. This was rendered in Edge and compared against two different fallbacks (`docs/brand/glyph-check-e-acute.png`). **OD-15 closed (D-097).**

### 3.2 What the logo changes in the design system

`design-system.md` (D-112) built the brand around a typeset "SANÉA PRET" in Panchang, a wide geometric sans, as the monument. The supplied logo differs in three ways:

| Point | `design-system.md` | Logo | Proposal |
|-------|--------------------|------|----------|
| Wordmark | Typeset in Panchang 700 | Drawn serif lettering | Use the logo image, never retype it (Q11-1) |
| Text | "SANÉA PRET" | "SANÉA" (and the tagline) | Show the logo as supplied; the accessible name and page titles stay "Sanéa Pret" (Q11-4) |
| Display face | Panchang for headings | A serif logo next to a wide sans would clash | In Phase 11, headings use Switzer; the display face is decided in Phase 12 (Q11-2) |

### 3.3 Proposed palette (implementation colours, not verified brand colours)

You have no official palette. These are **proposed** colours for implementation, recorded as such:

| Proposed primitive | Value | Role in the storefront layer |
|--------------------|-------|------------------------------|
| `--sp-ivory` | `#F8F4E9` warm ivory | `--sp-bg` page ground (the logo's own ground measures `#F9F5E9`) |
| `--sp-soft-black` | `#111111` | `--sp-ink` text, header, active pill |
| `--sp-champagne` | `#D8C3B5` muted champagne | `--sp-surface` pills at rest, image wells |
| `--sp-aubergine-deep` | `#654653` deep aubergine | `--sp-accent` primary buttons, links, focus ring; `--sp-field-1` footer ground |
| `--sp-taupe` | `#6D6258` warm taupe | `--sp-muted` secondary text; `--sp-line` and `--sp-field-border` |
| `--sp-green` (kept) | `#185A31` | `--sp-success` (U8-7) |
| `--sp-red` (kept) | `#9B1C1C` | `--sp-danger` |
| `--sp-white` (kept) | `#FFFFFF` | `--sp-paper` form fields |

They are added to `brand.css` and mapped in `storefront.css` only. Components keep reading the same semantic names, so no component holds a colour value, and the token check stays in force. The existing `--sp-aubergine` (`#351A2B`) and the admin layer are unchanged (Q11-3).

### 3.4 Contrast (WCAG 2.2, measured with the relative-luminance formula)

**Text** (4.5:1 for normal text, 3:1 for large text):

| Foreground on background | Ratio | Use allowed |
|--------------------------|------:|-------------|
| soft black on ivory | 17.18 | All text |
| soft black on champagne | 11.14 | All text (pill labels) |
| soft black on white | 18.88 | Form fields |
| aubergine on ivory | 7.48 | Links, headings |
| aubergine on white | 8.22 | Links in fields |
| aubergine on champagne | 4.85 | Text, just above 4.5 |
| ivory on aubergine | 7.48 | Primary button label, footer text |
| ivory on soft black | 17.18 | Active pill, primary button hover |
| taupe on ivory | 5.40 | Secondary text |
| taupe on white | 5.94 | Hints in fields |
| **taupe on champagne** | **3.50** | **Large text only.** Secondary text never sits on champagne |
| green on ivory / champagne / green wash | 7.51 / 4.87 / 7.43 | Success messages (with text) |
| red on ivory / champagne / red wash | 7.42 / 4.81 / 7.18 | Errors (with text) |

**Interactive states and boundaries** (3:1 for UI components and focus indicators):

| Pair | Ratio | Rule |
|------|------:|------|
| **champagne pill on ivory** | **1.54** | **Fails as a boundary.** Pills get a 1 px taupe border (5.40) |
| taupe field border on ivory / white | 5.40 / 5.94 | Field and card borders |
| aubergine focus ring on ivory / champagne / white | 7.48 / 4.85 / 8.22 | One focus style everywhere: 2 px ring, 2 px offset |
| **aubergine against soft black** | **2.30** | **Never adjacent as the only difference.** A primary hover changes fill and adds an underline; it never relies on the colour step alone |
| logo ink on its ground | 17.32 | The logo stays black on light grounds; on the aubergine footer it is shown in ivory |

No pair is used where it fails. Each pair in use is checked again by axe at three widths, and the token check, before the gate.

### 3.5 Content in the screenshot that is not used

- **The caption is not used as site copy.** It contains claims ("A portion of every purchase directly funds…", the list of causes) that need the Owner's verification under BR-12, D-010 and OD-13.
- **Spelling:** the caption and its handle say **"Rahma Foundation"** (`@rahmafoundation.in`). The project uses **"Rehma Foundation"** everywhere, including the page slug `rehma-foundation` and the Phase 10 migration's title. **Q11-5 stays open until the official name is verified.** The `rehma-foundation` slug and the Phase 10 migration are not changed.

## 4. Design

### 4.1 The storefront app

- **Stack:** React 19.3.0, React Router 8.4.0 and Vite, the versions already approved for the admin (Q11-9). CSS Modules on the shared tokens (D-085, D-086).
- **Dev server:** `http://localhost:5173` (`STOREFRONT_ORIGIN`), proxying `/api` to the API so requests are same-origin and `__Host-` cookies work on localhost (D-132), as for the admin.
- **Fonts:** Switzer for text and UI. No Panchang in Phase 11 (Q11-2).
- **Skills:** `design-taste-frontend` for every storefront screen; `design-motion-principles` for the drawer and press feedback; `ui-ux-pro-max` for accessibility and forms.

### 4.2 Shell

- **Announcement bar:** the published announcement inside its window (`/content/home`); hidden when empty. A link only when its target is public.
- **Header** (`design-system.md` §6), sticky, plain `--sp-bg`, no blur:
  - the logo image on the left, a link to `/` named "Sanéa Pret";
  - `HEADER` menu links;
  - search, with suggestions;
  - "Bag (n)": a text label on desktop and an accessible name on mobile.
  - On mobile, the links move into a menu sheet (focus trapped; Escape closes it).
- **Category pills:** the `CATEGORY_PILLS` menu; real links, 44 px targets; horizontal scroll on mobile with the last pill partly visible.
- **Footer:** the three footer menus, contact and social links from `site.footer`, and the logo with its tagline (in ivory on aubergine).
- **Empty states:** a menu with no public links is not drawn. Nothing is invented to fill space.

### 4.3 Routes in this phase

| Route | Phase 11 content |
|-------|------------------|
| `/` | The shell, and a plain main region with a search field. Replaced by the landing page in Phase 12 |
| `/search?q=` | Results from `/api/v1/search`: product cards (4:5 placeholder wells until real images exist), sorting, "Load more" by cursor, and empty and error states. The query stays in the URL |
| `/cart` | The cart as a full page (the drawer's content) |
| `/pages/:slug` | Published pages from `/content/pages/:slug`, rendered from structured JSON (no `dangerouslySetInnerHTML`). This is needed so footer links do not lead nowhere |
| `*` | Not found |

Links to Phase 13 routes (categories, collections, products) render as real links. Until Phase 13 they reach the not-found page, which says the page is coming soon. Q11-7.

### 4.4 Search suggestions

- A combobox (WAI-ARIA 1.2 pattern) over `/search/suggest`, after 2 characters, debounced 200 ms, with earlier requests cancelled.
- Up to 2 categories, then products. Arrow keys move through them; Enter on a suggestion opens it, and Enter on the field opens `/search?q=`.
- The rate limit (60 per minute per IP, shared with search) is respected: a `429` shows "Search is busy, try again in a moment" and no retry loop.

### 4.5 Adding to the bag (Q11-6)

The product card's "Add" opens a **size and colour sheet** fed by `/catalogue/products/:slug`. It shows only active variants; sold-out sizes are struck through and disabled, with "Sold out" in the accessible name. It never adds a default size silently (`design-system.md` §6). Adding opens the cart drawer.

### 4.6 Cart drawer

- **Layout:** a right-hand sheet on desktop and full height on mobile. It is the only floating element with a shadow.
- **Behaviour:** focus is trapped, Escape closes it, and focus returns to the trigger. Opening takes 280 ms and closing 200 ms, with no travel under reduced motion.
- **Lines:** image well, name, colour, size, price (`en-IN`, from the server), quantity stepper (1 to the limit), and Remove.
- **Warnings** are in text, never colour alone: "Only 2 left" when the quantity is above availability; "No longer available" for an inactive variant or an unpublished product.
- **Subtotal** from the server; "Checkout" is shown disabled with "Checkout opens soon" until Phase 15.
- **Bag count:** updated from each server response; announced politely ("Bag, 2 items").

## 5. Cart API and data

### 5.1 Migration (needs your review before commit)

Tables as in `database-design.md` §3.3:
- `cart`: `id` (uuid), `token_hash` (`BYTEA`, unique; SHA-256 of the raw token, exactly 32 bytes by CHECK, as for `admin_session`), `created_at`, `updated_at`, `expires_at`. **As written (§14.1):** `BYTEA` rather than text, following the admin-session convention; **no `customer_id`**: accounts are deferred (D-034), an existing test refuses any `customer` column, and a column that is always null is speculative. Accounts add it when they are scheduled.
- `cart_item`: `cart_id` and `variant_id` (composite primary key), `quantity` (`CHECK 1..10`), `created_at`, `updated_at`; foreign keys to `cart` (cascade delete) and `product_variant` (restrict).
- An index on `cart.expires_at` for the cleanup job.
- `RESTRICT` on the variant is safe: no route deletes products or variants (they are deactivated), and the database refuses a deletion that would orphan a cart line.

The quantity CHECK holds the per-line ceiling of 10 from `system-design.md` §3. The configurable limit (`CART_MAX_LINE_QUANTITY`, 1 to 10, default 10) can only be lower.

### 5.2 Token and cookie (Q11-8)

- **Token:** a random 256-bit token in cookie `__Host-sp_cart`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, renewed on each write. Only its SHA-256 hash is stored.
- **When it is issued (D-099):** `GET /cart` never creates a cart or sets a cookie; without a valid cookie it returns the empty cart. The first **successful** `POST /cart/items` creates both; a refused add (`400`, `403`, `404`, `429`) creates neither. This keeps crawlers and single visits from filling the table.
- **Contract reconciliation:** `api-specification.md` said `GET /cart` "creates token cookie if absent". No decision in `DECISION-LOG.md` fixed that wording; it came with the D-028 baseline. It is amended by D-099, and `api-specification.md` §3 Cart, `system-design.md` §3 and `security-design.md` (rate limits) now state the same rules.
- **Renewal:** each successful write renews `Max-Age` and `expires_at` (30 days); reading does not.
- **Unknown, malformed or expired token:** treated as no cart, with the same response as no cookie; the next successful write issues a new token. Tokens are never logged (the log redaction already covers `cookie` and `token`).

### 5.3 Routes (`/api/v1/cart`, `no-store`)

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/cart` | `{ lines, subtotalPaise, currency, itemCount, warnings }`. Each line is re-priced from the current variant (`unitPricePaise`, `lineTotalPaise`), with product name, slug, colour, size, image derivative and `available` (on hand minus reserved, capped at the limit). Lines whose product is no longer visible are returned as unavailable, with no price, and are excluded from the subtotal |
| POST | `/cart/items` | `{ variantId, quantity }` (strict, 1 to the limit). Adds or increments; a total above the limit is capped, with a `QUANTITY_LIMIT` warning. `404` for an unknown, inactive or invisible variant, and no cart is created |
| PATCH | `/cart/items/:variantId` | `{ quantity }` 0 to the limit; 0 removes |
| DELETE | `/cart/items/:variantId` | Removes the line |

- Every write needs the CSRF token (D-045) and the storefront Origin; it returns the whole cart.
- Prices are never accepted from the client.
- Adding never reserves stock (SR-2). Quantity above availability is allowed but warned, and checkout (Phase 15) refuses it.
- **Limits (Q11-8):** at most 30 distinct lines per cart (`409 CART_FULL`); cart writes 60 per minute per IP (`429`).
- **Cleanup:** an hourly job deletes carts past `expires_at` (`SKIP LOCKED`, like the reservation expiry job), in batches.

### 5.4 Shared contracts

`@sanea/shared` gains `cartItemAddSchema`, `cartItemUpdateSchema` and the `CartView` type, used by both the API and the storefront.

## 6. Security

- **Cart:**
  - the token's entropy, hash-only storage and cookie attributes as in §5.2;
  - one cart is never readable or writable with another cart's token;
  - variant IDs are validated as UUIDs; unknown ones get `404`, not `500`.
- **CSRF and Origin** on every cart write.
- **CORS:** the storefront origin only for public routes.
- **No HTML from content:** pages and footer text are rendered from structured JSON; links are `/`-relative or allow-listed `https` social hosts (Phase 10 rules).
- **Images:** derivatives only, never originals (Phase 8 safeguard 1).
- **Error messages** say nothing about whether a token exists.

## 7. Accessibility and responsive UI

- **Widths:** 390, 768 and 1440 px for screenshots; 375, 768, 1024 and 1440 for the UI UX Pro Max checklist.
- **Landmarks:** a skip link, `header`, `nav` (labelled: main, categories, footer), `main` and `footer`.
- **Focus:** one visible style (§3.4); the drawer and menu sheet trap focus and restore it.
- **Targets:** at least 44 × 44 px for the header buttons, pills, steppers and the drawer's close button.
- **Motion:** only `transform` and `opacity`; everything respects reduced motion.
- **Text:** body at `--step-body` (17 to 19 px); prices in tabular figures.
- **Live updates:** cart changes and search result counts are announced in a polite live region, as complete phrases.

## 8. Tests

**Unit and component (Vitest, jsdom):**
- the cart schemas and price formatting;
- the header, pills, announcement and footer rendering only public links;
- the search combobox (keyboard, debounce, cancellation, `429`);
- the drawer (focus trap, Escape, restored focus, announcements);
- the size sheet (sold-out sizes disabled, no default size).

**Integration (PostgreSQL 18, disposable):**

| Test | Proves |
|------|--------|
| T11-1 | Prices come from the server: a changed variant price shows on the next `GET /cart`; a `price` in the body is refused (strict schema) |
| T11-2 | Cart isolation: a second token cannot read or change the first cart; a forged or expired token gets an empty cart |
| T11-3 | Only the hash is stored: the raw token appears in no table or log line; the stored hash is the SHA-256 of the cookie value |
| T11-4 | Limits: quantity 11 refused by the API and by the database CHECK; an increment past the limit is capped with a `QUANTITY_LIMIT` warning; the 31st line gets `409 CART_FULL`; a lowered `CART_MAX_LINE_QUANTITY` is enforced |
| T11-5 | Availability: quantity above stock is accepted and warned; an inactive variant or unpublished product becomes an unavailable line outside the subtotal |
| T11-6 | No reservation: adding to the cart leaves `inventory_level.reserved` unchanged (SR-2) |
| T11-7 | CSRF and Origin: cart writes without the token, or from another origin, are refused |
| T11-8 | `GET /cart` without a cookie creates no row and sets no cookie |
| T11-9 | Cleanup: expired carts are deleted once, concurrently safe (two workers) |
| T11-10 | Cookie and token: the first successful add sets `__Host-sp_cart` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, `Max-Age` 30 days; a write renews it and `expires_at`, a read does not; a refused add (`400`, `403`, `404`, `429`) creates no cart and sets no cookie |
| T11-11 | Visibility: adding an inactive variant, or a variant of a draft or archived product, or of a product in an unpublished category, gets `404`; an existing line whose product becomes invisible is unavailable, unpriced and outside the subtotal |
| T11-12 | Rate limit: the 61st cart write in a minute from one IP gets `429 RATE_LIMITED` with `Retry-After` |

The migration is checked on disposable databases: deploy, status, drift exit 0, the CHECKs, and down and up.

**End to end (Edge, axe at three widths):**
- search from the header, then open a result;
- add a size from the sheet, change the quantity in the drawer, remove it;
- the cart survives a reload, and an announcement and pills appear only when published;
- keyboard-only run of the same path.

**`design-system.md` §10 gates:**
- gate 1: Taste `lint.mjs` and `inspect.mjs` at 1440, 768 and 390 px;
- gate 5: the UI UX Pro Max pre-delivery checklist;
- gate 6: Lighthouse performance and accessibility on a throttled mobile profile (Q11-10).

## 9. Dependencies (each needs your approval; none is installed by this plan)

| Change | Why | Versions |
|--------|-----|----------|
| `apps/storefront/package.json`: `react`, `react-dom`, `react-router`, `@sanea/shared`; dev `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` | The storefront app | **The exact versions the admin already uses** (React 19.3.0, React Router 8.4.0, plugin 6.1.2). No new package enters the lockfile |
| `lighthouse` **13.5.0** (root dev dependency, exact version; Q11-10 option A, D-098) | Gate 6, reproducible from the command line | Checked 2026-10-23 with `npm view`: published **2026-09-18T14:13:55Z** (35 days old; the two-week rule is met, not waived); `engines.node` `>=22.19`, which Node 24.11.0 satisfies; Apache-2.0; about 28 direct dependencies (including `puppeteer-core`, `chrome-launcher`, `@sentry/node`). Installed with `--save-exact` and `--before` set 14 days back, so no transitive package younger than two weeks enters the lockfile. Run against the installed Edge (`CHROME_PATH`) with error reporting off (`--no-enable-error-reporting`), so Sentry sends nothing. **Fallback to option B** (Edge DevTools Lighthouse, report saved as JSON and HTML in `docs/reviews/storefront/<date>/`) if `npm audit` reports a high or critical issue, or Lighthouse cannot drive Edge |

Nothing else. No Tailwind, no component library, no state or data-fetching library (U8-2 applies to the storefront too).

## 10. Questions for you

| # | Question | Recommendation |
|---|----------|----------------|
| Q11-1 | **Logo files.** Use the supplied raster crops for the header and footer now, and request a vector or ≥ 3000 px transparent export for the Phase 12 monument? | **Approved (D-098).** Use `logo-wordmark-transparent.png` in the header and `logo-lockup-transparent.png` in the footer. Phase 12 cannot pass its gate on the screenshot crop |
| Q11-2 | **Display face.** The serif logo next to Panchang headings would clash. | **Approved (D-098).** In Phase 11, headings in Switzer; Panchang unused. Choose the display face in Phase 12 with the landing page (a licence-checked serif, or none) |
| Q11-3 | **Palette.** Adopt §3.3 as proposed implementation colours, for the storefront only? | **Approved (D-096, D-098): storefront only;** the admin keeps its current tokens |
| Q11-4 | **Wordmark text.** Show the logo as supplied ("SANÉA"), with "Sanéa Pret" as its accessible name and in page titles? | **Approved (D-098).** `design-system.md` §2 and §3 are updated in Phase 12, when the monument is designed |
| Q11-5 | **Foundation name.** The caption says "Rahma Foundation" (`@rahmafoundation.in`); the project says "Rehma". Which is correct? | **Open.** Until the official name is verified, the existing "Rehma" spelling and `rehma-foundation` slug stay, and the Phase 10 migration is not changed. A rename needs a separate approval |
| Q11-6 | **Add to bag in Phase 11** through the card's size sheet (§4.5)? | **Approved (D-098)**, so the cart is tested end to end |
| Q11-7 | **Links to Phase 13 pages** reach a "coming soon" not-found page until then? | **Approved (D-098).** The links are real and need no change later |
| Q11-8 | **Cart rules:** the cookie on first add only; 30 lines; a per-line limit of 10, configurable lower; cart writes 60 per minute per IP; hourly cleanup | **Approved (D-098)**, as listed; the contract is in D-099 |
| Q11-9 | **Storefront dependencies:** declare the admin's existing versions (§9) | **Approved (D-098).** No new package |
| Q11-10 | **Lighthouse (gate 6):** A, the `lighthouse` package as a pinned dev dependency, run locally; or B, Edge DevTools Lighthouse run by hand, with the report saved | **A (D-098):** `lighthouse` **13.5.0**, published 2026-09-18 (35 days before this decision); `engines.node` `>=22.19`, which Node 24.11.0 satisfies. The two-week rule is not waived. Fallback to B if the install or its audit fails, or Edge cannot be driven (§9) |
| Q11-12 | **Stock in the cart (found during implementation).** D-099 says each line carries `available` as an exact count "capped at the line limit". The catalogue never shows exact stock above the low-stock level (D-082 as amended by Q8-2), so that count would reveal up to 10 units the product page hides. | **Approved (D-135):** lines carry the catalogue's public state (`IN_STOCK`, `LOW_STOCK` with `remaining`, `SOLD_OUT`) plus the `EXCEEDS_AVAILABLE` warning; the server keeps enforcing real availability |
| Q11-11 | **OD-02 outcome:** record it as "logo supplied (raster, vector requested); palette proposed for implementation, not verified brand colours"? | **Recorded (D-096)**, approved in principle; the vector export is still outstanding (B-04) |

## 11. Acceptance criteria

1. The storefront builds and runs at `localhost:5173`; the shell is drawn from published content only.
2. The header shows the supplied logo with "Sanéa Pret" as its name; É is drawn correctly at every width.
3. No hard-coded colour, size or font in `apps/storefront` (the token check passes); no Tailwind.
4. Every colour pair in use meets §3.4; axe reports nothing at 390, 768 and 1440 px.
5. Search and suggestions work by keyboard and touch; `429` is handled.
6. A guest can add a size, change the quantity and remove it; the cart survives a reload; the server decides every price.
7. T11-1 to T11-12 pass; the migration is approved by you before commit.
8. The §10 gates 1, 5 and 6 are run and their results recorded.
9. Screenshots of every shell state at three widths are in `docs/reviews/storefront/<date>/`.

## 12. Sequence and stop points

| Step | Work | Needs your approval |
|------|------|---------------------|
| 1 | Approve this plan and Q11-1 to Q11-11 (OD-02 recorded in principle, D-096; OD-15 closed, D-097) | **Done in principle** (D-098, D-099); Q11-5 open |
| 2 | Storefront dependencies (§9) and the Vite app | Covered by Q11-9 (and Q11-10 for Lighthouse) |
| 3 | Palette tokens and storefront base styles | Covered by Q11-3 |
| 4 | The cart migration, validated on disposable databases | **Approved (D-100)** after review |
| 5 | The `cart` module, cleanup job and integration tests | Covered by step 1 |
| 6 | Shell, search, size sheet, drawer; component and e2e tests; screenshots; §10 gates | Covered by step 1 |
| 7 | Commit, normal push, CI on a draft PR | **The draft PR needs your authorisation** |
| 8 | **Phase 11 gate:** your review of screenshots and tests | **Yes** |

## 13. Risks

| Risk | Mitigation |
|------|------------|
| The raster logo looks soft on high-density screens | Shown at most about 200 CSS px wide in Phase 11; a vector export requested before Phase 12 |
| A proposed colour is later taken as the official brand colour | Recorded as proposed implementation colours (Q11-11); one token file to change |
| Carts filling the database | Cookie only on first add; 30 lines; rate limit; hourly cleanup |
| The cart shows a price that checkout later changes | Every cart read re-prices; checkout re-prices again and refuses changes (Phase 15) |
| The foundation's name is wrong on the site | Q11-5 before anything about it is shown; the page stays a 404 until the Owner verifies it |

## 14. Progress and evidence (2026-10-23)

### 14.1 Step 2: the cart migration (approved, D-100)

**Migration** `prisma/migrations/20261023180000_guest_cart/migration.sql`: two new tables, three indexes, two foreign keys, three handwritten CHECKs. No existing table, row or constraint changes; no data.

| Object | Definition |
|--------|------------|
| `cart` | `id` UUID `uuidv7()`; `token_hash` BYTEA NOT NULL; `created_at`, `updated_at`, `expires_at` TIMESTAMPTZ(3) |
| `cart_item` | `cart_id`, `variant_id` UUID (composite primary key); `quantity` INTEGER; `created_at`, `updated_at` TIMESTAMPTZ(3) |
| Indexes | `cart_token_hash_key` (unique), `cart_expires_at_idx` (cleanup job), `cart_item_variant_id_idx` |
| Foreign keys | `cart_item_cart_id_fkey` → `cart` **ON DELETE CASCADE**; `cart_item_variant_id_fkey` → `product_variant` **ON DELETE RESTRICT** |
| CHECKs | `cart_token_hash_check` `octet_length = 32`; `cart_expiry_check` `expires_at > created_at`; `cart_item_quantity_check` `quantity BETWEEN 1 AND 10` |

**Schema:** models `Cart` and `CartItem`; `ProductVariant.cartItems`. Generated with `prisma migrate diff` from a database at the Phase 10 state, then the CHECKs added by hand and registered in `apps/api/src/db/handwritten.ts`.

**Differences from §5.1 as planned:** `BYTEA` instead of text for the hash; no `customer_id` (reasons in §5.1).

**Validation on disposable databases** (container `postgres:18.6-alpine` on loopback, synthetic data only):

| Check | Result |
|-------|--------|
| Fresh database, `prisma migrate deploy` | 6 migrations applied; `migrate status` up to date; `migrate diff --exit-code` 0 (no drift) |
| Re-run `migrate deploy` | "No pending migrations to apply" |
| Upgrade from the Phase 10 state through Prisma, with a category, product, colour, variant and the Rehma draft present | `migrate status` lists only `20261023180000_guest_cart`; deploy applies it; the variant (129900 paise) and the Rehma page (`DRAFT`) unchanged; up to date; drift 0 |
| Down and up | Tables dropped and the migration record removed: drift reported (exit 2); deploy re-applies it; drift 0 |
| CHECKs on the upgraded database | Quantity 11: `cart_item_quantity_check`; quantity 10 accepted |
| Variant in a cart deleted | `violates RESTRICT setting of foreign key constraint "cart_item_variant_id_fkey"` |
| Cart deleted | Its lines deleted (0 left) |

**Tests:**
- `apps/api/src/db/cart.db-test.ts` (new, 9 tests): 32-byte hash only (31 and 33 refused); unique hash; expiry after creation; the exact column list (no price, total or customer column); quantity 0, −1 and 11 refused, 10 accepted, an update to 11 refused; one line per variant; unknown cart or variant refused; lines deleted with their cart; a variant in a cart cannot be deleted.
- `schema.test.ts`: the approved table list gains `cart` and `cart_item`; a new static test checks the hash column, the unique index, no price or token column, the cascade and restrict rules, the quantity CHECK, and that the migration alters only its own tables.
- `catalog.db-test.ts`: table list, foreign-key count (25 → 27), cascade list (`cart_item.cart_id`), uuid primary keys (19 → 20), empty-table count (20 → 22).

**Results** (final files): unit 692 passed (37 files); integration 390 passed (18 files); typecheck, lint, design tokens and format clean.

### 14.2 Step 1: storefront foundation

- `apps/storefront/package.json`: the admin's exact versions (React 19.3.0, React Router 8.4.0, `@vitejs/plugin-react` 6.1.2, types 19.3.0). `npm install` changed only the storefront's own entry in `package-lock.json`; no package was added.
- Vite on `localhost:5173` with the `/api` proxy; `index.html` (`lang="en-IN"`); global styles on the shared tokens; the placeholder `src/index.ts` removed.
- Tokens: five proposed primitives in `brand.css` (D-096); `storefront.css` mapped to them; `admin.css` unchanged. The token check passes.
- The logo: `src/assets/logo-wordmark.png` in the header (120 px wide on a phone, 160 px on desktop), `logo-lockup.png` in the footer, inverted to white on deep aubergine (8.22:1). Accessible name "Sanéa Pret".
- Production build passes (JS 82.45 kB gzipped). Screenshots at 390 and 1440 px checked: the logo, É and footer render.

### 14.3 Steps 5 and 6: the cart API and the storefront (2026-10-24)

**Cart module** (`apps/api/src/modules/cart/`): `token.ts` (cookie, hashing), `service.ts` (add, set, view, cleanup), `router.ts` (`/api/v1/cart`, a write limit of 60 per minute per IP), `job.ts` (hourly cleanup, started and stopped in `main.ts`). `CART_FULL` (409) added to the error registry; `CART_MAX_LINE_QUANTITY` (1 to 10, default 10) to the configuration and `.env.example`. Shared contract in `@sanea/shared` (`cart/cart.ts`): request schemas, `CartView`, `CartWarning`.

**Gate output** (`[P11-GATE]` lines from `apps/api/src/modules/cart/cart.db-test.ts`, re-run on 2026-10-24 after D-135; all 13 pass):

```
T11-1 add 2 × ₹1,000: subtotal 200000 paise; price changed to 120000: next GET re-priced (line 240000, subtotal 240000); body with pricePaise or subtotalPaise: 400, quantity unchanged
T11-2 cart B cannot read, change (404) or remove (404) cart A's line; forged and malformed tokens: empty cart, 404 identical to no line; after 31 days: empty, 404, and the next add issues a new token
T11-3 stored token_hash = SHA-256(cookie value) (32 bytes); raw token found in 0 of 25 tables and 0 of 24 log lines
T11-4 quantity 11: 400 (API) and cart_item_quantity_check (database); 6 + 6 capped at 10 with QUANTITY_LIMIT; 31st line: 409 CART_FULL, 30 lines kept; CART_MAX_LINE_QUANTITY=3: add 4 and PATCH 4 refused (400), 3 + 1 capped at 3
T11-5 quantity 3 with 2 available: accepted, EXCEEDS_AVAILABLE, stock LOW_STOCK remaining 2; deactivated variant: unavailable, no price, outside the subtotal (300000 of 4 units), UNAVAILABLE; product archived: subtotal 0
T11-5 (Q11-12) 7 on hand, low-stock level 2: line stock {IN_STOCK} with no count, no onHand, reserved or remaining field; 9 in the bag: EXCEEDS_AVAILABLE, still no count; 0 on hand: {SOLD_OUT} and EXCEEDS_AVAILABLE; reserved stays 0
T11-6 add 3 then set 4: on hand 4, reserved 0 (unchanged), no reservation or stock movement
T11-7 cart add without the CSRF token, with a wrong token, from the admin origin and from a foreign origin: 403 CSRF_FAILED, no cart created, no cookie
T11-8 GET /cart with no cookie: 200 empty cart, no-store, no Set-Cookie, no row created
T11-9 53 expired (50 made here, 3 from earlier cases) and 5 live carts, two cleanups in parallel (batch 7): deleted 25 + 28 = 53, each once; 5 live kept; expired lines gone; a third run deletes 0
T11-10 first add sets __Host-sp_cart (43-character token; HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=2592000, no Domain); GET a day later: no Set-Cookie, expiry unchanged; PATCH: cookie re-sent, expiry +1 day; refused adds (404 unknown variant, 400 quantity 0): no cart, no cookie (403 in T11-7, 429 in T11-12)
T11-11 add an inactive variant, a draft product's, an archived product's, a product in a draft category: 404 each, no cart; a non-uuid variant in the path: 404 (an existing line that stops being on sale: T11-5)
T11-12 60 cart writes then the 61st: 429 RATE_LIMITED, Retry-After 60 s, no cart, no cookie; GET still 200
```

**Storefront** (`apps/storefront/src/`): the shell (announcement, header with the logo, main links, search combobox and bag; a menu sheet on phones; category pills; footer menus, contact and social links), `/search` with sorting and "Load more", the size and colour sheet, the cart drawer and `/cart`, `/pages/:slug` rendered from structured JSON, and not found (with "coming soon" for Phase 13 paths). A small fetch client with the guest CSRF token; no new library. The shell is drawn once the menus and announcement are known, so they never move the page (CLS).

Changes made from what the checks found:
- **Focus:** the native modal `<dialog>` keeps the page inert but let Tab leave for the browser; the sheet now wraps Tab and Shift+Tab. After an add, the bag opens only once the size sheet has closed, so closing the bag returns focus to the card's "Add".
- **Names:** the header, page and option labels are distinct and complete ("Add … to bag", "Remove …, colour, size", "…, product").
- **Layout shift:** search CLS went from 0.128 to 0.029 by drawing the shell once.
- **Headings:** card names are `h2` under the page's `h1` (Lighthouse heading order).

### 14.4 Results (2026-10-24, final files)

| Check | Result |
|-------|--------|
| Unit and component (`npm test`) | 713 passed (39 files), including 9 storefront component tests, 5 shared cart schema tests and the cart configuration tests |
| Integration (`npm run test:integration`) | 403 passed (19 files), including the 13 cart gate tests (T11-1 to T11-12 and T11-5 for Q11-12) and 9 cart migration tests |
| End to end (`npx playwright test`, Edge) | 15 passed: 11 admin, 4 storefront |
| Lint, design tokens, format, typecheck | clean |
| Builds | storefront JS 90.48 kB gzipped, CSS 4.15 kB; admin passes |
| `npm run audit` | 0 vulnerabilities |

### 14.5 `design-system.md` §10 gates 1, 5 and 6

**Gate 1, Taste.**
- `lint.mjs apps/storefront/src`: **0 FAIL, 0 WARN.** Two lines carry `taste-skill-ignore`: the sheet's elevation (the one modal surface, §6) and the logo's printed tagline in its alt text.
- `inspect.mjs` on `/`, `/search?q=Storefront` and `/cart` (synthetic data): **3 FAIL, 2 WARN on each page, the same rules.** Recorded, not hidden, with reasons:

| Rule | Why it stands in Phase 11 |
|------|---------------------------|
| `few-pictures` (FAIL) | No real product or campaign photography exists (B-06, D-120). Stock or found pictures may not stand in for the brand's products. Product wells stay empty until real images are uploaded |
| `focal-point` (FAIL) | These are utility pages (shell, search, bag). The first-screen monument is the landing page's, Phase 12, and needs the vector logo (B-04) |
| `still-page` (FAIL) | The motion here is on interaction (sheets slide in, presses scale); load and scroll entrances belong to the landing page and the motion audit (gate 4), Phase 12 |
| `palette-cream` (WARN) | Ivory `#F8F4E9` is your approved palette (D-096), and the logo's own ground |
| `no-footage` (WARN) | No footage exists |

**Gate 5, UI UX Pro Max checklist.**
- **Contrast:** every pair in use is in §3.4; axe reports nothing at 1440, 1024, 768, 390 and 375 px on every storefront page tested.
- **Focus:** one visible ring (deep aubergine); sheets keep focus inside and return it on close; a skip link is the first stop.
- **Targets:** 44 px minimum for header buttons, pills, steppers, size buttons and close buttons.
- **Reduced motion:** honoured globally; motion uses transform only.
- **Widths:** no horizontal scroll at 375, 390, 768, 1024 and 1440 px.
- **Forms and feedback:** visible labels; errors and stock notices in words, never colour alone; live announcements for bag changes and result counts.

**Gate 6, Lighthouse** (option A, D-098: `lighthouse` 13.5.0 driving Microsoft Edge 155, mobile form factor, simulated throttling). Reports, JSON and HTML, in `docs/reviews/storefront/2026-10-24/lighthouse-*`:

| Page | Performance | Accessibility | FCP | LCP | TBT | CLS |
|------|------------:|--------------:|----:|----:|----:|----:|
| `/` | 94 | 100 | 2.0 s | 2.9 s | 10 ms | 0 |
| `/search?q=Storefront` | 93 | 100 | 2.0 s | 3.0 s | 20 ms | 0.029 |
| `/cart` | 94 | 100 | 2.0 s | 2.9 s | 30 ms | 0 |

These run against the local `vite preview` build, not production hosting.

**Not run in Phase 11** (not in the index's verification for this phase): gate 2 (Taste critique rounds), gate 3 (side-by-side with nishorama.com) and gate 4 (motion audit). They belong with the landing page, Phase 12.

### 14.6 Dependencies

`lighthouse` **13.5.0**, exact, root dev dependency, installed on 2026-10-24 with `npm install -D -E lighthouse@13.5.0 --before=2026-10-10`, so no package younger than two weeks entered the lockfile: 100 packages added, `npm audit` 0. npm warned that `@opentelemetry/sdk-trace-base@2.12.0` (through `@sentry/node`) is deprecated; it is not a vulnerability, and error reporting is off. The storefront declares only the admin's existing versions. Nothing else was added.

### 14.7 Screenshots and open points

- Screenshots: `docs/reviews/storefront/2026-10-24/`: home, search, search with no results, size sheet, cart drawer, cart, empty cart, page and coming soon, each at 1440, 768 and 390 px; the phone menu sheet at 390 px. Product wells are empty champagne blocks: there is no real photography yet.
- **Open:** Q11-5 (the Foundation's name); the vector logo before Phase 12 (B-04). Q11-12 approved (D-135); decisions continue from D-135.
- **Phase 11 gate: not recorded.** It needs your review of these screenshots and results.

### 14.8 Gate checklist (§11 acceptance criteria, reviewed 2026-10-24)

| # | Criterion | Evidence | Status |
|---|-----------|----------|--------|
| 1 | Builds and runs at `localhost:5173`; the shell is drawn from published content only | Storefront build; e2e "shell" (announcement, pills, footer from seeded published content); component test "draws no announcement, pills or footer links when nothing is published" | Met |
| 2 | The supplied logo with "Sanéa Pret" as its name; É correct at every width | e2e finds the images by name ("Sanéa Pret", "Sanéa Pret, Effortless Elegance"); É visible in the header and footer in every screenshot at 1440, 768 and 390 px | Met |
| 3 | No hard-coded colour, size or font; no Tailwind | Token check clean (colours and fonts); no Tailwind. Spacing, type, controls and borders use tokens; **27 literal layout measures remain** (media-query breakpoints, which cannot use custom properties; container, sheet and logo widths), the same convention as the admin (28), which the check does not measure | **Met for colour and font; sizes for your judgement** |
| 4 | Every colour pair meets §3.4; axe clean at 390, 768 and 1440 px | Pairs in use are in §3.4; axe reports nothing on every storefront page and sheet tested, at 1440, 1024, 768, 390 and 375 px; Lighthouse accessibility 100 on three pages | Met |
| 5 | Search and suggestions by keyboard and touch; 429 handled | Component tests (arrow keys, Enter, 2-character threshold, debounce, 429 without retry); e2e keyboard-only run. Touch: exercised by pointer clicks in Edge; **not tested on a touch device** | **Met, except a real touch device** |
| 6 | A guest adds, changes and removes; the bag survives a reload; the server decides prices | e2e "search, size sheet, drawer and /cart"; T11-1 | Met |
| 7 | T11-1 to T11-12 pass; migration approved before commit | 13 cart gate tests pass (§14.3); migration approved (D-100) before commit `3497ea0` | Met |
| 8 | §10 gates 1, 5 and 6 run and recorded | §14.5: Taste lint 0/0; **inspector 3 FAIL and 2 WARN per page, recorded with reasons** (no photography, no first-screen monument or motion until Phase 12); checklist; Lighthouse reports | **Run and recorded; the inspector findings need your acceptance** |
| 9 | Screenshots of every shell state at three widths | §14.7 list; the menu sheet only at 390 px (it is a phone control). Error states (API down) are covered by component tests, not screenshots | Met, with that limit |

**Gate: not recorded.** It waits for your explicit approval of this evidence.
