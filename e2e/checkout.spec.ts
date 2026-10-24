// Phase 15 checkout: E2E-1 (browse → bag → prepaid with mock success →
// confirmation, desktop and mobile), E2E-3 (mock failure → retry → success,
// mobile) and the storefront part of E2E-2 (COD order placed). Demo seed:
// TEST data; the mock payment page is test-only and moves no money.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { browseToProduct } from "./support/browse.ts";

const shots = join(
  import.meta.dirname,
  "..",
  "docs",
  "reviews",
  "checkout",
  "2026-10-24",
);
mkdirSync(shots, { recursive: true });
test.use({ baseURL: "http://localhost:5173" });

async function addKurtaA(page: Page) {
  await browseToProduct(page);
  await page.getByRole("link", { name: "TEST Kurta A" }).click();
  await page.getByRole("button", { name: /TEST Blush/ }).click();
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  const bag = page.getByRole("dialog", { name: /^Bag/ });
  await expect(bag.getByText("TEST Blush · M")).toBeVisible();
  await bag.getByRole("link", { name: "View bag and check out" }).click();
  await page.getByRole("main").getByRole("link", { name: "Checkout" }).click();
  await expect(
    page.getByRole("heading", { name: "Checkout", level: 1 }),
  ).toBeVisible();
}

async function fillDetails(page: Page) {
  await page.getByLabel("Email").fill("shopper@example.test");
  await page.getByLabel("Mobile number").fill("98765 43210");
  await page.getByLabel("Full name").fill("TEST Shopper");
  await page.getByLabel("Address", { exact: true }).fill("TEST 1 Example Road");
  await page.getByLabel("Town or city").fill("Lucknow");
  await page
    .getByLabel("State or union territory")
    .selectOption({ label: "Uttar Pradesh" });
  await page.getByLabel("PIN code").fill("226001");
}

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`E2E-1 ${name}: browse, bag, pay online with test success, confirmation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await addKurtaA(page);
    await fillDetails(page);
    await page.getByRole("radio", { name: /Pay online/ }).check();
    const place = page.getByRole("button", { name: /^Place order · ₹3,499$/ });
    await expect(place).toBeEnabled();
    await page.screenshot({
      path: join(shots, `checkout-${name}.png`),
      fullPage: true,
    });
    await place.click();
    await expect(
      page.getByRole("heading", { name: "Test payment", level: 1 }),
    ).toBeVisible();
    await expect(page.getByText(/no money moves/)).toBeVisible();
    await page.getByRole("button", { name: "Pay (test success)" }).click();
    await expect(
      page.getByRole("heading", {
        name: "Thank you. Your order is confirmed.",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /^Order SP-\d{4}-\d{6}$/, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Bag, 0 items" }),
    ).toBeVisible();
    await page.screenshot({
      path: join(shots, `confirmation-${name}.png`),
      fullPage: true,
    });
  });
}

test("E2E-3 mobile: test failure, retry, then success", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await addKurtaA(page);
  await fillDetails(page);
  await page.getByRole("radio", { name: /Pay online/ }).check();
  await page.getByRole("button", { name: /^Place order/ }).click();
  await page.getByRole("button", { name: "Decline (test failure)" }).click();
  await expect(
    page.getByRole("heading", { name: "Your payment did not go through." }),
  ).toBeVisible();
  await page.screenshot({
    path: join(shots, "payment-failed-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the payment again" }).click();
  await page.getByRole("button", { name: "Pay (test success)" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you. Your order is confirmed." }),
  ).toBeVisible();
});

test("E2E-2 storefront part: cash on delivery order placed", async ({
  page,
}) => {
  await page.goto("/products/test-demo-dupatta-a");
  await page.getByRole("button", { name: "Free Size" }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page
    .getByRole("dialog", { name: /^Bag/ })
    .getByRole("link")
    .last()
    .click();
  await page.getByRole("main").getByRole("link", { name: "Checkout" }).click();
  await fillDetails(page);
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you. Your order is placed." }),
  ).toBeVisible();
  await expect(page.getByText(/You pay in cash on delivery/)).toBeVisible();
});

test("checkout: field errors are shown and focused; nothing is placed", async ({
  page,
}) => {
  await page.goto("/products/test-demo-dupatta-a");
  await page.getByRole("button", { name: "Free Size" }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.goto("/checkout");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByText("Choose how you will pay.")).toBeVisible();
  await expect(page).toHaveURL(/\/checkout$/);
});
