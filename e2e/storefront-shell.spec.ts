// Phase 11 storefront shell: announcement bar, header, search with
// suggestions, category pills, footer, the bag drawer and the cart page, at
// 390, 768 and 1440 px. Runs on the demo seed (TEST data, placeholder images).
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

const STORE = "http://localhost:5173";
const shots = join(
  import.meta.dirname,
  "..",
  "docs",
  "reviews",
  "storefront-shell",
  "2026-10-24",
);
mkdirSync(shots, { recursive: true });
test.use({ baseURL: STORE });

async function addToBag(page: Page, slug: string, sku: string, quantity = 1) {
  return page.evaluate(
    async ({ slug, sku, quantity }) => {
      const p = await (
        await fetch(`/api/v1/catalogue/products/${slug}`)
      ).json();
      const v = p.product.variants.find((x: { sku: string }) => x.sku === sku);
      const { csrfToken } = await (await fetch("/api/v1/auth/csrf")).json();
      const res = await fetch("/api/v1/cart/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ variantId: v.id, quantity }),
      });
      return res.status;
    },
    { slug, sku, quantity },
  );
}

for (const [w, h] of [
  [1440, 900],
  [768, 1024],
  [390, 844],
] as const) {
  test(`shell at ${w} px: announcement, header, pills, footer, no sideways scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/about");
    await expect(page.getByText(/^TEST announcement/)).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Sanéa Pret, home" }),
    ).toBeVisible();
    const pills = page
      .getByRole("navigation", { name: "Categories" })
      .getByRole("link");
    await expect(pills).toHaveCount(5);
    await expect(
      page.getByRole("heading", { name: "About", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("contentinfo").getByRole("link", { name: "Returns" }),
    ).toBeVisible();
    // The footer wordmark fits between the page edges on one line.
    const mark = await page.evaluate(() => {
      const el = [...document.querySelectorAll("footer p")].find(
        (p) => p.textContent === "SANÉA PRET",
      )!;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return { left: r.left, right: r.right };
    });
    expect(mark.left).toBeGreaterThanOrEqual(0);
    expect(mark.right).toBeLessThanOrEqual(w);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({
      path: join(shots, `shell-${w}.png`),
      fullPage: true,
    });
    if (w === 390) {
      await expect(page.getByRole("link", { name: "New in" })).toBeHidden();
      await page.getByRole("button", { name: "Menu" }).click();
      await expect(page.getByRole("link", { name: "New in" })).toBeVisible();
    }
  });
}

test("search suggestions by keyboard, and the results page", async ({
  page,
}) => {
  await page.goto("/about");
  await page.getByRole("button", { name: "Search" }).click();
  const box = page.getByRole("combobox", { name: "Search the shop" });
  await expect(box).toBeFocused();
  await box.fill("kurta");
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  await expect(box).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({ path: join(shots, "search-suggestions-1440.png") });
  await box.fill("suit");
  await expect(page.getByRole("option", { name: /TEST Suits/ })).toBeVisible();
  await box.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=suit$/);
  await expect(
    page.getByRole("status").filter({ hasText: /pieces? for “suit”/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "TEST Suit A" })).toBeVisible();
  await page.screenshot({
    path: join(shots, "search-results-1440.png"),
    fullPage: true,
  });
});

test("a search with no results says so", async ({ page }) => {
  await page.goto("/search?q=zzqqxx");
  await expect(page.getByText("Nothing matches “zzqqxx”")).toBeVisible();
});

test("bag drawer: count, keyboard, quantity, warnings and the bag page", async ({
  page,
}) => {
  await page.goto("/about");
  const bag = page.getByRole("button", { name: "Bag, 0 items" });
  await expect(bag).toBeVisible();
  expect(await addToBag(page, "test-demo-kurta-a", "TEST-D01-PE-M", 2)).toBe(
    200,
  );
  await page.reload();
  const bagNow = page.getByRole("button", { name: "Bag, 2 items" });
  await bagNow.click();
  const dialog = page.getByRole("dialog", { name: /Bag/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("₹6,998").first()).toBeVisible();
  await dialog.getByRole("button", { name: "One more" }).click();
  await expect(dialog.getByText("₹10,497").first()).toBeVisible();
  await page.screenshot({ path: join(shots, "bag-drawer-1440.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Bag, 3 items" }),
  ).toBeFocused();

  // Only one unit of TEST Kurta B in S is left after the seed's two; adding three is refused.
  expect(await addToBag(page, "test-demo-kurta-b", "TEST-D02-CH-S", 3)).toBe(
    409,
  );

  await page.goto("/cart");
  await expect(
    page.getByRole("heading", { name: "Bag", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove TEST Kurta A" }).click();
  await expect(
    page.getByRole("main").getByText("Your bag is empty."),
  ).toBeVisible();
});

test("content pages: published pages render, the Rehma page is not found until verified", async ({
  page,
}) => {
  await page.goto("/policies/returns");
  await expect(
    page.getByRole("heading", { name: "Returns and exchanges", level: 1 }),
  ).toBeVisible();
  await page.goto("/rehma-foundation");
  await expect(
    page.getByRole("heading", { name: "Not found", level: 1 }),
  ).toBeVisible();
});

test("keyboard: skip link reaches the content", async ({ page }) => {
  await page.goto("/about");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
});
