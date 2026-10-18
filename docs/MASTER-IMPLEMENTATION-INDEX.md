# Sanéa Pret — Master Implementation Index

Status: **Approved as the canonical implementation roadmap (D-028, 2026-10-18).** · Last updated: 2026-10-18

This is the **only** implementation sequence for the project. `implementation-roadmap.md` is a historical reference: it shows the earlier seven-phase plan and maps each old phase to the phases below. Wherever the two differ, this index applies.

All phase numbers anywhere in `docs/` refer to this index unless they are explicitly labelled "old roadmap".

## Source of the 19 phases

The 19 phases were derived from the old roadmap and the planning documents, and you approved them as canonical on 2026-10-18 (D-028). Changes to phases, scopes or gates need a new `DECISION-LOG.md` entry.

## Rules for every phase

1. A phase starts only after the previous phase's gate is approved by you and recorded in `DECISION-LOG.md`.
2. A task is complete only with evidence: a commit hash, a command and its output, a screenshot path, or a recorded approval.
3. No application source code before Phase 3. No database migration before the Phase 6 gate. No live payment configuration before the Phase 18 gate. No infrastructure before the Phase 19 gate.
4. Storefront quality gates are defined once, in `design-system.md` §10. Test cases are defined once, in `testing-strategy.md`. Phases reference them and do not restate them.
5. Each phase's scope is exclusive. Work listed under one phase is not repeated in another.
6. **UI deliverables** (admin screens, storefront screens, stylesheets) start only after TD-001 and TD-002 are decided through task ST-01. **API, database and other backend deliverables never wait for a styling decision.** A phase with both kinds passes its gate when both are done.

---

## Phase summary

| # | Phase | Depends on | Gate type |
|---|-------|-----------|-----------|
| 1 | Planning and approval | — | Your approval of the plan |
| 2 | Business decisions and brand inputs | 1 | Your answers recorded |
| 3 | Repository foundation and CI | 2 | Your approval of the setup diff |
| 4 | Shared contracts package | 3 | Review of test evidence |
| 5 | API platform skeleton | 4 | Review of test evidence |
| 6 | Core database schema | 5, and decisions OD-04, OD-05, OD-10, OD-11 | **Your migration approval** |
| 7 | Admin authentication, roles and audit (API only) | 6 | Review of test evidence |
| 8 | Catalogue, media, catalogue API and admin shell | 7; TD-001 and TD-002 decided for UI deliverables | Review of test evidence and screenshots |
| 9 | Inventory and stock reservation | 8; TD-001 and TD-002 decided for UI deliverables | Review of concurrency evidence |
| 10 | Content management | 7, 8; TD-001 and TD-002 decided for UI deliverables | Review of test evidence |
| 11 | Storefront shell, search and cart | 8, 9, 10; TD-001 and TD-002 decided for UI deliverables | Review of screenshots and tests |
| 12 | Landing page | 11 | **Your visual approval** |
| 13 | Browsing, product detail and enquiries | 12 | Review of tests and screenshots |
| 14 | Customer accounts and wishlist: **deferred, not in release one (D-034)** | — | Needs a new approval before it is scheduled |
| 15 | Checkout, orders, COD and mock payments | 9, 13, decisions in B-07 | Review of end-to-end evidence |
| 16 | Admin operations and notifications | 15 | Review of end-to-end evidence |
| 17 | Hardening and legal content | 16 | Review of audit results |
| 18 | Live payment gateway | 17, OD-06 | **Your gateway approval** |
| 19 | Infrastructure, acceptance testing and launch | 18, OD-18 | **Your infrastructure approval, then launch approval** |

---

## Phases

### Phase 1 — Planning and approval
- **Scope:** planning documents, this index, tracking documents, `CLAUDE.md`, `.gitignore`, `README.md`. No code.
- **Depends on:** nothing.
- **Deliverables:** the ten specifications in `docs/`; `PROJECT-STATUS.md`, `DECISION-LOG.md`, `BLOCKERS.md`; this index; root `CLAUDE.md`, `.gitignore`, `README.md`.
- **Verification:** files exist in git; no application files exist; `.gitignore` rules checked with `git check-ignore`.
- **Gate:** you approve the planning documents and this index. **Passed 2026-10-18 (D-028).**

### Phase 2 — Business decisions and brand inputs
- **Scope:** collecting answers, not building. Decisions needed before the database: OD-04, OD-05, OD-10, OD-11. Brand inputs: logo decision (OD-02), screen recording (OD-01), first real photography (B-06).
- **Depends on:** Phase 1.
- **Deliverables:** answers or explicitly accepted defaults recorded in `DECISION-LOG.md`; reference files placed under `docs/reference/` if supplied.
- **Verification:** each decision has a dated entry with you as the source.
- **Gate:** you confirm the recorded answers. Brand inputs may arrive later, but they block Phases 11 and 12.

