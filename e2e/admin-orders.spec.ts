// Phase 16 admin operations: E2E-2 (COD order → admin confirms → packed →
// shipped → delivered), E2E-5 (hero edit published to the storefront) and
// E2E-6 (stock to zero → "Sold out" and checkout blocked). Demo seed only.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { pageAs } from "./support/admin.ts";
import { placeCod } from "./support/checkout.ts";

const STORE = "http://localhost:5173";
const shots = join(
  import.meta.dirname,
  "..",
  "docs",
  "reviews",
  "admin-operations",
  "2026-10-24",
);
mkdirSync(shots, { recursive: true });

test("E2E-2: COD order confirmed, packed, shipped and delivered by fulfilment", async ({
  browser,
}) => {
  const shop = await browser.newPage({ baseURL: STORE });
  const no = await placeCod(shop, "test-demo-dupatta-a");
  await expect(
    shop.getByRole("heading", { name: "Thank you. Your order is placed." }),
  ).toBeVisible();

  const page = await pageAs(browser, "FULFILMENT");
  await expect(
    page.getByRole("heading", { name: "COD to confirm" }),
  ).toBeVisible();
  await page.screenshot({
    path: join(shots, "dashboard-fulfilment-1440.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await page.getByLabel("Status").selectOption("PENDING_CONFIRMATION");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page).toHaveURL(/status=PENDING_CONFIRMATION/);
  await page.screenshot({
    path: join(shots, "orders-1440.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: no }).click();
  await expect(
    page.getByRole("heading", { name: `Order ${no}`, level: 1 }),
  ).toBeVisible();
  // Fulfilment may confirm or cancel a COD order before confirmation.
  await expect(
    page.getByRole("button", { name: "Cancel order" }),
  ).toBeVisible();

  const step = async (action: string, fill?: () => Promise<void>) => {
    await page
      .getByRole("button", { name: action, exact: true })
      .first()
      .click();
    const form = page.getByRole("form", { name: action });
    await expect(form).toBeVisible();
    if (fill) await fill();
    await form.getByRole("button", { name: action }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Order moved to" }),
    ).toBeVisible();
  };
  await step("Confirm order");
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(
    0,
  ); // not for Fulfilment now
  await step("Mark packed");
  await page.getByRole("link", { name: "Packing slip" }).click();
  await expect(
    page.getByText("Cash on delivery: collect ₹1,899"),
  ).toBeVisible();
  await page.screenshot({
    path: join(shots, "packing-slip-1440.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "← Order" }).click();
  await step("Mark shipped", async () => {
    await page.getByLabel("Courier").fill("TEST Courier");
    await page.getByLabel("Tracking number").fill("TEST-TRK-001");
  });
  await expect(page.getByText("TEST Courier · TEST-TRK-001")).toBeVisible();
  await step("Mark delivered");
  await expect(page.locator("h1 + span")).toHaveText("Delivered");
  await expect(page.getByText(/collected · ₹1,899/)).toBeVisible();
  await page.screenshot({
    path: join(shots, "order-delivered-1440.png"),
    fullPage: true,
  });

  // The guest's page follows the status.
  await shop.reload();
  await expect(
    shop.getByRole("heading", { name: /Order status: delivered/ }),
  ).toBeVisible();
});

test("D-160: Fulfilment declines an unconfirmed COD order with a reason; OTHER needs a note", async ({
  browser,
}) => {
  const shop = await browser.newPage({ baseURL: STORE });
  const no = await placeCod(shop, "test-demo-dupatta-a");
  const page = await pageAs(browser, "FULFILMENT");
  await page.goto(`/orders/${no}`);
  await page.getByRole("button", { name: "Cancel order" }).click();
  const form = page.getByRole("form", { name: "Cancel order" });
  await form.getByLabel("Reason").selectOption("OTHER");
  await form.getByRole("button", { name: "Cancel order" }).click();
  await expect(
    page.getByText("Describe the reason in the note.").first(),
  ).toBeVisible();
  await form
    .getByLabel("Note for the history")
    .fill("TEST customer changed the size");
  await form.getByRole("button", { name: "Cancel order" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Order moved to" }),
  ).toBeVisible();
  await expect(page.getByText("Other (note required)")).toBeVisible();
  await page.screenshot({
    path: join(shots, "cod-declined-with-reason-1440.png"),
    fullPage: true,
  });
});

test("catalogue editors see no orders", async ({ browser }) => {
  const page = await pageAs(browser, "CATALOGUE_EDITOR");
  await expect(
    page.getByRole("link", { name: "Orders", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "COD to confirm" }),
  ).toHaveCount(0);
});

test("E2E-5: manager edits the first hero slide and publishes; the storefront shows it", async ({
  browser,
}) => {
  const page = await pageAs(browser, "MANAGER");
  await page.getByRole("link", { name: "Homepage", exact: true }).click();
  const hero = page.locator("section", {
    has: page.getByRole("heading", { name: "Hero slides" }),
  });
  const line = hero.getByLabel("Campaign line").first();
  const original = await line.inputValue();
  await line.fill("TEST edited campaign line");
  await hero.getByRole("button", { name: "Save draft" }).click();
  await expect(hero.getByText("Draft saved.")).toBeVisible();
  await hero.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(hero.getByText(/^Published\./)).toBeVisible();
  const shop = await browser.newPage({ baseURL: STORE });
  await shop.goto("/");
  await expect(shop.getByText("TEST edited campaign line")).toBeVisible();
  await shop.screenshot({
    path: join(shots, "hero-edited-storefront-1440.png"),
  });
  // Put the seed's line back for the landing tests.
  await line.fill(original);
  await hero.getByRole("button", { name: "Save draft" }).click();
  await expect(hero.getByText("Draft saved.")).toBeVisible();
  await hero.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(hero.getByText(/^Published\./)).toBeVisible();
});

test("E2E-6: fulfilment sets stock to zero; the storefront shows Sold out and blocks checkout", async ({
  browser,
}) => {
  const shop = await browser.newPage({ baseURL: STORE });
  await shop.goto("/products/test-demo-dupatta-b");
  await shop.getByRole("button", { name: "Free Size" }).click();
  await shop.getByRole("button", { name: "Add to bag" }).click();
  await expect(shop.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
  const product = await (
    await shop.request.get(
      `${STORE}/api/v1/catalogue/products/test-demo-dupatta-b`,
    )
  ).json();
  const sku = product.product.variants[0].sku as string;

  const page = await pageAs(browser, "FULFILMENT");
  await page.getByRole("link", { name: "Inventory", exact: true }).click();
  await page.getByLabel("SKU").fill(sku);
  await page.getByRole("button", { name: "Search" }).click();
  const free = Number(
    await page
      .getByRole("row", { name: new RegExp(sku) })
      .getByRole("cell")
      .nth(4)
      .textContent(),
  );
  await page.getByRole("button", { name: `Adjust ${sku}` }).click();
  await page.getByLabel("Type").selectOption("ADJUSTMENT");
  await page.getByLabel("Direction").selectOption("remove");
  await page.getByLabel("Units").fill(String(free));
  await page.getByLabel("Reason").fill("TEST stock count");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/free 0\./)).toBeVisible();

  // Product pages may be cached for 30 s (public catalogue); a new visitor
  // sees the change at once. The bag and checkout are never cached.
  const visitor = await browser.newPage({ baseURL: STORE });
  await visitor.goto("/products/test-demo-dupatta-b");
  await expect(
    visitor.getByRole("button", { name: "Free Size, sold out" }),
  ).toBeDisabled();
  await shop.goto("/cart");
  await expect(shop.getByText(/sold out/i).first()).toBeVisible();
  await expect(
    shop.getByRole("main").getByRole("link", { name: "Checkout" }),
  ).toHaveAttribute("aria-disabled", "true");
  await shop.goto("/checkout");
  await expect(
    shop.getByRole("alert").filter({ hasText: "need attention" }),
  ).toBeVisible();
  await expect(
    shop.getByRole("button", { name: /^Place order/ }),
  ).toBeDisabled();
  await shop.screenshot({
    path: join(shots, "checkout-blocked-sold-out-1440.png"),
    fullPage: true,
  });
});
