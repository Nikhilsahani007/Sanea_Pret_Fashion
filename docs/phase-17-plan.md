# Phase 17 Plan — Hardening and Legal Content

Status: **Engineering work built and tested 2026-10-26 on `phase-12-landing`; the gate needs your review, your answers on OD-14 and OD-20, and lawyer-approved legal text (OD-12).** Started on your approval of the Phase 16 gate (D-192). Ported in part from the reference branch's Phase 17 and adapted to the canonical code.

## 1. Scope (index Phase 17)

SEO and link previews (OD-14), performance budgets, accessibility audit, security review, approved legal and policy text, analytics decision (OD-20). Verification: Lighthouse mobile performance ≥ 85 and accessibility ≥ 95 on landing, listing, product and checkout; no high or critical `npm audit` findings; security checklist complete.

## 2. Decisions this phase needs from you

| # | Question | What is built (proposed, D-193) |
|---|----------|----------------------------------|
| OD-14 | Search engines and link previews: keep the single-page app with a meta endpoint, or move the storefront to server rendering? | Keep the app plus a meta endpoint. The performance budget is met without server rendering (§4), and bots get the same meta from a preview endpoint. Server rendering stays an option if search results disappoint after launch. Hosting must route crawler user agents to the preview endpoint (Phase 19). |
| OD-20 | Analytics: which tool, and is a consent banner needed? | None in release one: no third-party scripts or trackers, fonts self-hosted, so no consent banner is needed. Revisit with the legal review. |
| OD-12 | Privacy policy, terms and retention: who drafts and approves? | **Open, needs you and a lawyer.** Placeholder pages only (§3); no legal text is written by engineering. |

## 3. Implementation

| Area | Files |
|------|-------|
| SEO API | `modules/seo/`: page meta per storefront path (only content that is public now; bag, checkout, orders and search `noindex`); bot preview HTML with every value escaped; `sitemap.xml` and `robots.txt` from published content |
| Storefront meta | `lib/meta.ts`: description, canonical URL, Open Graph tags and `noindex` on every navigation; a default description in `index.html`; `/robots.txt` and `/sitemap.xml` proxied to the API by the dev and preview servers |
| Security review | `docs/security-review.md`: every control in `security-design.md` with status and evidence. Fixed: order-token and webhook-signature headers redacted from logs; lint rule against raw HTML; 10 new orders per cart per hour; the demo seed's raw SQL made a tagged template |
| Performance | The end-to-end stack built the apps with `NODE_ENV=test`, which bundled React's development build (about 650 KB); builds now use `production` (gzipped storefront entry about 125 KB). The checkout loading state keeps a screen's height, removing a 0.14 layout shift |
| Lighthouse | `npm run lighthouse` (`scripts/lighthouse.ts`): production builds, the demo catalogue, default mobile profile with simulated throttling, three runs per page, median against the budget; reports in `docs/reviews/lighthouse/<date>/` |
| Accessibility | `e2e/hardening.spec.ts`: one `h1` and one `main`, `lang="en-IN"`, no image without `alt`, axe (WCAG 2.2 AA tags) and no horizontal scroll on home, shop, category, product and bag at 1440 and 390 px; earlier specs already cover checkout, orders, admin and keyboard use |
| Policy pages | The demo seed publishes Returns and exchanges, Shipping and delivery, Privacy policy and Terms of use as placeholders that say the text is being prepared, linked from the footer (development and demo only) |

## 4. Verification (2026-10-26)

| Check | Result |
|-------|--------|
| Lighthouse (median of 3, mobile) | landing 88 / 100, listing 92 / 100, product 93 / 100, checkout 92 / 100 (performance / accessibility); layout shift 0 on every page. Budget met. Checkout's SEO score is 69 by design (`noindex`). Demo placeholder images and a local API: real photographs and hosting will change the numbers |
| Unit | 823 passed (SEO description text, page meta in the head, per-cart order limit, log redaction) |
| Integration | 496 passed in 24 files; `seo.db-test.ts` 8 |
| End to end | 39 passed twice, including `hardening.spec.ts` 5 |
| Other | format, ESLint (with the raw-HTML rule, checked by a probe), design tokens, typecheck, `npm audit` 0 vulnerabilities, Taste lint 0 fail, both production builds |

## 5. Not done or open

- Legal text (OD-12, B-09) and the returns policy (OD-09): needs you and a lawyer.
- New-device sign-in email: waits for the email provider (OD-19, D-190).
- Hosting tasks from this phase: route crawlers to the preview endpoint, serve `robots.txt` and the sitemap at the site root, Lighthouse in CI on staging (Phase 19).
- An independent security review before launch (Phase 19).
