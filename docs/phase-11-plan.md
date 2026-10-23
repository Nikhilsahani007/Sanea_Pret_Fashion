# Phase 11 Plan — Storefront Shell, Search and Cart

Status: **Draft for your approval. Planning only: no code, dependency, schema change or migration until you approve this plan and Q11-1 to Q11-11.** · Date: 2026-10-23 · Base: `phase-11-storefront` from `phase-10-content` at `4634762` (Phase 10 gate passed, D-095; draft PRs #6, #7 and #8 open and unmerged)

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
- `cart`: `id` (uuid), `token_hash` (text, unique; SHA-256 of the raw token), `customer_id` (nullable; no table yet), `created_at`, `updated_at`, `expires_at`.
- `cart_item`: `cart_id` and `variant_id` (composite primary key), `quantity` (`CHECK 1..10`), `created_at`, `updated_at`; foreign keys to `cart` (cascade delete) and `product_variant` (restrict).
- An index on `cart.expires_at` for the cleanup job.
- `RESTRICT` on the variant is safe: no route deletes products or variants (they are deactivated), and the database refuses a deletion that would orphan a cart line.

The quantity CHECK holds the per-line ceiling of 10 from `system-design.md` §3. The configurable limit (`CART_MAX_LINE_QUANTITY`, 1 to 10, default 10) can only be lower.

### 5.2 Token and cookie (Q11-8)

- **Token:** a random 256-bit token in cookie `__Host-sp_cart`: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, renewed on each write. Only its SHA-256 hash is stored.
- **When it is issued:** `GET /cart` does **not** create a cart or cookie (an empty cart is returned). The first `POST /cart/items` creates both. This keeps crawlers and single visits from filling the table. It is a small change to `api-specification.md` ("creates token cookie if absent").
- **Unknown or expired token:** treated as no cart; the next write issues a new one. Tokens are never logged (the log redaction already covers `cookie` and `token`).

### 5.3 Routes (`/api/v1/cart`, `no-store`)

| Method | Path | Behaviour |
|--------|------|-----------|
| GET | `/cart` | `{ lines, subtotalPaise, currency, itemCount, warnings }`. Each line is re-priced from the current variant (`unitPricePaise`, `lineTotalPaise`), with product name, slug, colour, size, image derivative and `available` (on hand minus reserved, capped at the limit). Lines whose product is no longer visible are returned as unavailable, with no price, and are excluded from the subtotal |
| POST | `/cart/items` | `{ variantId, quantity }` (strict, 1 to the limit). Adds or increments, capped at the limit. `404` for an unknown, inactive or invisible variant |
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
| T11-3 | Only the hash is stored: the raw token appears in no table or log line |
| T11-4 | Limits: quantity 11 refused by the API and by the database CHECK; the 31st line gets `409 CART_FULL`; a lowered `CART_MAX_LINE_QUANTITY` is enforced |
| T11-5 | Availability: quantity above stock is accepted and warned; an inactive variant or unpublished product becomes an unavailable line outside the subtotal |
| T11-6 | No reservation: adding to the cart leaves `inventory_level.reserved` unchanged (SR-2) |
| T11-7 | CSRF and Origin: cart writes without the token, or from another origin, are refused |
| T11-8 | `GET /cart` without a cookie creates no row and sets no cookie |
| T11-9 | Cleanup: expired carts are deleted once, concurrently safe (two workers) |

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
| `lighthouse` (root dev dependency), only if Q11-10 is option A | Gate 6, reproducible from the command line | A release at least two weeks old, pinned; checked for compatibility with Node 24.11 first |

Nothing else. No Tailwind, no component library, no state or data-fetching library (U8-2 applies to the storefront too).

## 10. Questions for you

| # | Question | Recommendation |
|---|----------|----------------|
| Q11-1 | **Logo files.** Use the supplied raster crops for the header and footer now, and request a vector or ≥ 3000 px transparent export for the Phase 12 monument? | **Yes.** Use `logo-wordmark-transparent.png` in the header and `logo-lockup-transparent.png` in the footer. Phase 12 cannot pass its gate on the screenshot crop |
| Q11-2 | **Display face.** The serif logo next to Panchang headings would clash. | **In Phase 11, headings in Switzer**; Panchang unused. Choose the display face in Phase 12 with the landing page (a licence-checked serif, or none) |
| Q11-3 | **Palette.** Adopt §3.3 as proposed implementation colours, for the storefront only? | **Approved in principle (D-096): storefront only;** the admin keeps its current tokens. The token change itself is made only after this plan is approved |
| Q11-4 | **Wordmark text.** Show the logo as supplied ("SANÉA"), with "Sanéa Pret" as its accessible name and in page titles? | **Yes.** `design-system.md` §2 and §3 are updated in Phase 12, when the monument is designed |
| Q11-5 | **Foundation name.** The caption says "Rahma Foundation" (`@rahmafoundation.in`); the project says "Rehma". Which is correct? | **Your confirmation.** If it is "Rahma", a separately approved change renames the page title, slug and documents (a data migration). Nothing changes until you answer |
| Q11-6 | **Add to bag in Phase 11** through the card's size sheet (§4.5)? | **Yes**, so the cart is tested end to end. Otherwise the cart is tested through the API only until Phase 13 |
| Q11-7 | **Links to Phase 13 pages** reach a "coming soon" not-found page until then? | **Yes.** The links are real and need no change later |
| Q11-8 | **Cart rules:** the cookie on first add only; 30 lines; a per-line limit of 10, configurable lower; cart writes 60 per minute per IP; hourly cleanup | **Yes, as listed** |
| Q11-9 | **Storefront dependencies:** declare the admin's existing versions (§9) | **Yes.** No new package |
| Q11-10 | **Lighthouse (gate 6):** A, the `lighthouse` package as a pinned dev dependency, run locally; or B, Edge DevTools Lighthouse run by hand, with the report saved | **A**, if a release at least two weeks old supports Node 24.11; otherwise B |
| Q11-11 | **OD-02 outcome:** record it as "logo supplied (raster, vector requested); palette proposed for implementation, not verified brand colours"? | **Recorded (D-096)**, approved in principle; the vector export is still outstanding (B-04) |

## 11. Acceptance criteria

1. The storefront builds and runs at `localhost:5173`; the shell is drawn from published content only.
2. The header shows the supplied logo with "Sanéa Pret" as its name; É is drawn correctly at every width.
3. No hard-coded colour, size or font in `apps/storefront` (the token check passes); no Tailwind.
4. Every colour pair in use meets §3.4; axe reports nothing at 390, 768 and 1440 px.
5. Search and suggestions work by keyboard and touch; `429` is handled.
6. A guest can add a size, change the quantity and remove it; the cart survives a reload; the server decides every price.
7. T11-1 to T11-9 pass; the migration is approved by you before commit.
8. The §10 gates 1, 5 and 6 are run and their results recorded.
9. Screenshots of every shell state at three widths are in `docs/reviews/storefront/<date>/`.

## 12. Sequence and stop points

| Step | Work | Needs your approval |
|------|------|---------------------|
| 1 | Approve this plan and Q11-1 to Q11-11 (OD-02 recorded in principle, D-096; OD-15 closed, D-097) | **Yes** |
| 2 | Storefront dependencies (§9) and the Vite app | Covered by Q11-9 (and Q11-10 for Lighthouse) |
| 3 | Palette tokens and storefront base styles | Covered by Q11-3 |
| 4 | The cart migration, validated on disposable databases | **A review stop before commit** |
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
