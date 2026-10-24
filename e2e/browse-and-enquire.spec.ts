// Phase 13: browsing steps of E2E-1 (landing → category pill → filter →
// product → add to bag) and E2E-4 (enquiry form and WhatsApp link), on
// desktop and mobile. Demo seed: TEST data and placeholder images.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { browseToProduct } from "./support/browse.ts";

const shots = join(
  import.meta.dirname,
  "..",
  "docs",
  "reviews",
  "browsing",
  "2026-10-24",
);
mkdirSync(shots, { recursive: true });
test.use({ baseURL: "http://localhost:5173" });

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
] as const) {
  test(`${name}: pill → filter → product → choose colour and size → add to bag`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await browseToProduct(page);
    await page.screenshot({
      path: join(shots, `listing-${name}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "TEST Kurta A" }).click();
    await expect(
      page.getByRole("heading", { name: "TEST Kurta A", level: 1 }),
    ).toBeVisible();
    // Colour choice swaps the gallery and is kept in the URL.
    await page.getByRole("button", { name: /TEST Blush/ }).click();
    await expect(page).toHaveURL(/colour=test-demo-blush/);
    await expect(
      page.getByRole("list", { name: /in TEST Blush/ }),
    ).toBeVisible();
    const add = page.getByRole("button", { name: "Choose a size" });
    await expect(add).toBeDisabled();
    await page.getByRole("button", { name: "M", exact: true }).click();
    await expect(page).toHaveURL(/size=M/);
    await page.getByRole("button", { name: "Add to bag" }).click();
    const bag = page.getByRole("dialog", { name: /^Bag/ });
    await expect(bag).toBeVisible();
    await expect(bag.getByText("TEST Blush · M")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.screenshot({
      path: join(shots, `product-${name}.png`),
      fullPage: true,
    });
  });
}

test("deep link selects colour and size; sold-out sizes cannot be chosen", async ({
  page,
}) => {
  await page.goto("/products/test-demo-suit-b?size=M");
  await expect(
    page.getByRole("heading", { name: "TEST Suit B", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "M, sold out" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Sold out", exact: true }),
  ).toBeDisabled();
});

test("E2E-4 (mobile): enquiry form validates, then sends; WhatsApp link carries the product", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/products/test-demo-kurta-a?colour=test-demo-pearl&size=L");
  await page.getByRole("button", { name: "Enquire" }).click();
  const sheet = page.getByRole("dialog", { name: "Enquire" });
  await sheet.getByRole("button", { name: "Send" }).click();
  await expect(sheet.getByText("Enter your name.")).toBeVisible();
  await expect(
    sheet.getByText("Tick this so we may reply to you."),
  ).toBeVisible();
  await expect(sheet.getByLabel("Your name")).toBeFocused();
  await page.screenshot({ path: join(shots, "enquiry-errors-390.png") });
  await sheet.getByLabel("Your name").fill("TEST Shopper");
  await sheet.getByLabel("Mobile number").fill("98765 43210");
  await sheet
    .getByLabel("Your question")
    .fill("Is the TEST kurta lined? TEST enquiry.");
  await sheet.getByRole("checkbox", { name: /may contact me/ }).check();
  await page.waitForTimeout(2100); // the form must be open at least 2 s (bot check)
  await sheet.getByRole("button", { name: "Send" }).click();
  await expect(
    sheet.getByText("Thank you. We have your message"),
  ).toBeVisible();
  await sheet.getByRole("button", { name: "Close", exact: true }).click();

  const wa = page.getByRole("link", { name: "Ask on WhatsApp" });
  const href = await wa.getAttribute("href");
  const url = new URL(href!);
  expect(url.hostname).toBe("wa.me");
  expect(url.pathname).toBe("/919000000000");
  const text = url.searchParams.get("text")!;
  expect(text).toContain("TEST Kurta A");
  expect(text).toMatch(/SKU: TEST-D01-PE-L/);
  expect(text).toContain("Choice: TEST Pearl, L");
  expect(text).toContain(
    "/products/test-demo-kurta-a?colour=test-demo-pearl&size=L",
  );
  const logged = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/v1/events/whatsapp-click") && r.status() === 204,
  );
  const popup = page.waitForEvent("popup");
  await wa.click();
  await logged;
  await (await popup).close();
});

test("contact page and collections index", async ({ page }) => {
  await page.goto("/contact");
  await expect(
    page.getByRole("heading", { name: "Contact", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "care@example.test" }),
  ).toBeVisible();
  await page.goto("/collections");
  await page.getByRole("link", { name: "TEST New Season" }).click();
  await expect(
    page.getByRole("heading", { name: "TEST New Season", level: 1 }),
  ).toBeVisible();
  await page.goto("/shop/no-such-category");
  await expect(
    page.getByRole("heading", { name: "Not found", level: 1 }),
  ).toBeVisible();
});
