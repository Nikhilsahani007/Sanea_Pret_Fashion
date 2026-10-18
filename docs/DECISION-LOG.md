# Sanéa Pret — Decision Log

Date started: 2026-10-18

Each entry has a status. Approving a policy confirms that policy only; the document edits that describe it, and any technology choice it leads to, are approved separately.
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
| D-011 | TypeScript monorepo: React + Vite storefront and admin, Node + Express API, PostgreSQL + Prisma, `/api/v1`, shared package, modular monolith. *The original "regular CSS, no Tailwind" clause is superseded by D-020 and D-021.* | Kickoff brief; amended by technology-policy request, 2026-10-18 |
| D-012 | Nishorama landing-page composition is mandatory: announcement bar, minimal header, category pills, full-width hero with oversized wordmark, New Ins immediately below, further product rows, tabbed products, footer. | Reference addendum; restated in the review request |
| D-013 | The landing page needs its own desktop and mobile screenshot review and your explicit approval. | Review request |
| D-014 | No application code, packages, migrations or infrastructure until you approve. | Kickoff brief; review request |
| D-015 | Do not copy another site's code or assets; do not invent products, reviews or business claims. | Kickoff brief |
| D-016 | Add a root `CLAUDE.md` and a root `.gitignore` protecting `node_modules`, environment secrets, build output, coverage, Playwright reports and temporary Taste screenshots, with `.env.example` tracked. | Repository-preparation request, 2026-10-18 |
| D-017 | One authoritative implementation sequence; old phase references corrected or mapped to it. | Repository-preparation request, 2026-10-18 |
| D-018 | No skill is uninstalled and `skills-lock.json` is not altered without evidence and your approval. | Repository-preparation request, 2026-10-18 |
| D-019 | Changes are prepared but not committed or pushed until you approve. | Repository-preparation request, 2026-10-18 |
| D-020 | Technology-flexible engineering: any suitable technology may be adopted for a meaningful benefit, judged on functionality, customer experience, accessibility, performance, security, productivity, maintainability, compatibility, cost and lock-in; significant choices documented; experiments when uncertain; confirmed architecture preserved unless a justified change is approved. | Technology-policy request, 2026-10-18; restated in the refinement request |
| D-021 | The blanket prohibition on Tailwind CSS is removed. Tailwind is not adopted or installed automatically; it is evaluated against regular CSS and CSS Modules. | Technology-policy request; restated in the refinement request |
| D-022 | The premium editorial direction and brand identity stay independent of the styling framework, and tokens stay consistent across storefront and admin. | Technology-policy request; refinement request |
| D-023 | The styling evaluation is a separate, explicitly approved task before the admin and storefront shells, not a Phase 3 deliverable. Phase 3 stays limited to repository foundation and CI. | Refinement request, 2026-10-18 |
| D-024 | Tailwind experiment dependencies stay uninstalled until you explicitly approve the experiment. | Refinement request, 2026-10-18 |
| D-026 | Phase 7 (admin authentication, roles and audit) is backend security work and must not depend on the styling decision; the styling decision stays a prerequisite for UI work that needs it, including Phase 11. | Final-corrections request, 2026-10-18 |
| D-027 | Apply the nine-file technology-policy documentation patch to the working tree, without committing. This approves the document edits only; TD-001, TD-002, ST-01, the 19-phase index and later phases keep their own gates. | Apply request, 2026-10-18 |
| D-028 | **Phase 1 gate passed.** The 19-phase `MASTER-IMPLEMENTATION-INDEX.md` is the canonical implementation roadmap, and the current planning documents are the approved baseline. Not covered: TD-001 (unresolved), TD-002 (proposed), ST-01 (needs approval before execution), the Phase 3 gate, live payment integration and production infrastructure, the open business questions in `open-decisions.md`, and skill removal. | Phase 1 approval, 2026-10-18 |
| D-029 | OD-04 sizes: standard range S, M, L, XL, XXL, plus Free Size for suitable one-size products; size charts configurable per product; inventory tracked by size and colour. | Phase 2 decisions, 2026-10-18 |
| D-030 | OD-05 GST: customer-facing prices include GST; HSN and tax handling configurable; actual rates, classifications and invoice compliance verified by an accountant before live sales. | Phase 2 decisions, 2026-10-18 |
| D-031 | OD-10: guest checkout for release one; customer accounts deferred. | Phase 2 decisions, 2026-10-18 |
| D-032 | OD-11: mandatory 2FA for all four admin roles. | Phase 2 decisions, 2026-10-18 |
| D-033 | OD-25: configurable, effective-dated, rules-based GST model representing thresholds and tax components; no hard-coded rates; actual rates and compliance rules need accountant verification. | Phase 2 decisions, 2026-10-18 |
| D-034 | **Approved scope change (OD-26):** customer accounts and wishlist are deferred from release one; guest checkout stays fully functional. Changes the D-028 baseline in `project-requirements.md` §2, §3.1, §3.3, §5; index Phases 12, 14, 15; and the related specification sections listed in OD-26. | Phase 2 scope approval, 2026-10-18 |
| D-035 | **Phase 2 gate passed.** Covers D-029 to D-034. Not covered: brand inputs (OD-01, OD-02, B-06), which may arrive later and block Phases 11 and 12; accountant verification (B-14) before live sales; alignment of the specifications with D-029 to D-033. | Phase 2 gate approval, 2026-10-18 |
| D-036 | Phase 3 keeps `@playwright/test` and its configuration, with no browser downloads until the first end-to-end test exists. | Pre-Phase 3 instruction, 2026-10-18 |
| D-037 | Phase 3 includes Dependabot: weekly update pull requests for npm and GitHub Actions, with no automatic merging. | Pre-Phase 3 instruction, 2026-10-18 |
| D-038 | **Phase 3 approved** with the dependency list in `phase-3-plan.md` (ten pinned development packages), on branch `phase-3-foundation`, without committing or pushing. The CI run on GitHub (V14) needs separate approval. | Phase 3 approval, 2026-10-18 |
| D-039 | **Phase 3 gate passed.** Evidence: commits `567e27f` and `40efff9` on `phase-3-foundation`; draft PR #1 CI run 39117996687 ("Format, lint, typecheck, test, audit" and "Secret scan (Gitleaks)" both success); local checks V1 to V13a. PR #1 stays open, draft and unmerged. Not covered: GitHub's validation of `dependabot.yml`, which happens only once the file is on `main`. | Phase 3 gate approval, 2026-10-18 |
| D-040 | **Phase 4 design approved in principle, not authorised for implementation.** (1) Branded integer paise with safe-integer checks and `BigInt` intermediates; (2) percentages round half away from zero, GST rounding separate and accountant-reviewed; (3) `paise()` within the safe-integer range, amount and price schemas capped at 2,147,483,647 paise until Phase 6; (4) Indian mobile numbers only, normalised to `+91XXXXXXXXXX`; (5) rupee input rejects grouping commas, currency symbols, signs and more than two decimals; (6) six-digit PIN rules as documented; (7) explicit named exports from `@sanea/shared`, no deep imports; (8) TypeScript source exports with `erasableSyntaxOnly` and `allowImportingTsExtensions`; (9) `zod@4.6.7` as an exact runtime dependency of `@sanea/shared`; (10) stable error codes, inferred schema types, const-object enums; (11) all Phase 4 exclusions kept. Conditions (8) and (9) were verified in a scratchpad sandbox on 2026-10-18 (all six checks pass with D-041); nothing was installed in the repository. | Phase 4 design review, 2026-10-18 |
| D-041 | Apps consume `@sanea/shared` through its package exports **without TypeScript project references** to it; the root `tsc -b` keeps listing every workspace. Reason: a reference to a `noEmit` project fails with TS6310 (sandbox check 1). Types still reach consumers (verified with deliberate type errors). | Approval of sandbox results, 2026-10-18 |
| D-042 | Use classic `zod@4.6.7`, not `zod/mini`. Load checkout as a separate route chunk so the landing page does not carry Zod (about 24 kB gzipped in the sandbox; `zod/mini` measured 3.5 kB). | Approval of sandbox results, 2026-10-18 |
| D-043 | **Phase 4 implementation authorised** on local branch `phase-4-shared-contracts`, under D-040 to D-042: install `zod@4.6.7` in `@sanea/shared`, implement and test the shared contracts. Not authorised: commit, push, PR #2, Phase 5. The completion gate needs your review. | Phase 4 implementation authorisation, 2026-10-18 |
| D-044 | **Phase 4 gate passed (AC10).** Evidence: commit `dc52aad` on `phase-4-shared-contracts`; local gate 259 tests passed, 0 failed, 0 skipped; `npm audit` 0 vulnerabilities; format, lint and typecheck clean; plain Node 24 import works and deep imports are rejected; CI run 39122113132 on draft PR #2 ("Format, lint, typecheck, test, audit" and "Secret scan (Gitleaks)" both success). PR #1 and PR #2 stay open, draft and unmerged. | Phase 4 completion approval, 2026-10-18 |
| D-045 | Phase 5 CSRF: Origin allow-list check plus signed double-submit token (HMAC-SHA-256 with `CSRF_SECRET`, header must equal cookie, 12-hour expiry). Upgrade to session-bound tokens in Phase 7. | Phase 5 plan review, 2026-10-18 |
| D-046 | Add `400 MALFORMED_JSON`, `413 PAYLOAD_TOO_LARGE` and `415 UNSUPPORTED_MEDIA_TYPE` to the API error contract, keeping the existing error shape. | Phase 5 plan review, 2026-10-18 |
| D-047 | In-memory rate-limit storage, approved for a single API instance only. A shared store is a mandatory decision before multi-instance deployment (Phase 19). | Phase 5 plan review, 2026-10-18 |
| D-048 | Global rate limit 300 requests per minute per IP, health endpoint exempt. Stricter route-specific limits come with sensitive routes in later phases. | Phase 5 plan review, 2026-10-18 |
| D-049 | **Phase 5 approved** on branch `phase-5-api-platform` from `dc3e1da8be2f2ae5ea056b0db8af421ccb058e4f`. Not authorised: commit, push, PR #3. | Phase 5 plan review, 2026-10-18 |
| D-050 | **Phase 5 gate passed (P5-AC12).** Evidence: commits `ab355d6` (platform), `512fd88` (CORS classifies by pathname, not `req.url`) and `5f55243` (admin paths matched case-insensitively) on `phase-5-api-platform`; local gate 19 test files, 331 tests passed, 0 failed; `npm audit` 0 vulnerabilities; format, lint and typecheck clean; graceful shutdown on Linux (SIGTERM and SIGINT, exit 0); CSRF cookie verified in Edge 155 and Chrome 154; CI run 39157064172 on draft PR #3 ("Format, lint, typecheck, test, audit" and "Secret scan (Gitleaks)" both success). PR #1, PR #2 and PR #3 stay open, draft and unmerged. Phase 6 not started. | Phase 5 completion approval, 2026-10-19 |

