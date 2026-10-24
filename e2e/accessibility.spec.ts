// Automated accessibility checks (testing-strategy.md §2, D-165): axe-core
// with the WCAG 2.0, 2.1 and 2.2 A and AA rules on every storefront template
// and the main admin screens, at 390 and 1440 px. Serious and critical
// violations fail the test. axe finds only part of WCAG: the keyboard tests
// elsewhere and a manual screen-reader pass are still required. The signed-in
// admin screens are scanned in admin-catalogue.spec.ts, which already holds
// the sessions (the sign-in rate limit, D-074, allows few new sign-ins).
import { expect, test } from "@playwright/test";

import { scan } from "./support/axe.ts";

const STORE = "http://localhost:5173";
const STOREFRONT = [
  ["home", "/"],
  ["category", "/shop/test-demo-kurtas"],
  ["product", "/products/test-demo-kurta-a"],
  ["bag", "/cart"],
  ["checkout", "/checkout"],
  ["contact", "/contact"],
  ["policy", "/policies/returns"],
  ["search", "/search?q=kurta"],
  ["not found", "/no-such-page"],
] as const;

for (const width of [390, 1440]) {
  for (const [name, path] of STOREFRONT) {
    test(`axe storefront ${name} at ${width} px`, async ({ browser }) => {
      // axe needs a page from an explicit context.
      const context = await browser.newContext({
        baseURL: STORE,
        viewport: { width, height: 900 },
      });
      const page = await context.newPage();
      if (name === "bag" || name === "checkout") {
        await page.goto("/products/test-demo-dupatta-a");
        await page.getByRole("button", { name: "Free Size" }).click();
        await page.getByRole("button", { name: "Add to bag" }).click();
        await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
      }
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(await scan(page)).toEqual([]);
      await context.close();
    });
  }
}

test("axe admin sign-in screen", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://localhost:5174",
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByLabel("Email")).toBeVisible();
  expect(await scan(page)).toEqual([]);
  await context.close();
});
