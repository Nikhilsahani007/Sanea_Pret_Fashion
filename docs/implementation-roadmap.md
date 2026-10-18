# Sanéa Pret — Implementation Roadmap

Status: Draft for approval · Date: 2026-10-18

> **Sequencing note (2026-10-18):** `MASTER-IMPLEMENTATION-INDEX.md` proposes a 19-phase sequence that replaces the phase order below once approved. This file is kept for its scope and acceptance detail. Differences are listed in the index's comparison section.

Each phase ends with a review. The next phase starts only after approval. Durations are rough estimates for one full-time developer with AI assistance and will be revised after Phase 1.

## Phase 0 — Planning (this phase)
**Deliverables:** the ten documents in `docs/`, Taste direction sheet.
**Acceptance:**
- [ ] You approve the architecture, data model and design direction.
- [ ] Open decisions marked "needed before Phase 1" are answered or the defaults are accepted.

## Phase 1 — Foundation (≈ 1 week)
**Scope:** npm workspaces monorepo; TypeScript, ESLint, Prettier; `packages/shared` with money utils and first schemas; Express app skeleton with config validation, logging, error handling, health endpoint, helmet, CORS; Prisma schema for all R1 entities; local PostgreSQL via Docker Compose; first migration (after approval); dev-only seed with obviously fake data; Vitest and Playwright set up; CI workflow (lint, typecheck, test, audit, gitleaks); `.env.example`.
**Acceptance:**
- [ ] `npm install && npm run dev` starts API, storefront and admin locally.
- [ ] `npm test` runs unit and integration tests against Docker PostgreSQL.
- [ ] Startup fails with a clear message when a required variable is missing.
- [ ] Database check constraints for stock exist and are tested.

## Phase 2 — Catalogue, inventory and admin core (≈ 2 weeks)
**Scope:** admin auth (Argon2id, sessions, CSRF, MFA for Owner/Manager), RBAC middleware, audit log; admin CRUD for categories, collections, products, variants, images (upload pipeline); inventory levels, adjustments, movements, low-stock view; public catalogue, search and filter endpoints.
**Acceptance:**
- [ ] An Owner can invite staff; each role sees only permitted actions, verified by the RBAC table test.
- [ ] A product with colour × size variants, images per colour and stock can be created and published.
- [ ] Listing filters by size, colour, price and category return correct results with facets.
- [ ] Every stock change produces a movement and an audit entry.

## Phase 3 — Storefront landing and browsing (≈ 2 weeks)
**Scope:** design tokens and base CSS; header, category pills, announcement bar; hero carousel with wordmark overlay; New Ins row and product rows; tabbed grid; footer; listing, search and product pages; content blocks and pages from the CMS (admin editors for homepage, navigation and pages); Rehma Foundation placeholder; enquiry form and WhatsApp links.
**Acceptance (includes the mandatory reference criteria):**
- [ ] Landing page has the same overall structure and browsing rhythm as nishorama.com (header → pills → hero carousel → New Ins → further rows → tabs → footer).
- [ ] Hero dominates the first viewport; slides, indicators and pause work; carousel respects focus and reduced motion.
- [ ] Category pills, search, account, wishlist and bag are functional.
- [ ] New Ins sits directly below the hero on desktop and mobile.
- [ ] Polished at 1440, 1024, 768, 390 and 360 px with no horizontal scroll.
- [ ] Only Sanéa Pret branding and approved content are used; placeholders are clearly marked.
- [ ] Taste lint and inspect pass (documented exceptions only), motion audit done, axe shows no serious issues.
- [ ] **Visual review against the reference and the screen recording is signed off by you before Phase 4 starts.**

## Phase 4 — Cart, checkout, orders and COD (≈ 2–3 weeks)
**Scope:** cart with guest token and merge; checkout steps; server pricing; shipping and COD rules; atomic reservations; order creation; mock payment provider and webhook pipeline; reservation and COD expiry jobs; order admin (list, detail, transitions, notes, packing slip, cancellation, refund records); customer accounts (sign-up, sign-in, orders, addresses, wishlist); transactional emails through a log provider.
**Acceptance:**
- [ ] Concurrency tests prove no overselling.
- [ ] Prepaid (mock) and COD journeys pass end to end on desktop and mobile.
- [ ] Order state machine rejects invalid transitions; all transitions are logged.
- [ ] Payment confirmation happens only through verified webhook or server query.
- [ ] Checkout works one-handed at 360 px with correct mobile keyboards and autofill.

## Phase 5 — Hardening and launch readiness (≈ 1–2 weeks)
**Scope:** SEO (meta, sitemap, structured data, link-preview rendering or SSR per OD-14); performance budgets; accessibility audit; security review; legal pages with approved text; analytics (consent-aware); backup and restore plan; deployment design for approval.
**Acceptance:**
- [ ] Lighthouse mobile: performance ≥ 85, accessibility ≥ 95 on landing, listing, product, checkout.
- [ ] Security checklist in `security-design.md` complete; no high or critical `npm audit` findings.
- [ ] Legal and policy text approved by you.
- [ ] Infrastructure plan approved before anything is provisioned.

## Phase 6 — Live payments (only after explicit approval)
**Scope:** chosen gateway adapter behind `PaymentProvider`; sandbox testing; refunds through the gateway; reconciliation job; go-live checklist.
**Acceptance:**
- [ ] Sandbox success, failure, refund and webhook replay tests pass.
- [ ] Gateway keys stored in the secret manager; mock provider disabled in production.

## Later (R2 candidates)
Courier API integration, WhatsApp Business API notifications, discount codes, reviews (real only), phone OTP sign-in, international shipping, SSR if not done.
