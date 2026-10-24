# Phase 11 Plan — Storefront Shell, Search and Cart

Status: **Evidence ready, awaiting your approval (D-079).** Date: 2026-10-24, branch `claude/amazing-faraday-21s6uc`.

## Scope (index Phase 11)
Storefront base styles on the shared tokens; header with search suggestions and a search results page; category pills; announcement bar; footer; cart API and cart drawer for guests. No landing-page sections (Phase 12).

## Migration `20261024120000_guest_cart` (needs your approval before any kept database)
- **Generated:** tables `cart` (id, token_hash unique, created_at, updated_at, expires_at; index on expires_at) and `cart_item` (cart_id + variant_id key, quantity, created_at); `cart_item.cart_id` cascades with the cart (added to the approved cascade list), `variant_id` restricts.
- **Handwritten CHECKs:** token hash is 32 bytes; expiry after creation; quantity 1 to 10 (D-115).
- No `customer_id` column: accounts are deferred (D-034) and arrive with their own migration.
- Applied only to disposable databases; drift check "No difference detected".

## Implementation
| Area | Files |
|------|-------|
| Cart API | `apps/api/src/modules/cart/{service,router}.ts`: `GET /cart` (no cart or cookie is created by reading), `POST /cart/items`, `PATCH`/`DELETE /cart/items/:variantId`; cookie `__Host-sp_cart` (HttpOnly, Secure, SameSite=Lax, 30 days), only the SHA-256 hash stored; every read re-priced from current variants with live stock warnings (`UNAVAILABLE`, `SOLD_OUT`, `ONLY_N_LEFT`); raising a quantity above free stock → `409 OUT_OF_STOCK` with each line's real availability; above 10 → `409 CONFLICT LINE_LIMIT`; draft or inactive items refused; nothing reserved (SR-2); expired carts deleted by the existing one-minute job; writes rate-limited 120/min per IP and CSRF-protected |
| Shared | `targetHref`: categories at `/shop/:slug`, pages at `/:slug`, `policy-…` pages at `/policies/:slug`, matching the route list in `project-requirements.md` (D-147) |
| Catalogue | listing summaries gain `priceVaries`, so cards say "From" only when variant prices differ |
| Storefront app | `apps/storefront`: tokens and base styles; `Layout` (skip link, announcement bar, sticky header with wordmark, header menu, search, bag with live count, category pills, footer with link groups, contact details from settings and the full-width wordmark); `SearchBox` (ARIA 1.2 combobox with suggestions); `CartDrawer` (modal `<dialog>`: focus contained, Escape closes, focus returns to the bag button); `CartLines`; `ProductCard` (4:5, hover image only when one exists, "New", "Limited" or "Sold out" label); pages: search results with "Show more", bag, content pages with an allow-listed rich-text renderer, not found |
| Demo data | `apps/api/src/db/demo-seed.ts` (`npm run db:seed:demo`): TEST categories, colours, 12 TEST products with stock, a TEST collection, published TEST homepage blocks and placeholder pages; images are generated grey cards reading "TEST PLACEHOLDER — not a product photograph". Development and end-to-end only; refuses production and non-loopback databases (D-148) |

## Verification
| Check | Result |
|-------|--------|
| `cart.db-test.ts` | 12 passed: no cart created by reading; cookie attributes; token hash only; re-pricing; CSRF and unknown fields; no reservation on add; out-of-stock and line-limit refusals; drafts refused; warnings on falling stock and withdrawn items; lowering allowed while short; update and remove; no cart without the cookie; forged tokens ignored; expiry and deletion with lines; database CHECK |
| End-to-end `storefront-shell.spec.ts` | 8 passed: shell at 1440, 768 and 390 px (announcement, wordmark link, five pills, footer, footer wordmark within the page, no horizontal scroll, mobile menu); keyboard search suggestions and the results page; empty results message; bag drawer (count in the button name, re-priced totals, Escape closes, focus returns), out-of-stock refusal, bag page removal; published policy page renders; the unverified Rehma page shows Not found; skip link |
| Budget | Storefront initial JS 116.3 kB gzip (budget 170 kB, `system-architecture.md` §6); Zod not in the bundle |
| Screenshots | `docs/reviews/storefront-shell/2026-10-24/` (shell at 1440, 768, 390; search suggestions; search results; bag drawer) |

Defect found by the screenshots and fixed: the footer wordmark overflowed at 1440 px; the monument size is now derived from the available width (`--sp-step-monument`), and the end-to-end test checks the wordmark stays inside the page at all three widths.

## Not done here
- `design-system.md` §10 gates 1 (Taste `lint.mjs`, `inspect.mjs`) and 6 (Lighthouse) run with the landing page in Phase 12, where the page composition exists; gate 5 (accessibility checklist) is covered above by role-based tests, without an automated axe scan (no axe package is approved).