## Proposals

The Status column shows which proposals D-028 approved as part of the baseline and which remain open.

| ID | Decision | Rationale | Document | Status |
|----|----------|-----------|----------|--------|
| D-101 | npm workspaces; no pnpm or Turborepo. | npm 11 is installed; avoids new tooling. | `system-architecture.md` §2 | Approved (D-028) |
| D-102 | Prisma schema stays at the root `prisma/`; only the API imports the client. | Matches your proposed structure. | `system-architecture.md` §2 | Approved (D-028) |
| D-103 | Add a root `e2e/` folder for Playwright tests. | Tests cross both apps and the API. | `system-architecture.md` §2 | Approved (D-028) |
| D-104 | Money as integer paise; UUID v7 keys; UTC storage with Asia/Kolkata display. | Correctness and sortable IDs. | `system-architecture.md` §5 | Approved (D-028) |
| D-105 | Stock reserved atomically at checkout, 15-minute hold for prepaid, immediate hold for COD, DB check constraints as last guard. | Prevents overselling. | `system-design.md` §2 | Approved (D-028) |
| D-106 | Orders confirmed only from verified webhooks or server status queries. | Prevents fake confirmations. | `system-design.md` §6 | Approved (D-028) |
| D-107 | Mock payment provider until gateway approval; it cannot load in production. | D-005. | `system-design.md` §6.1 | Approved (D-028) |
| D-108 | Server-side sessions in PostgreSQL, Argon2id passwords, MFA for Owner and Manager. | ASVS Level 2 target. | `security-design.md` §2 | Approved (D-028) |
| D-109 | CMS content as typed blocks with draft and published versions; no raw HTML. | Safe editing; XSS prevention. | `system-design.md` §7 | Approved (D-028) |
| D-110 | Search with PostgreSQL full-text and trigram; no external search engine in R1. | Catalogue size. | `system-design.md` §8 | Approved (D-028) |
| D-111 | Storefront starts as a single-page app with a link-preview meta endpoint; SSR evaluated later. | Effort versus SEO benefit. | `system-architecture.md` §6, OD-14 | Approved (D-028) |
| D-112 | Art direction "The name as a monument" (Taste seed 2101993053), Panchang and Switzer, blush and aubergine palette, square buttons, flat pills. | Fits the mandatory oversized wordmark. | `design-system.md` | Approved (D-028) |
| D-113 | Where the brief and Taste rules conflict (pills, overlaid wordmark, product card rows, header icons), the brief wins. | Your stated priority. | `design-system.md` §7 | Approved (D-028) |
| D-114 | UI UX Pro Max's "Liquid Glass" style recommendation rejected; its usability and accessibility rules kept. | Generic luxury default; conflicts with Taste no-glass rule. | `design-system.md` §1 | Approved (D-028) |
| D-115 | Guest checkout allowed; one warehouse; English only; max 10 units per cart line; order numbers `SP-YYMM-NNNNNN`. | Working assumptions. | `open-decisions.md` | Approved (D-028) |
| D-116 | Adopt the 19-phase `MASTER-IMPLEMENTATION-INDEX.md` as the canonical sequence; `implementation-roadmap.md` becomes historical. | The canonical list you mentioned was not found (B-01); D-017 asks for one authoritative sequence. | `MASTER-IMPLEMENTATION-INDEX.md` | Approved (D-028) |
| D-117 | Cart API and drawer, and header search, are built before the landing gate. | Bag and search must work at the landing gate. | `MASTER-IMPLEMENTATION-INDEX.md` | Approved (D-028) |
| D-118 | Live gateway (Phase 18) precedes launch (Phase 19). | BR-6 requires prepaid at launch. | `MASTER-IMPLEMENTATION-INDEX.md`, OD-22 | Approved (D-028) |
| D-119 | Database schema is migrated in stages: core in Phase 6, customers in Phase 14, orders and payments in Phase 15. | Order and tax columns depend on unanswered decisions. | `MASTER-IMPLEMENTATION-INDEX.md` | Approved (D-028) |
| D-120 | The landing gate cannot pass on placeholder imagery. | A visual review against the reference needs real photography. | `MASTER-IMPLEMENTATION-INDEX.md` Phase 12 | Approved (D-028) |
| D-121 | "Needed by" phases in `open-decisions.md` re-mapped to the index; OD-04, OD-05, OD-10, OD-11 needed before Phase 6. | They shape the core schema. | `open-decisions.md` | Approved (D-028) |
| D-122 | Skills: keep `design-taste-frontend`, `ui-ux-pro-max`, `design-motion-principles`; use `brand`, `design-system` selectively; `ui-styling` only if TD-001 adopts Tailwind; consider removing `banner-design`, `design`, `slides`. No removal without approval. | Evidence in `PROJECT-STATUS.md` skills table. | `CLAUDE.md`, `PROJECT-STATUS.md` | Open |
| D-123 | TD-001 styling stays **unresolved**. CSS Modules with token custom properties is a provisional recommendation without measured evidence, not a choice. | D-020 calls for evidence when uncertain. | `technology-decisions.md` TD-001 | Open |
| D-124 | TD-002: one token source in `packages/shared` (CSS custom properties) used by both apps; imported by each Vite app through package subpath exports; admin overrides semantic surface tokens only; a zero-dependency CI check flags hard-coded colours and font families, with registered exceptions. | Keeps one brand without changing the confirmed structure or adding a dependency. | `technology-decisions.md` TD-002 | Open |
| D-125 | Plan task ST-01 (styling evaluation) after the Phase 3 gate, decided before the first UI deliverable (Phase 8 admin shell), with its own approvals. | D-023, D-026. | `MASTER-IMPLEMENTATION-INDEX.md` | Approved (D-028) |
| D-126 | Move the admin app shell from Phase 7 to Phase 8, so Phase 7 is backend security work only. UI deliverables in any phase wait for TD-001 and TD-002; backend deliverables never do. Written into the index under D-027; binding since the index was approved (D-028). | D-026. A styling decision cannot hold back authentication. | `MASTER-IMPLEMENTATION-INDEX.md` | Approved (D-028) |
| D-127 | OD-04 sizes, as you first proposed. | Your proposed default, 2026-10-18. | `open-decisions.md` | Superseded by D-029 (Free Size added) |
| D-128 | OD-05 GST, as you first proposed. | Your proposed default, 2026-10-18. | `open-decisions.md` | Superseded by D-030 |
| D-129 | OD-10 sign-in, as you first proposed. | Your proposed default, 2026-10-18. | `open-decisions.md` | Superseded by D-031 |
| D-130 | OD-11 MFA, as you first proposed. | Your proposed default, 2026-10-18. | `open-decisions.md` | Superseded by D-032 |
| D-131 | OD-26: defer customer accounts and wishlist from release one. **Scope change** to the approved baseline (D-028): `project-requirements.md` §2, §3.1 and §5 account routes; index Phase 14; OD-24 header controls. | Accounts already deferred by D-031; wishlist depends on accounts. | `open-decisions.md` OD-26 | Approved (D-034) |
| D-132 | CSRF cookie strategy: identical attributes in every environment (`__Host-sp_csrf`, `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`). Local development uses `http://localhost`, which Chrome, Edge and Firefox treat as a secure context, so `Secure` and `__Host-` cookies work there; the storefront and admin dev servers proxy `/api` so requests are same-origin. Safari or other hosts need local HTTPS. No relaxed development cookie exists. | Chosen at your request (Phase 5 review, item 2); production settings unchanged. Verified 2026-10-19 in headless Edge 155 and Chrome 154 through a same-origin dev proxy (`phase-5-plan.md`). Firefox not installed here, so its behaviour is documented, not verified. | `security-design.md` §3, `phase-5-plan.md` | Confirmed, Phase 5 review, 2026-10-19, on condition that production attributes, the frontend token flow and all server checks stay unchanged |
| D-133 | Phase 5: commit on `phase-5-api-platform`, push it, open draft PR #3 into `phase-4-shared-contracts`, after the diff review, all local checks and a Linux graceful-shutdown check pass. No merges of PR #1, #2 or #3, no history rewrite, no change to `main`, no Phase 6. | Lets CI and Gitleaks run on the Phase 5 code. | — | Approved, 2026-10-19 |

