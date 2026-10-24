# Phase 17 Plan — Hardening and Legal Content

Status: **Partly done. Engineering evidence ready; the gate also needs Lighthouse results, approved legal text (OD-12) and your analytics decision (OD-20).** Date: 2026-10-24.

## Done
| Area | What | Evidence |
|------|------|----------|
| SEO and link previews (OD-14 default: SPA plus meta endpoint) | `modules/seo/`: page meta per storefront path (published content only; private pages `noindex`), bot preview HTML with every value escaped, `sitemap.xml` and `robots.txt` from published content. Storefront `lib/meta.ts` applies description, canonical, Open Graph and `noindex` on every navigation; the dev server proxies `/robots.txt` and `/sitemap.xml`. Hosting must route known crawler user agents to `/api/v1/seo/preview?path=…` (Phase 19) | `seo.db-test.ts` 7 passed; `hardening.spec.ts` meta, noindex, robots and sitemap tests |
| Accessibility smoke test | One `h1`, one `main`, `lang="en-IN"`, no image without `alt`, no unnamed button, no unlabelled field, no sideways scroll, on home, category, product, bag, checkout, contact and a policy page at 1440 and 390 px. Keyboard tests from earlier phases still pass | `hardening.spec.ts` 14 structure tests passed |
| Security review | `security-review.md`: every control in `security-design.md` with status and evidence. Three fixes made: order token redacted from logs, lint rule banning raw HTML, 10 orders per hour per cart | `app.test.ts` redaction test; lint probe; checkout tests |
| Performance | Production bundles (gzip): storefront first load about 124 KB JavaScript (React, router, query, app) and 6 KB CSS; checkout pages and the validation library load only on checkout (29 KB). Admin 133 KB, never loaded by shoppers. Images are AVIF/WebP at four widths, lazy below the fold; fonts self-hosted | `npm run build` output measured with `gzip -9` |
| Analytics | None installed: no third-party scripts or trackers (OD-20 default) | no analytics package in the lock file |
| Legal pages | Placeholder pages only (returns, shipping, privacy, terms). **No legal text written by engineering** | demo seed; storefront-shell tests |

## Not done (needs approval or input)
- **Lighthouse** (mobile performance ≥ 85, accessibility ≥ 95) and **axe**: no package approved (D-080). Proposed: `@axe-core/playwright` (dev only) and running Lighthouse from CI with the bundled Chromium; needs your approval (D-165).
- **Legal text** (OD-12, B-09): privacy policy, terms, returns and retention need a lawyer; returns policy text needs you (OD-9).
- **Real photography** for meaningful performance and visual results (B-06).
- Admin new-device sign-in email (security-design §9): waits for an email provider (B-08).

## Full verification at this commit
format, lint, typecheck, token check; 549 unit, 418 database tests; build; `npm audit` 0; end-to-end 62 passed.
