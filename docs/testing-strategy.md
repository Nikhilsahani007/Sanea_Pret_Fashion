# Sanéa Pret — Testing Strategy

Status: Draft for approval · Date: 2026-10-18

## 1. Principles
- Business-critical logic (money, stock, order state, payments, authorisation) is tested at the unit and integration level against a real PostgreSQL database, not mocks.
- Every bug fixed in these areas gets a regression test.
- Tests run on every pull request. A failing test blocks merge.

## 2. Tooling

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Vitest | `packages/shared` (money, schemas), API services with pure logic (pricing, COD eligibility, order transitions) |
| API integration | Vitest + Supertest + PostgreSQL in Docker | Routes, transactions, constraints, auth, RBAC |
| Component | Vitest + Testing Library | Size and colour selectors, cart drawer, carousel controls, checkout forms |
| End-to-end | Playwright (Chromium, WebKit, mobile viewport) | Full shopper and admin journeys |
| Accessibility | axe-core in Playwright, plus manual keyboard and screen-reader passes | Every page template |
| Visual | Playwright screenshots at 390, 768, 1440; Taste `inspect.mjs` | Landing page and key templates |
| Performance | Lighthouse CI on a throttled mobile profile | Landing, listing, product, checkout |
| Security | `npm audit`, gitleaks, targeted tests for IDOR, CSRF, rate limits | CI |

Integration tests get a fresh database per test file (template database clone) for speed and isolation.

## 3. Critical test cases

### Money and pricing
- Paise arithmetic never produces fractions; formatting matches `en-IN` (`₹1,29,999`).
- Server ignores client-sent prices; changed prices return `409 PRICE_CHANGED`.
- Totals equal subtotal − discount + shipping + COD fee for every combination.

### Inventory and overselling
- Two concurrent checkouts for the last unit: exactly one succeeds, the other gets `OUT_OF_STOCK`.
- Fifty concurrent checkouts for ten units: exactly ten succeed; `onHand − reserved` never goes negative.
- Multi-line cart where one line is short: whole reservation rolls back.
- Reservation expiry releases stock; payment arriving after expiry re-reserves or flags and refunds (SR-10).
- Cancellation before dispatch releases stock; dispatch decrements both counters.
- Admin adjustment cannot set `onHand` below `reserved`.
- Database check constraints reject invalid states even through direct SQL.
- Every stock change produces exactly one movement row.

### Order lifecycle
- Every allowed transition succeeds; every other transition returns `409 INVALID_TRANSITION`.
- Status events record actor and time.
- Unconfirmed COD orders expire after the configured window and release stock.

### Payments
- Mock provider success, failure and timeout paths.
- Invalid webhook signature rejected; duplicate event processed once; amount mismatch flags the order.
- Browser redirect without webhook does not confirm the order.
- Idempotency key reuse returns the original order; reuse with a different body returns `409 IDEMPOTENCY_CONFLICT`.
- Mock provider refuses to load in production mode.

### COD
- Eligibility by order value, PIN code rule and customer COD block.
- `COD_NOT_AVAILABLE` returned when ineligible even if the client sends COD.

### Auth and authorisation
- Each role can and cannot reach the endpoints in the `security-design.md` §4 matrix (table-driven test).
- Customer A cannot read customer B's order, address or wishlist.
- Guest order status requires the access token.
- Lockout after failed attempts; reset tokens single-use and expiring.
- CSRF token missing or wrong → 403.

### Content
- Draft content is never served publicly.
- Rehma Foundation page returns 404 until the Owner publishes with verification; non-Owners cannot publish it.
- CMS rich text with script content is rejected or rendered inert.

### Enquiries
- Validation, consent requirement, honeypot and rate limit.
- WhatsApp link encodes product name, SKU, variant and URL correctly.

## 4. End-to-end journeys (Playwright)

| ID | Journey | Viewports |
|----|---------|-----------|
| E2E-1 | Landing → category pill → filter → product → add to bag → prepaid checkout with mock success → confirmation | Desktop, mobile |
| E2E-2 | Same with COD → admin confirms → packed → shipped → delivered | Desktop |
| E2E-3 | Prepaid with mock failure → retry payment → success | Mobile |
| E2E-4 | Product enquiry form and WhatsApp link | Mobile |
| E2E-5 | Admin edits hero slide, publishes, storefront shows it | Desktop |
| E2E-6 | Admin adjusts stock to zero; storefront shows "Sold out" and blocks checkout | Desktop |
| E2E-7 | Keyboard-only: landing carousel pause, pills, add to bag, checkout | Desktop |
| E2E-8 | Guest cart merges on sign-in | Desktop |

## 5. Landing-page acceptance tests
- Hero fills the first viewport below the header at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 and 360 × 800.
- Wordmark never wraps unexpectedly or overflows horizontally at any tested width.
- Carousel: indicators change the slide, the pause button stops auto-advance, focus inside stops it, reduced motion disables auto-advance.
- New Ins is the first section after the hero at every width.
- Category pills, search, account, wishlist and bag are all keyboard-reachable and functional.
- No horizontal page scroll at any width.

## 6. Coverage targets
Line coverage is a guide, not a goal: ≥ 90% for `inventory`, `checkout`, `orders`, `payments` and `auth` modules; ≥ 70% elsewhere in the API.
