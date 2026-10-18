# Sanéa Pret — Master Implementation Index

Status: **Proposed draft, pending reconciliation** · Date: 2026-10-18

## Important: source of the 19 phases

The request referred to a "required 19-phase master index". No such list was found in the GitHub repository, the local workspace, the conversation, `CLAUDE.md` files (none exist) or the installed skills. See `BLOCKERS.md` B-01.

The 19 phases below are therefore a **proposal** derived from the existing `implementation-roadmap.md` (Phases 0–6) and the other planning documents, split into reviewable units. When the canonical list is supplied, this index will be reconciled with it phase by phase and the differences recorded in `DECISION-LOG.md`.

This index supersedes `implementation-roadmap.md` for sequencing once approved. The roadmap's technical content is preserved, and each phase below cites the documents that hold the detail, so requirements are not duplicated here.

## Rules for every phase
1. A phase starts only after the previous phase's gate is approved by you.
2. A task is marked done only with evidence: a commit hash, a test run result, a screenshot path or a recorded approval.
3. No application code before Phase 3. No migrations before Phase 6 approval. No infrastructure before Phase 19 approval. No live payments before Phase 18 approval.
4. Quality gates for storefront phases are defined once in `design-system.md` §10 and referenced here, not repeated.

---

## Phase index

| # | Phase | Main outputs | Gate | Old roadmap phase |
|---|-------|-------------|------|-------------------|
| 1 | Planning and approval | Ten planning documents, this index, status, decision log, blockers | You approve the plan | 0 |
| 2 | Business decisions and brand inputs | Answers or accepted defaults for pre-database decisions; logo, palette, screen recording, first photography | Decisions recorded in `DECISION-LOG.md` | (missing) |
| 3 | Repository foundation and CI | npm workspaces, TypeScript, ESLint, Prettier, Vitest, Playwright, CI, `.env.example`, `.gitignore` | Install, lint, typecheck and empty test run pass in CI | 1 (part) |
| 4 | Shared contracts package | `packages/shared`: money helpers, enums, first Zod schemas | Unit tests for paise arithmetic and INR formatting pass | 1 (part) |
| 5 | API platform skeleton | Express app, config validation, logging, error shape, helmet, CORS, CSRF, rate limits, health endpoint | Startup fails on bad config; security header tests pass | 1 (part) |
| 6 | Database schema and migrations (core) | Prisma schema for catalogue, inventory, admin, audit, content; Docker PostgreSQL; first migration; fake seed | **Migration approval**; constraint tests pass | 1 (part) |
| 7 | Admin authentication, roles and audit | Admin sign-in, sessions, MFA, staff invites, RBAC middleware, audit log, admin app shell | RBAC table test passes for every role | 2 (part) |
| 8 | Catalogue, media and public catalogue API | Admin product, variant, category, collection and image management; image pipeline; public listing, filter and search API | A product with colour × size variants can be published and found by filter and search | 2 (part) |
| 9 | Inventory management | Stock levels, adjustments, movements, low-stock view; atomic reservation service with concurrency tests | Overselling concurrency tests pass | 2 (part) |
| 10 | Content management | Homepage blocks, hero slides, category pills, navigation, pages, draft and publish, Rehma Foundation verification workflow | Draft never served publicly; Rehma page 404 until Owner-verified | 3 (part) |
| 11 | Storefront shell and cart | Design tokens, base CSS, header with search, category pills, announcement bar, footer, cart API and cart drawer | Shell passes Taste lint and UI UX Pro Max checklist at 390, 768, 1440 | 3 (part), 4 (part) |
| 12 | **Landing page (Nishorama composition)** | Hero carousel with overlaid wordmark, New Ins, further product rows, tabbed products, footer | **Separate desktop and mobile screenshot review and your explicit approval** (see below) | 3 (part) |
| 13 | Browsing, product detail and enquiries | Listing pages, filters, search results, product page, size guide, enquiry form, WhatsApp links | E2E-4 and browsing journeys pass on desktop and mobile | 3 (part) |
| 14 | Customer accounts and wishlist | Sign-up, sign-in, password reset, addresses, wishlist, guest cart merge | E2E-8 passes; IDOR tests pass | 4 (part) |
| 15 | Checkout, orders, COD and mock payments | Checkout steps, server pricing, shipping and COD rules, reservations, order state machine, mock provider, webhooks, expiry jobs | E2E-1, E2E-2, E2E-3 pass; concurrency and webhook tests pass | 4 (part) |
| 16 | Admin operations and notifications | Order admin, packing slip, cancellations, refund records, enquiries inbox, dashboard, transactional email | E2E-2, E2E-5, E2E-6 pass | 4 (part), 3 (part) |
| 17 | Hardening | SEO and link previews, performance budgets, accessibility audit, security review, approved legal pages | Lighthouse and security criteria in old Phase 5 met | 5 |
| 18 | Live payment gateway | Chosen gateway adapter, sandbox tests, refunds, reconciliation | **Explicit gateway approval**; sandbox tests pass | 6 |
| 19 | Infrastructure, user acceptance and launch | Hosting plan, provisioning, backups, monitoring, user acceptance testing, launch checklist | **Explicit infrastructure approval**, then launch approval | 5 (part) |

### Why Phase 18 comes before Phase 19
The old roadmap put live payments after launch readiness. Launching before the gateway exists would mean launching COD-only, which contradicts BR-6 ("full checkout with prepaid and COD"). The safe default is to integrate the gateway before launch. If you prefer a COD-only soft launch, that is decision OD-22.

