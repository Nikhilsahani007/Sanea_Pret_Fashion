import { defineConfig } from "@playwright/test";

// End-to-end tests (e2e/). They drive the installed Microsoft Edge
// (channel "msedge"), so no browser download is needed (D-036,
// phase-8-ui-plan.md §4). The global setup starts a disposable stack and needs
// TEST_DATABASE_URL (a sanea_test… database on loopback). One worker: the
// tests build on each other's catalogue data and share one database.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  reporter: "list",
  use: {
    channel: "msedge",
    baseURL: "http://localhost:5174",
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
