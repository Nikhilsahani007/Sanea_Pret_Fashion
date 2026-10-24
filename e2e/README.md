# End-to-end tests

Playwright tests for full shopper and admin journeys (`docs/testing-strategy.md` §4).

`e2e/support/start-stack.ts` (run by Playwright's `webServer`) creates a fresh, migrated `sanea_test_e2e` database on the `TEST_DATABASE_URL` server (loopback only), one admin per role with fixed test-only TOTP secrets, starts the API on port 4100 and the Vite dev servers (admin 5174, storefront 5173). Uploaded media go to a temporary folder.

```
npx playwright install chromium          # once
TEST_DATABASE_URL=postgresql://user@127.0.0.1:5433/sanea_test npm run test:e2e
```

If the pinned Chromium revision cannot be installed, set `PLAYWRIGHT_CHROMIUM_PATH` to a local Chromium binary.

Screenshots for gate reviews are written to `docs/reviews/`.

The API allows 10 sign-in requests per 15 minutes per IP (D-074), so tests sign in once per role and reuse the session (`support/admin.ts`).
