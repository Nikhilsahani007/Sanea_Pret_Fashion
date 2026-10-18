# Sanéa Pret — Decision Log

Date started: 2026-10-18

Each entry has a status:
- **Confirmed**: stated by you in a brief or message. Source quoted.
- **Proposed**: recommended in the planning documents, not yet approved by you.
- **Observed**: inferred from repository evidence, not stated by you. Needs confirmation.
- **Superseded**: replaced by a later entry.

Open questions that are not yet decisions live in `open-decisions.md`.

## Confirmed by you

| ID | Decision | Source |
|----|----------|--------|
| D-001 | Brand "Sanéa Pret", tagline "Effortless Elegance". | Kickoff brief |
| D-002 | India only, INR only for the first release. | Kickoff brief |
| D-003 | Catalogue with collections, product details, search and filtering. | Kickoff brief |
| D-004 | Full checkout with prepaid and cash on delivery. | Kickoff brief |
| D-005 | Payment architecture designed now; live gateway deferred until explicit approval. | Kickoff brief |
| D-006 | Inventory per variant (size and colour), with no overselling. | Kickoff brief |
| D-007 | Website and WhatsApp product enquiries. | Kickoff brief |
| D-008 | Admin manages products, pricing, descriptions, homepage and catalogue content, inventory and orders. | Kickoff brief |
| D-009 | Storefront content editable without code changes. | Kickoff brief |
| D-010 | Rehma Foundation page with no unverified charity, equity, donation or legal claims. | Kickoff brief |
| D-011 | TypeScript monorepo: React + Vite storefront and admin, Node + Express API, PostgreSQL + Prisma, `/api/v1`, shared package, modular monolith, regular CSS, no Tailwind. | Kickoff brief |
| D-012 | Nishorama landing-page composition is mandatory: announcement bar, minimal header, category pills, full-width hero with oversized wordmark, New Ins immediately below, further product rows, tabbed products, footer. | Reference addendum; restated in the review request |
| D-013 | The landing page needs its own desktop and mobile screenshot review and your explicit approval. | Review request |
| D-014 | No application code, packages, migrations or infrastructure until you approve. | Kickoff brief; review request |
| D-015 | Do not copy another site's code or assets; do not invent products, reviews or business claims. | Kickoff brief |

## Proposed (awaiting your approval)

| ID | Decision | Rationale | Document |
|----|----------|-----------|----------|
| D-101 | npm workspaces; no pnpm or Turborepo. | npm 11 is installed; avoids new tooling. | `system-architecture.md` §2 |
| D-102 | Prisma schema stays at the root `prisma/`; only the API imports the client. | Matches your proposed structure. | `system-architecture.md` §2 |
| D-103 | Add a root `e2e/` folder for Playwright tests. | Tests cross both apps and the API. | `system-architecture.md` §2 |
| D-104 | Money as integer paise; UUID v7 keys; UTC storage with Asia/Kolkata display. | Correctness and sortable IDs. | `system-architecture.md` §5 |
| D-105 | Stock reserved atomically at checkout, 15-minute hold for prepaid, immediate hold for COD, DB check constraints as last guard. | Prevents overselling. | `system-design.md` §2 |
| D-106 | Orders confirmed only from verified webhooks or server status queries. | Prevents fake confirmations. | `system-design.md` §6 |
| D-107 | Mock payment provider until gateway approval; it cannot load in production. | D-005. | `system-design.md` §6.1 |
| D-108 | Server-side sessions in PostgreSQL, Argon2id passwords, MFA for Owner and Manager. | ASVS Level 2 target. | `security-design.md` §2 |
| D-109 | CMS content as typed blocks with draft and published versions; no raw HTML. | Safe editing; XSS prevention. | `system-design.md` §7 |
| D-110 | Search with PostgreSQL full-text and trigram; no external search engine in R1. | Catalogue size. | `system-design.md` §8 |
| D-111 | Storefront starts as a single-page app with a link-preview meta endpoint; SSR evaluated later. | Effort versus SEO benefit. | `system-architecture.md` §6, OD-14 |
| D-112 | Art direction "The name as a monument" (Taste seed 2101993053), Panchang and Switzer, blush and aubergine palette, square buttons, flat pills. | Fits the mandatory oversized wordmark. | `design-system.md` |
| D-113 | Where the brief and Taste rules conflict (pills, overlaid wordmark, product card rows, header icons), the brief wins. | Your stated priority. | `design-system.md` §7 |
| D-114 | UI UX Pro Max's "Liquid Glass" style recommendation rejected; its usability and accessibility rules kept. | Generic luxury default; conflicts with Taste no-glass rule. | `design-system.md` §1 |
| D-115 | Guest checkout allowed; one warehouse; English only; max 10 units per cart line; order numbers `SP-YYMM-NNNNNN`. | Working assumptions. | `open-decisions.md` |
| D-116 | Adopt the proposed 19-phase index in `MASTER-IMPLEMENTATION-INDEX.md`, pending reconciliation with your canonical list. | The canonical list was not found (B-01). | `MASTER-IMPLEMENTATION-INDEX.md` |
| D-117 | Cart API and drawer, and header search, are built before the landing gate. | Bag and search must work at the landing gate. | `MASTER-IMPLEMENTATION-INDEX.md` |
| D-118 | Live gateway (Phase 18) precedes launch (Phase 19). | BR-6 requires prepaid at launch. | `MASTER-IMPLEMENTATION-INDEX.md`, OD-22 |
| D-119 | Database schema is migrated in stages: core in Phase 6, customers in Phase 14, orders and payments in Phase 15. | Order and tax columns depend on unanswered decisions. | `MASTER-IMPLEMENTATION-INDEX.md` |
| D-120 | The landing gate cannot pass on placeholder imagery. | A visual review against the reference needs real photography. | `MASTER-IMPLEMENTATION-INDEX.md` Phase 12 |

## Observed (needs confirmation)

| ID | Observation | Evidence | Question |
|----|-------------|----------|----------|
| D-201 | The planning documents were committed and pushed. | Commit `3be7523` "Requirement docs" on `origin/main`. | Does this commit mean the plan is approved, or only saved? Treated as **saved, not approved**. |
| D-202 | `.taste-skill/direction.json` is committed. | Present in `origin/main`. | Accept OD-21's default (commit `direction.json`, ignore screenshots)? |
| D-203 | The whole `.claude/skills/` folder is committed to the repository. | 231 files in commit `3be7523`. | Keep project skills in git (reproducible) or ignore them? Recommended: keep, since `skills-lock.json` only covers two of the nine. |

## Change history

| Date | Change |
|------|--------|
| 2026-10-18 | Log created. D-001 to D-015 recorded from briefs; D-101 to D-120 proposed; D-201 to D-203 observed. |