---

## Phase 12 in detail: landing page gate

**Mandatory composition, in this order** (BR-13):
1. Announcement bar (admin-edited, hidden when empty)
2. Minimal header with search, account, wishlist and bag
3. Category pills
4. Full-width hero with the oversized "SANÉA PRET" wordmark overlaid, campaign line, one CTA, slide indicators and pause control
5. New Ins, immediately below the hero
6. Further product rows
7. Tabbed products
8. Footer

Anything else on the landing page (the editorial band and Rehma Foundation teaser proposed in `design-system.md` §3) is off by default and needs your approval (OD-23).

**Inputs required before the gate can pass:** real campaign photography (desktop and mobile crops), at least eight real product photographs, the screen recording, and your logo decision. Placeholder imagery may be used to build, but the visual review cannot pass on placeholders (B-03, B-04, B-06).

**Screenshot review, as its own step:**

| Viewport | Width × height | Screenshots required |
|----------|---------------|---------------------|
| Desktop large | 1440 × 900 | First screen; full page |
| Desktop small | 1024 × 768 | First screen; full page |
| Tablet | 768 × 1024 | First screen; full page |
| Mobile | 390 × 844 | First screen; full page; hero slide 2; size picker open from New Ins |
| Mobile small | 360 × 800 | First screen; full page |

Screenshots are saved under `docs/reviews/landing/<date>/` with a side-by-side comparison of the reference's layout rhythm at desktop and mobile widths (layout only; no reference assets are reproduced in the product).

**Checks before asking for approval:** Taste `lint.mjs` and `inspect.mjs`, Taste critique rounds, motion audit, axe accessibility scan, landing acceptance tests in `testing-strategy.md` §5.

**Approval:** you review the screenshots and the running page and record "approved" or a list of changes in `DECISION-LOG.md`. Phase 13 does not start without that entry.

---

## Comparison with the existing roadmap

### Duplicated
| Item | Where | Resolution |
|------|-------|------------|
| Storefront quality gates | `design-system.md` §10, `implementation-roadmap.md` Phase 3, `testing-strategy.md` §5 | Kept in `design-system.md` §10 and `testing-strategy.md` §5 only; this index references them. |
| Two sequencing documents | `implementation-roadmap.md` and this index | This index becomes the single sequence after approval. A pointer was added to the top of the roadmap. |

### Contradictory
| Item | Conflict | Proposed resolution |
|------|----------|--------------------|
| Bag control at the landing gate | Old Phase 3 acceptance requires a working bag, but the cart was in old Phase 4. | Cart API and drawer moved into Phase 11, before the landing gate. |
| Account and wishlist controls at the landing gate | Old Phase 3 requires them to work, but customer accounts were in old Phase 4. | OD-24. Default: at the landing gate they open real routes (sign-in page, wishlist page with a sign-in prompt); full behaviour is accepted in Phase 14. |
| Search at the landing gate | Header search must work at the landing gate, but search results pages were scheduled with listings. | Header search and results page moved into Phase 11. |
| Launch before live payments | Old Phase 5 "launch readiness" came before old Phase 6 "live payments", contradicting BR-6. | Gateway is Phase 18, launch is Phase 19 (OD-22). |
| Landing page sections | `design-system.md` §3 inserts an editorial band between New Ins and the next row, and a Rehma teaser before the footer, which is outside the mandated composition. | Both off by default; your call at the landing gate (OD-23). |
| Admin dashboard timing | Old Phase 2 implied dashboard content (pending COD, orders) before orders exist. | Dashboard moved to Phase 16. |
| Order total check constraint | `database-design.md` assumes GST-inclusive prices; this depends on OD-05. | Constraint finalised in Phase 6 only after OD-05 is answered. |

### Missing from the old roadmap
- A phase for business decisions and brand inputs before database work (now Phase 2).
- The enquiries admin inbox and the admin dashboard (now Phase 16).
- Rehma Foundation verification workflow as an explicit task (now Phase 10).
- Transactional email provider and templates (now Phase 16).
- A real-content step: real product data and photography are needed for the landing review (Phase 2 inputs, B-06).
- User acceptance testing, backups, monitoring and a launch checklist (now Phase 19).
- Planned dependencies not listed in `system-architecture.md` §7: a TOTP library for MFA, the job runner (`pg-boss` or a custom table runner), and an email client. To be added to the dependency list at Phase 3 with reasons.
- Evidence rules for marking work done (now in this index).

### Premature in the old roadmap
| Item | Why premature | Moved to |
|------|--------------|----------|
| Prisma schema for **all** R1 entities in old Phase 1 | Orders, payments and tax columns depend on OD-05, OD-07 and OD-10. | Core schema in Phase 6; order, payment and customer tables in later migrations (Phases 14, 15). |
| Admin homepage and page editors bundled with storefront landing in old Phase 3 | Mixes back-office and storefront work under one gate. | Phase 10 (content) before Phase 11 and 12. |
| Duration estimates | Made before any velocity data. | Removed from this index; to be re-estimated after Phase 3. |

### Preserved without change
All technical decisions in `system-architecture.md`, `system-design.md`, `database-design.md`, `api-specification.md` and `security-design.md` are preserved. No real conflict was found that requires changing the stack, the module boundaries, the stock rules, the order lifecycle or the API surface.
