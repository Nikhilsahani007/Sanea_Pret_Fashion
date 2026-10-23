// Storefront end to end (phase-11-plan.md §8): the shell drawn from published
// content, search from the header to a result, a size added through the
// sheet, the quantity changed in the drawer, the bag kept across a reload,
// the /cart page, a keyboard-only run, published pages, axe at three widths,
// no horizontal scroll at 390 px, and screenshots for review. The data is
// synthetic (e2e/support/seed-storefront.ts), in the disposable database.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SHOP = "http://localhost:5173";
const SHOTS = `docs/reviews/storefront/${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;
const WIDTHS = [1440, 768, 390] as const;
// The UI UX Pro Max checklist widths not screenshotted (phase-11-plan.md §7).
const CHECK_WIDTHS = [1024, 375] as const;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/support/seed-storefront.ts"], {
    env: process.env,
    stdio: "pipe",
  });
});

async function axe(page: Page, label: string) {
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

async function noHorizontalScroll(page: Page, label: string) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow, `horizontal scroll on ${label}`).toBeLessThanOrEqual(0);
}

/** Axe and overflow at each width, plus a screenshot for review. */
async function review(page: Page, name: string, fullPage = true) {
  mkdirSync(SHOTS, { recursive: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(350);
    await noHorizontalScroll(page, `${name} at ${width}`);
    await axe(page, `${name} at ${width}`);
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage });
  }
  for (const width of CHECK_WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(350);
    await noHorizontalScroll(page, `${name} at ${width}`);
    await axe(page, `${name} at ${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

const header = (page: Page) =>
  page.getByRole("combobox", { name: "Search the shop" });

test("shell: the logo, announcement, pills and footer come from published content", async ({
  page,
}) => {
  await page.goto(SHOP);
  await expect(
    page.getByRole("img", { name: "Sanéa Pret" }).first(),
  ).toBeVisible();
  await expect(page.getByText("TEST announcement")).toBeVisible();
  const pills = page.getByRole("navigation", { name: "Categories" });
  await expect(pills.getByRole("link", { name: "TEST Kurtas" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Help links" }).getByRole("link", {
      name: "TEST Help",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Sanéa Pret, Effortless Elegance" }),
  ).toBeVisible();
  await review(page, "storefront-home");
  // The skip link is the first stop.
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
});

test("search, size sheet, drawer and /cart: prices from the server, the bag kept across a reload", async ({
  page,
}) => {
  await page.goto(SHOP);
  await header(page).fill("Storefront");
  await expect(
    page.getByRole("option", { name: "TEST Storefront Kurta, product" }),
  ).toBeVisible();
  await header(page).press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Storefront/);
  await expect(
    page.getByRole("heading", { name: "Results for “Storefront”" }),
  ).toBeVisible();
  await expect(page.getByText("From ₹1,299")).toBeVisible();
  await review(page, "storefront-search");

  await page
    .getByRole("button", { name: "Add TEST Storefront Kurta to bag" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Add TEST Storefront Kurta" });
  await expect(
    sheet.getByRole("button", { name: "Choose a size" }),
  ).toBeDisabled();
  await expect(
    sheet.getByRole("button", { name: "S, sold out" }),
  ).toBeDisabled();
  await sheet.getByRole("button", { name: "M", exact: true }).click();
  await expect(sheet.getByText("Only 2 left")).toBeVisible();
  await review(page, "storefront-size-sheet", false);
  await sheet.getByRole("button", { name: "Add to bag · ₹1,299" }).click();

  const bag = page.getByRole("dialog", { name: "Your bag" });
  await expect(bag).toBeVisible();
  await expect(bag.getByText("₹1,299").first()).toBeVisible();
  await bag
    .getByRole("button", {
      name: "One more TEST Storefront Kurta, TEST Ivory, size M",
    })
    .click();
  await bag
    .getByRole("button", {
      name: "One more TEST Storefront Kurta, TEST Ivory, size M",
    })
    .click();
  await expect(
    bag.getByText(
      "Not enough in stock for this quantity. Lower it to check out.",
    ),
  ).toBeVisible();
  await expect(bag.getByText("₹3,897").first()).toBeVisible();
  await review(page, "storefront-cart-drawer", false);
  await page.keyboard.press("Escape");
  await expect(bag).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Add TEST Storefront Kurta to bag" }),
  ).toBeFocused();

  // The cart cookie keeps the bag across a reload; the server re-prices it.
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Bag, 3 items" }),
  ).toBeVisible();
  const cookies = await page.context().cookies(SHOP);
  const cart = cookies.find((c) => c.name === "__Host-sp_cart");
  expect(cart).toMatchObject({
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
  });

  await page.goto(`${SHOP}/cart`);
  await expect(page.getByRole("heading", { name: "Your bag" })).toBeVisible();
  await expect(page.getByText("Subtotal (3 items)")).toBeVisible();
  await review(page, "storefront-cart");
  await page
    .getByRole("button", { name: /^Remove TEST Storefront Kurta/ })
    .click();
  await expect(page.getByText("Your bag is empty.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Bag, 0 items" }),
  ).toBeVisible();
});

test("keyboard only: search, choose a size, add, and close the bag", async ({
  page,
}) => {
  await page.goto(SHOP);
  await header(page).focus();
  await page.keyboard.type("Storefront");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=Storefront/);
  const add = page.getByRole("button", {
    name: "Add TEST Storefront Kurta to bag",
  });
  await add.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: "Add TEST Storefront Kurta" });
  await expect(sheet).toBeVisible();
  // Tab moves through the sheet only (the page behind is inert).
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(
      () => document.activeElement?.closest("dialog[open]") !== null,
    );
    expect(inside).toBe(true);
  }
  await sheet.getByRole("button", { name: "L", exact: true }).focus();
  await page.keyboard.press("Enter");
  await sheet.getByRole("button", { name: "Add to bag · ₹1,299" }).focus();
  await page.keyboard.press("Enter");
  const bag = page.getByRole("dialog", { name: "Your bag" });
  await expect(bag).toBeVisible();
  await expect(page.getByRole("button", { name: "Bag, 1 item" })).toHaveCount(
    1,
  );
  await page.keyboard.press("Escape");
  await expect(bag).toBeHidden();
  await expect(add).toBeFocused();
});

test("pages: a published page renders; the unpublished Rehma page and unknown pages are not found; Phase 13 links are coming soon", async ({
  page,
}) => {
  await page.goto(`${SHOP}/pages/test-storefront-help`);
  await expect(page.getByRole("heading", { name: "TEST Help" })).toBeVisible();
  await expect(page.getByText("TEST synthetic help text.")).toBeVisible();
  await review(page, "storefront-page");
  await page.goto(`${SHOP}/pages/rehma-foundation`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
  await page.goto(`${SHOP}/categories/test-storefront-kurtas`);
  await expect(
    page.getByRole("heading", { name: "This page is coming soon" }),
  ).toBeVisible();
  await review(page, "storefront-coming-soon");
});
