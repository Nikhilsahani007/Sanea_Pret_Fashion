import { defineConfig } from "vitest/config";

// Database integration tests (D-059): `npm run test:integration`.
// Needs TEST_DATABASE_URL; `npm test` never loads these files.
export default defineConfig({
  test: {
    include: ["apps/api/src/**/*.db-test.ts"],
    globalSetup: ["apps/api/src/db/testing/global-setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
