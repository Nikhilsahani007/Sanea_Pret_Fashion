# Sanéa Pret — Blockers

Date: 2026-10-18

A blocker is something that stops a phase gate from passing. Each lists what it blocks, who can clear it and the safe default if one exists.

## Active blockers

| ID | Blocker | Blocks | Owner | Safe default |
|----|---------|--------|-------|--------------|
| B-01 | The "required 19-phase master index" was not supplied. Not found in the repository, workspace, conversation, `CLAUDE.md` (none exist) or skills. | Final approval of `MASTER-IMPLEMENTATION-INDEX.md` | You | Approve the proposed 19-phase index as the canonical one, or supply yours for reconciliation. |
| B-02 | The planning documents have not been explicitly approved. Commit `3be7523` saves them but is not an approval. | Phase 1 gate, and everything after it | You | None. Explicit approval needed. |
| B-03 | The nishorama.com screen recording is not in the repository (OD-01). Motion timing, slide duration and hover behaviour are unverified. | Phase 12 gate | You | Build from the live site; motion stays provisional. |
| B-04 | No logo, brand colours or brand fonts supplied (OD-02). | Phase 11 tokens final; Phase 12 gate | You | Typeset Panchang wordmark and dealt palette, replaceable via tokens. |
| B-05 | Pre-database decisions unanswered: GST handling (OD-05), customer sign-in method (OD-10), MFA scope (OD-11). | Phase 6 migration approval | You | Accept the defaults in `open-decisions.md`. |
| B-06 | No real product data or photography exists. The landing gate cannot pass on placeholders (D-120). | Phase 12 gate | You / brand team | Build with marked placeholders; gate waits for real images. |
| B-07 | Pre-checkout decisions unanswered: COD rules (OD-07), shipping (OD-08), launch offer (OD-17), email provider (OD-19), returns policy text (OD-09). | Phase 15 gate | You | Defaults in `open-decisions.md`; returns policy needs your text. |
| B-08 | Gateway choice and approval (OD-06), launch mode (OD-22). | Phase 18 start | You | Mock provider only; no launch before the gateway. |
| B-09 | Legal review of privacy, terms and retention (OD-12); verified Rehma Foundation content (OD-13). | Phase 17 gate, Phase 19 launch | You / legal adviser | Placeholder pages; nothing published unverified. |
| B-10 | Hosting approval: AWS, region, budget (OD-18). | Phase 19 | You | Nothing provisioned. |

## Environment risks (not blocking yet)

| ID | Risk | Evidence | Impact |
|----|------|----------|--------|
| E-01 | Docker is installed but the daemon was not tested. | `docker --version` returned 28.0.4; no container was started. | Phase 6 integration tests need a running daemon. |
| E-02 | PostgreSQL client tools are not installed. | `psql` not found. | None if Docker is used. |
| E-03 | Panchang's "É" glyph not yet checked (OD-15). | Not tested. | Wordmark may need another face. |

## Resolved blockers

None yet.
