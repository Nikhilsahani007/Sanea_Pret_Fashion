import { defineConfig } from "@playwright/test";

// End-to-end tests live in e2e/. None exist yet, and no browsers are installed (D-036).
// Browsers are installed with `npx playwright install` when the first test is added.
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
});