## Observed (needs confirmation)

| ID | Observation | Evidence | Question |
|----|-------------|----------|----------|
| D-201 | The planning, tracking and preparation documents were committed and pushed by you. | Commits `3be7523` "Requirement docs", `9f63e88` "updated docs" and `1e52d81` "updated files" on `origin/main`. | Do these commits mean approval, or only saving? Treated as **saved, not approved**. |
| D-202 | `.taste-skill/direction.json` is committed. | Present in `origin/main` since `3be7523`. | Ignoring temporary screenshots is now confirmed (D-016). Keeping `direction.json` tracked still needs your confirmation (OD-21). |
| D-203 | The whole `.claude/skills/` folder is committed to the repository. | 231 files in commit `3be7523`. | Keep project skills in git (reproducible) or ignore them? Recommended: keep, since `skills-lock.json` only covers two of the nine. |

## Change history

| Date | Change |
|------|--------|
| 2026-10-18 | Log created. D-001 to D-015 recorded from briefs; D-101 to D-120 proposed; D-201 to D-203 observed. Committed by you in `9f63e88`. |
| 2026-10-18 | Repository preparation: D-016 to D-019 confirmed from your request; D-116 reworded; D-121, D-122 proposed; D-201, D-202 evidence updated. Committed by you in `1e52d81`. |
| 2026-10-18 | Technology policy: D-020 to D-024 and D-026 confirmed by your instructions; D-011 amended; D-122 updated; D-123 to D-126 proposed. |
| 2026-10-18 | Documentation patch applied to the working tree (D-027). Not committed. |
| 2026-10-18 | Phase 1 approved (D-028). D-101 to D-121, D-125 and D-126 approved as baseline; D-122 to D-124 stay open. |
| 2026-10-18 | Phase 2: your proposed defaults for OD-04, OD-05, OD-10, OD-11 recorded as D-127 to D-130, not accepted. OD-25 and OD-26 added. Specifications not changed. |
| 2026-10-18 | Phase 2: D-029 to D-033 accepted by you (OD-04, OD-05, OD-10, OD-11, OD-25); D-127 to D-130 superseded; D-131 (OD-26) proposed. Specifications not yet aligned. |
| 2026-10-18 | OD-26 approved (D-034) and its references updated across the specifications; Phase 2 gate passed (D-035); Phase 3 plan proposed in `phase-3-plan.md`. |
| 2026-10-18 | Pre-Phase 3: D-036 (Playwright kept, no browsers) and D-037 (weekly Dependabot, no auto-merge) recorded; `PROJECT-STATUS.md` reconciled with commit `0fdb74c`. Phase 3 itself not approved. |
| 2026-10-18 | Phase 3 approved (D-038) and implemented locally on `phase-3-foundation`; checks V1 to V13a recorded in `PROJECT-STATUS.md`. Not committed. |
| 2026-10-18 | Phase 3 gate passed (D-039); Phase 4 design approved in principle (D-040); sandbox-based decisions D-041 and D-042 recorded. Phase 4 implementation not authorised. |
| 2026-10-18 | Phase 4 implementation authorised (D-043) and carried out locally; results in `PROJECT-STATUS.md`, implementation notes in `phase-4-plan.md`. Not committed. |
| 2026-10-18 | Phase 4 gate passed (D-044). Phase 5 planning may start; implementation needs separate approval. |
| 2026-10-18 | Phase 5 plan approved with decisions D-045 to D-049; cookie strategy D-132 proposed for review at the gate. |
| 2026-10-19 | Phase 5 review: D-132 confirmed; commit, push and draft PR #3 authorised (D-133). Phase 5 completion needs a separate approval. |
| 2026-10-19 | PR #3 review: two admin-path classification fixes (`512fd88`, `5f55243`). Phase 5 gate passed (D-050). Phase 6 planning needs your go-ahead. |
