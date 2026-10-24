# Proposal — axe and Lighthouse (D-165)

Status: **Proposal. Nothing installed.** Installation waits for your explicit approval of D-165. Date: 2026-10-25.

## 1. Why these tools
The documents already name them, so this is not a new technology choice:
- `testing-strategy.md` line 18: "Accessibility | axe-core in Playwright, plus manual keyboard and screen-reader passes | Every page template".
- `testing-strategy.md` line 20: "Performance | Lighthouse CI on a throttled mobile profile | Landing, listing, product, checkout".
- `design-system.md` §10 gate 6 and the Phase 17 verification (performance ≥ 85, accessibility ≥ 95) need numbers that no installed tool produces.

They are not in the `system-architecture.md` §7 "planned" list, so D-080 does not cover them; hence D-165.

## 2. Packages (development only, exact pins)
| Package | Proposed version | Published | Licence | Notes |
|---------|------------------|-----------|---------|-------|
| `@axe-core/playwright` | **4.13.0** | 2026-08-11 | MPL-2.0 | Brings `axe-core` ~4.13; peer `playwright-core` (already present through `@playwright/test` 1.64.1); Node ≥ 22.12. Version 4.14.0 (2026-10-15) is newer but under two weeks old at the time of writing; prefer 4.13.0 now or 4.14.0 after 2026-10-29 |
| `lighthouse` | **13.5.0** | 2026-09-18 | Apache-2.0 | Node ≥ 22.19 (the project uses 24.11); 26 direct dependencies, development only; uses the already installed Chromium through `CHROME_PATH` |

Not proposed: `@lhci/cli` (its last release is 2025-06-25 and it adds a results server the project does not need). A short script runs `lighthouse` and asserts the scores, which is what "Lighthouse CI" needs here.

Versions were read from the npm registry on 2026-10-25 (`npm view`); nothing was downloaded into the project.

## 3. What they will enable
1. **`e2e/accessibility.spec.ts`:** axe scans (WCAG 2.2 A and AA rule tags) of every storefront template: home, category listing, product, bag, checkout, order status, contact, a policy page. Also the admin's sign-in, dashboard, orders, order detail, product editor and settings screens. Each at 390 and 1440 px. The test fails on any `serious` or `critical` violation; any accepted exception is listed in a register with its reason, like the design-token exceptions.
2. **`scripts/lighthouse.ts` and `npm run lighthouse`:** builds the storefront, serves it with `vite preview` against the end-to-end API and demo seed, and runs Lighthouse's default mobile profile (throttled), three times per page, on landing, listing, product and checkout. It fails below performance 85 or accessibility 95 on the median, and saves the JSON and HTML reports under `docs/reviews/lighthouse/<date>/`.
3. **CI:** both run in the existing `e2e` job, after the Playwright suite.

## 4. Limits to state with the results
- Placeholder images and a local API make the performance numbers provisional; measure again with real photography (B-06) and on staging (Phase 19).
- axe finds only part of WCAG; a manual keyboard and screen-reader pass (NVDA and VoiceOver) on checkout and the admin order screens stays required.

## 5. What approving D-165 authorises
Installing exactly these two packages as root development dependencies, recording them in `system-architecture.md` §7, adding the test and script above, and fixing what they find. Anything else needs a separate approval.
