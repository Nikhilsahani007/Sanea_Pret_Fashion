# End-to-end tests

Playwright tests for full admin and, later, shopper journeys (`docs/testing-strategy.md` §4).

## What runs

`admin.spec.ts` (Phase 8, `docs/phase-8-ui-plan.md` §4) covers:
- **Accounts:** the first Owner's invite link through to a keyboard-only sign-in, with QR enrolment; an invite and sign-in for every other role.
- **Catalogue:** built, published, archived and republished through the screens, then checked through the public API and search.
- **Role limits:** checked in the UI and in the API.
- **Accessibility and layout:** axe (WCAG 2.2 AA tags) and a horizontal-scroll check at 1440, 768 and 390 px.
- **Screenshots** for review, written to `docs/reviews/admin/<date>/`.

`storefront.spec.ts` (Phase 11, `docs/phase-11-plan.md` §8) seeds synthetic data (`support/seed-storefront.ts`) and covers:
- **Shell:** the logo, announcement, pills and footer from published content.
- **Shopping:** header search to a result, a size added through the sheet, quantity changes in the drawer, the bag kept across a reload, the `/cart` page.
- **Keyboard only:** search, size, add and close, with focus kept inside the sheets.
- **Pages:** a published page, the unpublished Rehma page as not found, Phase 13 links as coming soon.
- **Accessibility and layout:** axe and horizontal scroll at 1440, 768 and 390 px (screenshots to `docs/reviews/storefront/<date>/`), plus 1024 and 375 px.

## How to run

1. Start a disposable PostgreSQL 18 on loopback, for example:

   ```
   docker run -d --rm --name sanea-e2e-pg -e POSTGRES_USER=sanea -e POSTGRES_DB=sanea_test -e POSTGRES_PASSWORD=<random> -p 127.0.0.1:55435:5432 postgres:18.6-alpine
   ```

2. Set `TEST_DATABASE_URL=postgresql://sanea:<random>@127.0.0.1:55435/sanea_test`. Only a `sanea_test…` database on loopback is accepted (D-059).
3. Optional: `npm run fonts:fetch`, so the screenshots use the brand fonts.
4. Run `npx playwright test`.

The global setup (`global-setup.ts`):
- creates and migrates the database `sanea_test_e2e`;
- builds the admin and the storefront;
- starts the API (`support/api-server.ts`, test-only, with higher auth rate limits), the development image server, and `vite preview` for the admin on `http://localhost:5174` and the storefront on `http://localhost:5173`;
- creates the first Owner's invite with `admin:create-owner`.

Secrets are random, held in memory and never printed. Teardown stops everything, drops the database and deletes the media folder. Stop the container afterwards.

Browsers: the tests use the installed Microsoft Edge (`channel: "msedge"`), so `npx playwright install` is not needed on Windows. In CI on Linux, Edge or Chromium would have to be installed first; end-to-end tests are not part of CI yet.
