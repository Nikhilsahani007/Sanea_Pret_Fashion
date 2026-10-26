// Phase 15 checkout end to end (phase-15-plan.md; testing-strategy.md §4):
// E2E-1 (landing → category pill → filter → product → bag → pay online with
// a test success → confirmation, desktop and mobile), E2E-3 (test failure →
// retry → success, mobile) and the storefront part of E2E-2 (a cash on
// delivery order placed; staff confirmation is Phase 16). Axe at 1440, 768
// and 390 px on checkout and the order page; screenshots for review. The data
// is synthetic (e2e/support/seed-checkout.ts); the test payment page moves no
// money.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SHOP = "http://localhost:5173";
const SHOTS = `docs/reviews/checkout/${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;
const WIDTHS = [1440, 768, 390] as const;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/support/seed-checkout.ts"], {
    env: process.env,
    stdio: "pipe",
  });
});

async function axe(page: Page, label: string) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .filter((a) => a.timeline instanceof DocumentTimeline)
      .every((a) => a.playState !== "running"),
  );
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    result.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
    `axe on ${label}`,
  ).toEqual([]);
}

/** Axe and overflow at each width, plus a screenshot for review. */
async function review(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  const size = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `horizontal scroll on ${name} at ${width}`,
    ).toBeLessThanOrEqual(0);
    await axe(page, `${name} at ${width}`);
    await page.screenshot({
      path: `${SHOTS}/${name}-${width}.png`,
      fullPage: true,
    });
  }
  if (size) await page.setViewportSize(size);
}

/** From the landing page: the category pill, a size filter, the product, the bag. */
async function browseAndAdd(page: Page, mobile: boolean) {
  await page.goto(SHOP);
  await page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link", { name: "TEST Checkout Kurtas" })
    .click();
  await expect(page).toHaveURL(`${SHOP}/shop/test-checkout-kurtas`);
  if (mobile) {
    await page.getByRole("button", { name: "Filter" }).click();
    const sheet = page.getByRole("dialog", { name: "Filter" });
    const m = sheet.getByRole("checkbox", { name: "M", exact: true });
    await m.click();
    await expect(m).toBeChecked();
    await sheet.getByRole("button", { name: /^Show / }).click();
  } else {
    const m = page
      .getByRole("complementary", { name: "Filters" })
      .getByRole("checkbox", { name: "M", exact: true });
    await m.click();
    await expect(m).toBeChecked();
  }
  await expect(page).toHaveURL(/size=M/);
  await page
    .getByRole("list", { name: "Products" })
    .getByRole("link", { name: "TEST Checkout Kurta", exact: true })
    .click();
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: /^Add to bag · ₹2,499$/ }).click();
  const bag = page.getByRole("dialog", { name: "Your bag" });
  await expect(bag.getByText("TEST Checkout Kurta")).toBeVisible();
  await bag.getByRole("link", { name: "Checkout", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Checkout", level: 1 }),
  ).toBeVisible();
}

async function fillDetails(page: Page) {
  await page.getByLabel("Email").fill("shopper@example.test");
  await page.getByLabel("Mobile number").fill("90000 00002");
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
  test(`E2E-1 ${name}: landing, pill, filter, product, bag, pay online with a test success, confirmation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await browseAndAdd(page, name === "mobile");
    await fillDetails(page);
    const online = page.getByRole("radio", { name: /Pay online/ });
    await online.click();
    await expect(online).toBeChecked();
    const place = page.getByRole("button", { name: /^Place order · ₹2,499$/ });
    await expect(place).toBeEnabled();
    if (name === "desktop") await review(page, "checkout");
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
    ).toBeAttached();
    if (name === "desktop") await review(page, "confirmation");
  });
}

test("E2E-3 mobile: a test failure, a retry, then success", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await browseAndAdd(page, true);
  await fillDetails(page);
  await page.getByRole("radio", { name: /Pay online/ }).click();
  await page.getByRole("button", { name: /^Place order/ }).click();
  await page.getByRole("button", { name: "Decline (test failure)" }).click();
  await expect(
    page.getByRole("heading", { name: "Your payment did not go through." }),
  ).toBeVisible();
  await axe(page, "payment failed at 390");
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({
    path: `${SHOTS}/payment-failed-390.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try the payment again" }).click();
  await page.getByRole("button", { name: "Pay (test success)" }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you. Your order is confirmed." }),
  ).toBeVisible();
});

test("E2E-2 storefront part: a cash on delivery order is placed", async ({
  page,
}) => {
  await page.goto(`${SHOP}/products/test-checkout-kurta`);
  await page.getByRole("button", { name: "L", exact: true }).click();
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  await page
    .getByRole("dialog", { name: "Your bag" })
    .getByRole("link", { name: "Checkout", exact: true })
    .click();
  await fillDetails(page);
  const cod = page.getByRole("radio", { name: /Cash on delivery/ });
  await cod.click();
  await expect(cod).toBeChecked();
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you. Your order is placed." }),
  ).toBeVisible();
  await expect(page.getByText(/You pay in cash on delivery/)).toBeVisible();
  await review(page, "cod-placed");
});

test("checkout: field errors are shown and focused; nothing is placed", async ({
  page,
}) => {
  await page.goto(`${SHOP}/products/test-checkout-kurta`);
  await page.getByRole("button", { name: "M", exact: true }).click();
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  // Wait for the bag to hold the line before leaving the page.
  await expect(
    page
      .getByRole("dialog", { name: "Your bag" })
      .getByText("TEST Checkout Kurta"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto(`${SHOP}/checkout`);
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.getByLabel("Email")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByText("Choose how you will pay.")).toBeVisible();
  await axe(page, "checkout errors");
  await expect(page).toHaveURL(`${SHOP}/checkout`);
});