### Phase 3 — Repository foundation and CI
- **Scope:** npm workspaces with empty `apps/storefront`, `apps/admin`, `apps/api`, `packages/shared` packages; TypeScript base config; ESLint and Prettier; Vitest and Playwright configuration; CI workflow (lint, typecheck, test, `npm audit`, secret scan); `.env.example`; `e2e/` folder. No features.
- **Depends on:** Phase 2.
- **Deliverables:** root `package.json`, lock file, configs, CI file. Each dependency listed with its reason, matching `system-architecture.md` §7.
- **Verification:** `npm install`, `npm run lint`, `npm run typecheck` and `npm test` succeed locally and in CI.
- **Gate:** you approve the dependency list **before** installation, then the resulting diff.

### Phase 4 — Shared contracts package
- **Scope:** `packages/shared`: paise arithmetic, INR formatting, enums (order status, payment method, roles), first Zod schemas (address, PIN code, phone, money).
- **Depends on:** Phase 3.
- **Deliverables:** the package with unit tests.
- **Verification:** unit tests for money and formatting pass (`testing-strategy.md` §3 Money).
- **Gate:** you review the test output.

### Phase 5 — API platform skeleton
- **Scope:** Express app, configuration validation, logging, error shape, security headers, CORS, CSRF, rate limiting, health endpoint. No business modules.
- **Depends on:** Phase 4.
- **Deliverables:** `apps/api` platform layer with tests.
- **Verification:** the API refuses to start with invalid configuration; header, CORS and CSRF tests pass.
- **Gate:** you review the test output.

### Phase 6 — Core database schema
- **Scope:** Prisma schema and first migration for catalogue, inventory, admin users, sessions, audit and content tables only. Docker Compose for local PostgreSQL. Development seed with obviously fake data. Customer tables arrive in Phase 14; order and payment tables in Phase 15.
- **Depends on:** Phase 5 and answers to OD-04, OD-05, OD-10, OD-11.
- **Deliverables:** `prisma/schema.prisma`, migration files, seed script, compose file.
- **Verification:** the stock check constraints reject invalid values in integration tests; the seed loads only `TEST-` data.
- **Gate:** **you approve the schema and migration before it is run.**

### Phase 7 — Admin authentication, roles and audit
- **Scope:** backend security only: admin sign-in API, sessions, MFA, staff invites, role middleware, audit log. No admin UI; the admin shell is in Phase 8.
- **Depends on:** Phase 6. Not on any styling decision.
- **Deliverables:** `auth` and `audit` API modules.
- **Verification:** the role matrix test (`security-design.md` §4) passes for every role through API tests; lockout and session tests pass.
- **Gate:** you review the test output.

### Phase 8 — Catalogue, media and catalogue API
- **Scope:** backend: products, variants, categories, collections, images, image processing, public catalogue, filter and search endpoints. UI: the shared design tokens (TD-002), the admin app shell (sign-in screen and navigation, moved from Phase 7), and admin catalogue screens.
- **Depends on:** Phase 7. UI deliverables also depend on TD-001 and TD-002 being decided; backend deliverables do not.
- **Deliverables:** `catalogue`, `search` and `media` modules; shared token files; admin shell; admin catalogue screens.
- **Verification:** a product with colour × size variants and images can be published and found by filter and search; admin sign-in works through the shell for every role; token checks from TD-002 pass.
- **Gate:** you review the test output and admin screenshots.

### Phase 9 — Inventory and stock reservation
- **Scope:** stock levels, adjustments, movements, low-stock view, the atomic reservation service and its expiry job. No checkout.
- **Depends on:** Phase 8. Admin inventory screens also depend on TD-001 and TD-002; the `inventory` module does not.
- **Deliverables:** `inventory` module; admin inventory screens.
- **Verification:** the overselling and movement tests in `testing-strategy.md` §3 pass.
- **Gate:** you review the concurrency test output.

### Phase 10 — Content management
- **Scope:** content blocks (announcement bar, hero slides, category pills, product rows, tabbed grid, footer), navigation, pages, draft and publish, Rehma Foundation Owner-verified publishing.
- **Depends on:** Phases 7 and 8. Admin content editors also depend on TD-001 and TD-002; the `content` module does not.
- **Deliverables:** `content` module; admin content editors.
- **Verification:** drafts are never served publicly; the Rehma Foundation page returns 404 until the Owner publishes it with verification.
- **Gate:** you review the test output.

