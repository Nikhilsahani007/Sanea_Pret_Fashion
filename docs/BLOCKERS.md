# Sanéa Pret — Blockers

Last updated: 2026-10-19

A blocker stops a phase gate from passing. Phase numbers refer to `MASTER-IMPLEMENTATION-INDEX.md`. A safe default only clears a blocker once you accept it.

## Active blockers

| ID | Blocker | Blocks | Owner | Safe default |
|----|---------|--------|-------|--------------|
| B-03 | The nishorama.com screen recording is not in the repository (OD-01). Motion timing, slide duration and hover behaviour are unverified. | Phase 12 gate | You | Build from the live site; motion stays provisional. |
| B-04 | No logo, brand colours or brand fonts supplied (OD-02). | Phase 11 final tokens; Phase 12 gate | You | Typeset Panchang wordmark and dealt palette, replaceable through tokens. |
| B-14 | Accountant verification of GST rates, thresholds, HSN classifications, seller GSTIN and state, and invoice compliance (D-030, D-033). | Live sales (Phase 19 launch). Not the schema. | You and your accountant | No rates are entered for production until verified. |
| B-06 | No real product data or photography exists. The landing gate cannot pass on placeholders (D-120). | Phase 12 gate | You or brand team | Build with marked placeholders; the gate waits for real images. |
| B-07 | Checkout decisions unanswered: COD rules (OD-07), shipping (OD-08), returns policy text (OD-09), launch offer (OD-17). | Phase 15 gate | You | Defaults in `open-decisions.md`; returns text must come from you. |
| B-08 | Email provider and sender domain (OD-19). | Phase 16 gate | You | Log-only provider in development. |
| B-09 | Legal review of privacy, terms and retention (OD-12); analytics and consent (OD-20); SEO rendering (OD-14). | Phase 17 gate | You and legal adviser | Placeholder legal pages; no third-party analytics. |
| B-10 | Gateway choice and approval (OD-06); launch mode (OD-22). | Phase 18 | You | Mock provider only; no launch before the gateway. |
| B-11 | Hosting approval: provider, region, budget (OD-18); verified Rehma Foundation content (OD-13). | Phase 19 | You | Nothing provisioned; placeholder Rehma page. |
| B-12 | Styling approach unresolved (TD-001) and token sharing not approved (TD-002). Task ST-01 needs your explicit approval, including installing `tailwindcss` and `@tailwindcss/vite` on a throwaway branch. | UI deliverables only: admin shell and screens (Phases 8 to 10), storefront (Phase 11 onward). Backend work, including Phase 7, is not blocked. | You | None for the decision. Provisional hypothesis: CSS Modules with shared token custom properties. Nothing installed. |

## Environment risks (not blocking yet)

| ID | Risk | Evidence | Impact |
|----|------|----------|--------|
| E-02 | A native Windows PostgreSQL 18 service (`postgresql-x64-18`) runs on this machine and listens on port 5432 on all interfaces. | `Get-NetTCPConnection` and `Get-Service`, 2026-10-19. | The Compose database uses `127.0.0.1:5433` instead. The native service is yours and was not changed; consider limiting it to localhost if you do not need it on the network. |
| E-03 | Panchang's "É" glyph is unchecked (OD-15). | Not tested. | The wordmark may need another face (Phase 11). |
| E-04 | `skills-lock.json` records only 2 of the 9 project skills. | Lock file lists `design-motion-principles` and `design-taste-frontend` only. | Source and version of the other 7 cannot be reproduced. |

## Resolved

| ID | Item | Resolution | Evidence |
|----|------|-----------|----------|
| R-01 | No `.gitignore`: a future `npm install` or `.env` could be committed. | Root `.gitignore` added (D-016). | `git check-ignore` results in `PROJECT-STATUS.md`; committed in `1e52d81`. |
| R-02 | No project instructions for Claude Code. | Root `CLAUDE.md` added (D-016). | Committed in `1e52d81`. |
| R-03 | Two sequencing documents with colliding phase numbers. | Index made the single sequence; roadmap marked historical; spec references re-mapped (D-017). | `grep` results in `PROJECT-STATUS.md`; committed in `1e52d81`. |
| R-04 (was B-01) | No canonical 19-phase list. | You approved `MASTER-IMPLEMENTATION-INDEX.md` as canonical. | D-028 |
| R-05 (was B-02) | Planning documents and index not approved. | You approved them as the baseline. | D-028 |
| R-06 (was B-05) | Schema-shaping decisions unanswered (OD-04, OD-05, OD-10, OD-11, OD-25). | You accepted them. | D-029 to D-033 |
| R-07 (was B-13) | Scope change OD-26 awaited approval. | You approved it. | D-034 |
| R-08 (was E-01) | Docker daemon untested. | Containers ran for the Phase 5 shutdown test and the Phase 6 compatibility test. | `phase-5-plan.md`, `phase-6-plan.md` |
