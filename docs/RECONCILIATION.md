# Sanéa Pret — Branch Reconciliation Record

Status: **Stage 1, documentation only.** Date: 2026-10-26. Prepared in a separate worktree of `phase-12-landing`; nothing committed, pushed, merged or cherry-picked. No phase gate is approved by this record.

## 1. Canonical branch and scope

| Item | Value |
|------|-------|
| Canonical branch | `phase-12-landing` at `ba7b9779968e4582cc9db0b406b3d71bcdcae768` (D-174) |
| Canonical stack of draft PRs | #6 `main` ← `phase-8-catalogue`; #7 ← `phase-9-inventory`; #8 ← `phase-10-content`; #9 ← `phase-11-storefront`. All open, draft, unmerged; preserved (D-174) |
| Reference branch | `claude/amazing-faraday-21s6uc` at `1c25fb70d7599e53104a051f80f90934efb0557a`. Preserved untouched: not tagged, deleted, merged, archived or rebased (D-174). Read only as a source of candidates |
| Common ancestor | `main` at `6593082` (merge of PR #5, Phase 7). The canonical branch has 24 commits beyond it; the reference branch 14 |
| Scope of this stage | This record, new decision entries D-174 to D-182 in `DECISION-LOG.md`, a status note in `PROJECT-STATUS.md`. No code, tests, dependencies, lock files, schema or migrations |

The reference branch was built from `main` without the canonical Phase 8 to 12 work. It re-implemented Phases 8 to 19 on its own, with its own migrations and its own decision IDs. Passing tests or working code on it confer no approval (D-175).

## 2. Decision mapping (reference → canonical)

Only decisions the reference branch records as made by you are carried forward (D-175). Its proposals are listed in §4 as candidates.

| Reference ID | What you decided there | Canonical outcome |
|--------------|-----------------------|-------------------|
| D-001 to D-076 | Shared history from `main` | Same IDs, same meaning; no mapping needed |
| D-077 | TD-001: CSS Modules with token custom properties, no Tailwind | Already covered by canonical **D-085**; no new record |
| D-078 | TD-002: one token source in `packages/shared` | Already covered by canonical **D-086**; no new record |
| D-079 | Later phases may proceed while earlier gates wait | **Not carried forward.** Superseded by **D-176** (strict sequencing) |
| D-080 | Package installs and per-batch commits to `claude/amazing-faraday-21s6uc` | **Not carried forward.** An authorisation for that branch only; it does not transfer |
| D-081 | Ivory and soft-black luxury styling (your master completion prompt, 2026-10-24: “Ivory and soft-black luxury styling.”) | Carried forward as **D-180** (direction only). Canonical values of D-096 stand; the reference values `#F6F1E7` and `#1C1A17` are not adopted (§3.6) |
| D-160 | COD cancellation: Fulfilment may decline only an unconfirmed COD order with a mandatory reason code (`OTHER` needs a note); only Owner and Manager cancel confirmed or packed orders; no cancellation after dispatch; dedicated `orders.declineCod` permission enforced server-side; reason in history and audit without unnecessary personal data | Carried forward as **D-181**. Policy only; no implementation approved. Implementation waits for the canonical Phases 15 and 16 |
| D-165 | `@axe-core/playwright` 4.13.0 and `lighthouse` 13.5.0, dev, exact pins | Already present on the canonical branch at the same versions (`lighthouse` under D-098 Q11-10); no new record |
| D-169 | Tax settings and GST rules editable by the Owner only | Carried forward as **D-182**. Policy only; no implementation approved; no rates, HSN codes, GSTIN, seller state or legal facts entered (B-14) |

The reference IDs D-082 to D-173 that are **not** in this table are proposals or implementation choices there; several reuse numbers that mean something else on the canonical branch (for example canonical D-089, D-092, D-095 to D-100, D-135 and D-136). Always cite a reference ID with its branch name.

## 3. Known conflicts

### 3.1 Decision numbering
- Both branches use D-077 to D-100 and D-135 to D-136 with different meanings. The canonical log also holds the older blocks D-101 to D-134 and D-201 to D-203.
- New canonical records start at **D-174** (D-175). Reference IDs D-137 to D-173 are not used on the canonical branch, to avoid a third meaning.

### 3.2 Migrations

| Canonical (`phase-12-landing`) | Reference (`claude/amazing-faraday-21s6uc`) |
|--------------------------------|---------------------------------------------|
| `20261018193745_core_schema` | same |
| `20261018202335_admin_auth` | same |
| `20261021180245_catalogue_search` (approved with the Phase 8 gate, D-089) | `20261024090000_catalogue_search`: a different migration for the same purpose (nullable `search_vector`; canonical has `NOT NULL DEFAULT ''`) |
| `20261022233000_inventory_low_stock` (D-091) | none: inventory reads built without it |
| `20261023120000_rehma_foundation_page` (D-094) | none |
| `20261023180000_guest_cart` (D-100) | `20261024120000_guest_cart`: a different cart schema |
| — | `20261024150000_enquiries`, `20261024180000_orders_payments`, `20261024200000_admin_operations`, `20261025100000_cancellation_reasons`: none approved |

The two histories cannot both be applied to one database. No reference migration is adopted. Any later feature brought across needs a **new** migration written against the canonical schema, with its own approval. No migration has been applied to a real or staging database.

### 3.3 Routes
- **Canonical:** `/`, `/search`, `/cart`, `/pages/:slug`, and not found with "coming soon" for Phase 13 paths. Search suggestions link categories to `/categories/:slug`.
- **Baseline requirements:** `project-requirements.md` already lists `/shop/:categorySlug`, `/collections/:collectionSlug` and `/policies/*`.
- **Reference:** `/shop/:slug`, `/collections/:slug`, `/products/:slug`, `/policies/:slug`, content pages at `/:slug`, plus checkout and order routes.
- **Position:** `/shop/:slug` is preferred but stays a **proposal (D-179)**. It needs a compatibility review of the search suggestion links, the `/pages/:slug` footer links, the meta endpoint (if any), and redirects.

### 3.4 Cart behaviour
- **Canonical (D-099, D-135):** adding above available stock is accepted with an `EXCEEDS_AVAILABLE` warning, and checkout refuses unavailable stock. **Confirmed by D-178.**
- **Reference (its D-149, a proposal):** refuses with `409 OUT_OF_STOCK` when adding. **Not adopted.**

### 3.5 Search
Both branches use PostgreSQL full-text search plus `pg_trgm` (D-110) with different migrations (§3.2). The suggestion endpoint, read from the code at `ba7b977` and `1c25fb7`:

| | Canonical (`phase-12-landing`) | Reference (`claude/amazing-faraday-21s6uc`) |
|---|---|---|
| Path | `GET /api/v1/search/suggest` (`SEARCH` + `/suggest`, `apps/api/src/modules/search/router.ts`, `searchRouter`) | `GET /api/v1/search/suggest` (`${V1}/search/suggest`, `apps/api/src/modules/catalogue/public-router.ts`) |
| Query | `q` only (`z.strictObject`), trimmed, 2 to 100 characters, control characters rejected (`searchText`) | `q` only (`.strict()`), trimmed, 2 to 100 characters (`suggestQuery`); no control-character check |
| Response | `{ categories: [{ slug, name }], products: [{ slug, name }] }` (`suggest` in `apps/api/src/modules/catalogue/listing.ts`; storefront type `Suggestions` in `apps/storefront/src/api/types.ts`) | `{ products: [{ slug, name }], categories: [{ slug, name }] }` (inline handler); same keys and item fields |
| Categories | Up to 2 published, by trigram similarity or name prefix | Up to 3 published, name contains the normalised terms, ordered by `position` |
| Products | Up to `6 − categories`, by trigram, prefix or `websearch_to_tsquery('simple', …)` | Up to `6 − categories`, by `matchText` (`to_tsquery('english', …)` with a prefix on the last word, or trigram on the name; `public-catalogue.ts`), active variants only |
| Limit and caching | 60 per minute per IP (`SEARCH_LIMIT`) and `publicCache`, applied to the `/api/v1/search` prefix | 60 per minute per IP (`searchLimit`) and `publicCache` on the route |
| Storefront link for a category | `/categories/:slug` (`hrefOf`, `apps/storefront/src/search/SearchBox.tsx`) | `/shop/:slug` (`apps/storefront/src/components/SearchBox.tsx`) |

- **Compatible:** the path and the response keys match, so the canonical storefront could read either response.
- **Different:** matching, the text-search dictionary (`simple` against `english`), the category cap (2 against 3) and the category link (§3.3).
- **Unverified:** neither endpoint was run in this stage, so ranking and results on the same data are not compared. Whether `/search` and `/search/suggest` share one rate-limit counter on each branch comes from reading the code only, and is not tested. The reference handler's behaviour for queries that normalise to fewer than 2 characters (it checks the length of the normalised string) is not tested.

### 3.6 Content keys and palette
- **Canonical content keys:** `site.announcement`, `home.hero`, `home.newIns`, `home.pills`, `home.row2`, `home.tabbedGrid`, `home.editorial`, `site.footer`.
- **Reference content keys:** `home.announcement`, `home.hero`, `home.new-ins`, `home.pills`, `home.row-2`, `home.tabbed`, `site.footer`.
- The keys are not interchangeable: seeds, the admin CMS and stored content differ. The canonical keys stand.
- **Palette:** canonical D-096 (ivory `#F8F4E9`, soft black `#111111`, champagne, deep aubergine, taupe; storefront only, proposed values). The reference uses ivory `#F6F1E7` and soft black `#1C1A17` for both apps. Canonical values stand (D-180).

### 3.7 Typography
- **Canonical:** Panchang 700 and Switzer 400/500, self-hosted, with É verified (D-097, D-098).
- **Reference:** Archivo as a stand-in (its D-141, a proposal), and no supplied logo; its B-04 says none was supplied, which the canonical D-096 contradicts.
- **Position:** keep the canonical direction; font changes are deferred pending review (D-177).

### 3.8 Test coverage (as recorded by each branch; not re-run in this stage)
- **Canonical:**
  - Phase 11 CI run 40013302382: 713 unit and 403 integration tests.
  - Phase 12: 20 end-to-end tests, Lighthouse accessibility 100, performance 90 on placeholders.
- **Reference at `1c25fb7`:**
  - 576 unit, 462 database and 84 end-to-end tests, run locally.
  - axe scans.
  - Lighthouse below budget on product (82) and checkout (80).
- **Comparability:** the suites test different implementations, so their counts are not comparable, and none of the reference results is evidence for the canonical branch.

### 3.9 Pull requests #1 to #5 (unverified)
- **Git history:** PRs #1–#5 were merged into `main` with "Merge pull request #N" commits:
  - #1 `03c12bd`;
  - #2 `38a0a85`;
  - #3 `4f20baa`;
  - #4 `cb72b6b`;
  - #5 `6593082`.

  Each branch head (`phase-3-foundation` to `phase-7-admin-auth`) is an ancestor of `main`. Canonical D-134 records #1 to #4 as merged, and the reference documents say #5 was merged.
- **GitHub API:** the API, queried on 2026-10-26, reports all five as `state: closed`, `merged: false`.
- **Status:** unverified, until the PR pages are checked on GitHub.

## 4. Candidates from the reference branch (not approved)

These are listed for future planning only. Each needs its own plan, approvals and gate in the canonical sequence, and none is approved by this record.

| Area | Reference work | Canonical phase |
|------|----------------|-----------------|
| Browsing, product detail, enquiries | Listing and product pages, enquiries API and form, WhatsApp links | 13 |
| Checkout, orders, COD, mock payments | Checkout, order state machine, GST components (its D-167), mock provider | 15 |
| Admin operations, notifications | Order screens, notes, refunds, returns, log-only email | 16 |
| COD decline with reason codes | Implementation of D-181 (reason codes are its D-170, a proposal) | 16 |
| Tax administration API | Owner-only API under D-182 (its D-171, a proposal) | 15 or 16 |
| Hardening | SEO meta endpoint, security review, axe pages, Lighthouse script (its D-172), configurable global rate limit for tests (its D-173) | 17 |
| Gateway preparation, infrastructure plan | Provider contract, Phase 19 plan | 18, 19 |
| Retention and erasure evaluation | Its D-168 and `proposals/personal-data-retention.md`; needs your lawyer | 15 to 19 |

## 5. Staged integration plan

1. **Stage 1 (this record):** documentation only, for your review.
2. **Stage 2:** you approve or change D-174 to D-182, and decide on D-179 after a compatibility review.
3. **Stage 3:** the Phase 12 gate continues on the canonical branch under strict sequencing (D-176). It still needs real assets (B-03, B-04 vector export, B-06) and your visual approval (D-013, D-120).
4. **Stage 4 onwards:** each later phase is planned on the canonical branch. A reference candidate is brought across only by re-implementing it against the canonical schema, with new migrations, tests and approvals. There is no merge or cherry-pick of reference commits.

## 6. Open questions for you

- Confirm D-174 to D-178 and D-180 to D-182 as recorded.
- D-179: whether to run the `/shop/:slug` compatibility review, and when.
- D-180: keep D-096's palette values (recommended), or revisit them.
- §3.9: confirm the merge state of PRs #1 to #5 on GitHub.
- The reference D-170 reason codes are a proposal; they are needed before D-181 is implemented.