### Phase 11 — Storefront shell, search and cart
- **Scope:** storefront base styles on the shared tokens from Phase 8; header with search suggestions and a search results page; category pills; announcement bar; footer; cart API and cart drawer for guests. No landing-page sections.
- **Depends on:** Phases 8, 9 and 10. Storefront UI also depends on TD-001 and TD-002; the cart API does not. Brand input OD-02 or acceptance of the typeset-wordmark default.
- **Deliverables:** storefront shell; `cart` module.
- **Verification:** `design-system.md` §10 gates 1, 5 and 6 at 390, 768 and 1440 px; cart tests pass.
- **Gate:** you review screenshots and test output.

### Phase 12 — Landing page
- **Scope:** the mandatory Nishorama composition, in this order:
  1. announcement bar
  2. minimal header with search and bag (account and wishlist controls are not shown in release one, D-034)
  3. category pills
  4. full-width hero with the oversized "SANÉA PRET" wordmark overlaid, campaign line, one CTA, slide indicators and a pause control
  5. New Ins, immediately below the hero
  6. further product rows
  7. tabbed products
  8. footer

  Sections outside this list (editorial band, Rehma Foundation teaser) are off unless you approve them (OD-23). OD-24 is superseded by D-034: account and wishlist controls are not shown.
- **Depends on:** Phase 11. Real campaign photography, at least eight real product photographs and the screen recording (B-03, B-06).
- **Deliverables:** landing page; screenshots under `docs/reviews/landing/<date>/`.
- **Verification:** all six gates in `design-system.md` §10 and the landing tests in `testing-strategy.md` §5. Screenshots:

  | Viewport | Size | Screenshots |
  |----------|------|-------------|
  | Desktop large | 1440 × 900 | First screen; full page |
  | Desktop small | 1024 × 768 | First screen; full page |
  | Tablet | 768 × 1024 | First screen; full page |
  | Mobile | 390 × 844 | First screen; full page; hero slide 2; size picker opened from New Ins |
  | Mobile small | 360 × 800 | First screen; full page |

  A side-by-side comparison with the reference covers layout rhythm only. No reference assets enter the product.
- **Gate:** **you review the desktop and mobile screenshots and the running page, and record "approved" or a change list in `DECISION-LOG.md`.** The gate cannot pass on placeholder imagery (D-120). Phase 13 does not start without this entry.

### Phase 13 — Browsing, product detail and enquiries
- **Scope:** collection and category listings with filters and sorting, product detail page with colour and size selection, size guide, enquiry form, WhatsApp links and click logging.
- **Depends on:** Phase 12.
- **Deliverables:** storefront browsing routes; `enquiries` module (public side).
- **Verification:** end-to-end journey E2E-4 and the browsing steps of E2E-1 pass on desktop and mobile; `design-system.md` §10 gates.
- **Gate:** you review tests and screenshots.

### Phase 14 — Customer accounts and wishlist (deferred)
- **Status:** **Deferred to a later release (D-034).** Approved scope change OD-26. Not part of release one; it needs a new approval before it is scheduled. Phase 15 no longer depends on it.
- **Original scope, kept for the later release:**
  - **Scope:** customer tables migration, sign-up, sign-in, password reset, addresses, wishlist, guest cart merge.
  - **Depends on:** Phase 11.
  - **Deliverables:** `customers` module; account routes.
  - **Verification:** E2E-8 and the cross-account access tests pass.
  - **Gate:** you review the test output.

### Phase 15 — Checkout, orders, COD and mock payments
- **Scope:** order and payment tables migration, checkout steps, server pricing, shipping and COD rules, reservations at checkout, order state machine, mock payment provider, webhook pipeline, reservation and COD expiry jobs.
- **Depends on:** Phases 9 and 13, and the decisions in B-07. (Phase 14 is deferred, D-034.)
- **Deliverables:** `checkout`, `orders` and `payments` modules; checkout routes.
- **Verification:** E2E-1, E2E-2 (storefront part) and E2E-3 pass; payment, COD and order-lifecycle tests in `testing-strategy.md` §3 pass.
- **Gate:** you review the end-to-end output.

### Phase 16 — Admin operations and notifications
- **Scope:** admin order list and detail, status transitions, packing slip, cancellation, refund records, enquiries inbox, admin dashboard, transactional email through a log provider in development.
- **Depends on:** Phase 15.
- **Deliverables:** admin operations screens; `notifications` module.
- **Verification:** E2E-2 (admin part), E2E-5 and E2E-6 pass.
- **Gate:** you review the end-to-end output.

