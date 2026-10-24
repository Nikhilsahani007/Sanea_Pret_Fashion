import { defineConfig, devices } from "@playwright/test";

// End-to-end tests (testing-strategy.md §4). `e2e/support/start-stack.ts`
// starts a disposable database, the API and the dev servers; it needs
// TEST_DATABASE_URL (loopback). PLAYWRIGHT_CHROMIUM_PATH points at a local
// Chromium when the pinned browser revision is not installed.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: "node e2e/support/start-stack.ts",
    url: "http://localhost:5174",
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});
