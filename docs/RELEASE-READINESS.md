# Sanéa Pret — Release Readiness Report

Date: 2026-10-24 · Branch `claude/amazing-faraday-21s6uc` (from `main` at `6593082`) · Not merged; no pull request opened (D-080).

Three separate statuses, as you asked:

| Status | Answer |
|--------|--------|
| **1. Engineering completion** | Phases 8–17 are built and tested on TEST data. Phase 18 is prepared but blocked (no gateway chosen). Phase 19 is a plan only. Engineering work that still needs your input or approval is listed below |
| **2. Owner approval** | **None of the gates from Phase 8 to Phase 19 has been approved.** Each is "evidence ready, awaiting your approval" or blocked (D-079). Five migrations wait for your approval before any kept database |
| **3. Production deployment** | **Not deployed.** Nothing is provisioned, there is no production database, no live keys, no real email, no DNS change |

## Phase matrix
| Phase | Engineering | Your approval | Evidence |
|-------|-------------|---------------|----------|
| 8 Catalogue, media, admin shell | Done | Pending | `phase-8-plan.md`, `7c2fe4b`, `d074fcc` |
| 9 Inventory and reservation | Done | Pending | `phase-9-plan.md`, `b54bc5e` |
| 10 Content management | Done | Pending | `phase-10-plan.md`, `158b4e7` |
| 11 Storefront shell, search, cart | Done | Pending; migration `guest_cart` | `phase-11-plan.md`, `27ea09e` |
| 12 Landing page | Built on placeholders | **Blocked**: real photography (B-06), reference recording (B-03), your visual approval | `phase-12-plan.md`, `f41f334` |
| 13 Browsing, product, enquiries | Done | Pending; migration `enquiries` | `phase-13-plan.md`, `6633419` |
| 14 Customer accounts | Deferred (D-034) | — | — |
| 15 Checkout, orders, COD, mock payments | Done | Pending; migration `orders_payments`; B-07 defaults are proposals | `phase-15-plan.md`, `1ea8eb6`, `2682bc9` |
| 16 Admin operations, notifications | Done | Pending; migration `admin_operations`; D-160 | `phase-16-plan.md`, `73d83dd` |
| 17 Hardening, legal | Partly: SEO, security review, accessibility smoke test, bundle sizes | **Blocked**: Lighthouse/axe packages (D-165), legal text (OD-12), analytics (OD-20) | `phase-17-plan.md`, `security-review.md`, `73d83dd` |
| 18 Live gateway | Preparation only | **Blocked**: OD-06 and your approval before any live key | `phase-18-plan.md` |
| 19 Infrastructure, launch | Plan only | **Blocked**: OD-18; launch needs separate approval | `phase-19-plan.md` |

## Verification at the final commit
Run locally in the build container (Node 24.11, PostgreSQL 18.4 on a disposable server):
- format, lint, typecheck, design-token check: pass
- unit tests: 556 passed (31 files plus the provider contract)
- database tests: 418 passed (19 files, each on its own disposable database)
- production build: pass; `npm audit`: 0 vulnerabilities
- end-to-end (Playwright, Chromium): **62 passed**, covering E2E-1 (desktop and mobile), E2E-2, E2E-3, E2E-4, E2E-5, E2E-6, keyboard checks (E2E-7 parts), landing acceptance tests, accessibility structure, SEO
- drift check for every migration on a fresh database: "No difference detected"

**Not run:** CI on this branch (the workflow runs on pull requests and `main`); Lighthouse; axe; the backup restore test (E-05); any test against a payment sandbox; any test with real products or photographs.

## Decisions waiting for you (most important first)
1. **Gate approvals** for Phases 8–16, and the five migrations (`catalogue_search`, `guest_cart`, `enquiries`, `orders_payments`, `admin_operations`).
2. **B-07 checkout terms:** shipping fee and free threshold, COD limit, fee, excluded PIN codes and 48-hour window, returns policy text, launch offer. Defaults are in the admin, marked as proposals (D-150).
3. **D-160:** may Fulfilment cancel an unconfirmed COD order?
4. **OD-06 gateway** and **OD-22 launch mode**; **OD-19 email provider**; **OD-18 hosting**.
5. **D-165:** approve `@axe-core/playwright` and Lighthouse so the Phase 17 targets can be measured.
6. Content you must supply or verify: products and photographs (B-06), brand assets (B-04), GST verification (B-14), legal texts (OD-12), Rehma Foundation content (OD-13).
7. Proposed choices D-135 to D-166: confirm or change.

## What was deliberately not done
No live payments, no real emails or messages, no deployment, no DNS or production configuration, no invented products, prices, reviews, tax rates, legal text, donation figures or Rehma claims, no AI or stock photography presented as merchandise, no merge into `main`.

## Deployment and rollback
See `phase-19-plan.md` §4. In short: green CI on the release commit, an RDS snapshot, approved migrations with `prisma migrate deploy`, a rolling API deploy with the health check, static builds to S3 and CloudFront. To roll back, redeploy the previous image and static build; restore the snapshot only if a migration must be undone.