### Phase 17 — Hardening and legal content
- **Scope:** SEO and link previews (OD-14), performance budgets, accessibility audit, security review, approved legal and policy text, analytics decision (OD-20).
- **Depends on:** Phase 16; legal input OD-12.
- **Deliverables:** audit reports; approved policy pages.
- **Verification:** Lighthouse mobile performance ≥ 85 and accessibility ≥ 95 on landing, listing, product and checkout; no high or critical `npm audit` findings; security checklist complete.
- **Gate:** you review the audit results and approve the legal text.

### Phase 18 — Live payment gateway
- **Scope:** the gateway adapter behind the payment interface, sandbox testing, gateway refunds, reconciliation job.
- **Depends on:** Phase 17; OD-06 answered.
- **Deliverables:** gateway adapter and tests.
- **Verification:** sandbox success, failure, refund and webhook replay tests pass; the mock provider is refused in production mode.
- **Gate:** **you explicitly approve the gateway before any live key is configured.**

### Phase 19 — Infrastructure, acceptance testing and launch
- **Scope:** hosting plan, provisioning, secrets management, backups and restore test, monitoring, user acceptance testing, launch checklist.
- **Depends on:** Phase 18; OD-18 answered.
- **Deliverables:** infrastructure plan, then provisioned environments, then the launch checklist.
- **Verification:** restore test succeeds; user acceptance sign-off recorded.
- **Gate:** **you approve the infrastructure plan before provisioning, and approve launch separately.**

---

## Separately approved tasks

These tasks sit outside the numbered phases. Each runs only after its own explicit approval and does not change any phase's scope or gate.

### ST-01 — Styling evaluation (TD-001, TD-002)
- **When:** any time after the Phase 3 gate (it needs the Phase 3 tooling). It must be decided before the first UI deliverable, the admin shell in Phase 8. It does not block Phases 4 to 7 or any backend deliverable.
- **Scope:** the comparative experiment described in `technology-decisions.md` TD-001 (CSS Modules, Tailwind v4, hybrid) on a throwaway branch, plus the TD-002 token check. No production code; the branch is not merged.
- **Approvals:** (1) you approve running ST-01, including installing `tailwindcss` and `@tailwindcss/vite` on the throwaway branch only; (2) you approve the TD-001 and TD-002 decisions from the recorded results.
- **Deliverables:** measurements and a recommendation added to TD-001 and TD-002; a `DECISION-LOG.md` entry with your decision.
- **Verification:** the measurements listed in TD-001; the token checks listed in TD-002.
- **Until approved:** no Tailwind package is installed anywhere.

## Reconciliation with the old roadmap

| Old roadmap phase | Now covered by | Notes |
|-------------------|----------------|-------|
| 0 Planning | 1 | Unchanged. |
| 1 Foundation | 3, 4, 5, 6 | Split. The full schema is no longer built at once (D-119). |
| 2 Catalogue, inventory and admin core | 7, 8, 9 | Dashboard moved to 16; admin shell in 8. |
| 3 Storefront landing and browsing | 10, 11, 12, 13 | Content editors moved to 10; cart and search moved to 11; landing has its own gate in 12. |
| 4 Cart, checkout, orders and COD | 11 (cart), 14, 15, 16 | Split. |
| 5 Hardening and launch readiness | 17, 19 | Launch moved after the gateway (D-118). |
| 6 Live payments | 18 | Moved before launch. |
| (none) | 2 | New: decisions and brand inputs. |

### Contradictions resolved
| Old roadmap text | Resolution |
|------------------|------------|
| Old Phase 1 builds the Prisma schema for all entities and runs the first migration. | Core schema only in Phase 6; customers in 14; orders and payments in 15 (D-119). |
| Old Phase 3 acceptance requires working account, wishlist and bag, while cart and accounts were in old Phase 4. | Cart and search in Phase 11; account and wishlist at the landing gate follow OD-24. |
| Old Phase 5 launch readiness before old Phase 6 live payments. | Gateway in 18, launch in 19 (D-118, OD-22). |
| `design-system.md` §3 adds an editorial band and a Rehma teaser to the landing page. | Off by default (OD-23). |
| Duration estimates in the old roadmap. | Not carried over; re-estimate after Phase 3. |

### Additions with no old-roadmap equivalent
Phase 2; enquiries inbox and dashboard (16); Rehma Foundation verification workflow (10); transactional email (16); user acceptance testing, backups and monitoring (19); evidence rules (above). Dependencies missing from `system-architecture.md` §7 (a TOTP library, the job runner, an email client) are to be added to the Phase 3 dependency list with reasons.

### Preserved
All technical decisions in `system-architecture.md`, `system-design.md`, `database-design.md`, `api-specification.md` and `security-design.md` are unchanged.
