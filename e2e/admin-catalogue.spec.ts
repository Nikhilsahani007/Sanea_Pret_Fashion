// Phase 8 admin journey: sign in through the shell for every role, then
// create, illustrate and publish a product with colour × size variants and
// find it through the public catalogue API. Screenshots for the gate review.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { pageAs, rememberSession, signIn } from "./support/admin.ts";
import { ADMINS } from "./support/env.ts";

const shots = join(
  import.meta.dirname,
  "..",
  "docs",
  "reviews",
  "admin",
  "2026-10-24",
);
mkdirSync(shots, { recursive: true });

test.describe.configure({ mode: "serial" });

test("sign-in screen, wrong password and generic error", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Sign in to admin" }),
  ).toBeVisible();
  await page.screenshot({ path: join(shots, "sign-in-1440.png") });
  await page.getByLabel("Email").fill(ADMINS.OWNER.email);
  await page.getByLabel("Password").fill("not the password at all");
  await page.getByRole("button", { name: "Continue" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText(
    "The details are not correct, or the account is locked.",
  );
  await expect(alert).toBeFocused();
});

for (const role of [
  "OWNER",
  "MANAGER",
  "CATALOGUE_EDITOR",
  "FULFILMENT",
] as const) {
  test(`${role} signs in through the shell`, async ({ page }) => {
    await signIn(page, role);
    await expect(
      page
        .getByRole("navigation", { name: "Admin" })
        .getByText(ADMINS[role].name),
    ).toBeVisible();
    const media = page.getByRole("link", { name: "Media", exact: true });
    if (role === "FULFILMENT") await expect(media).toHaveCount(0);
    else await expect(media).toBeVisible();
    await rememberSession(page, role);
  });
}

test("manager builds and publishes a product", async ({ browser, request }) => {
  const page = await pageAs(browser, "MANAGER");
  await page.screenshot({ path: join(shots, "overview-1440.png") });

  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await page.getByLabel("Name").fill("TEST Kurtas");
  await page.getByRole("button", { name: "Create" }).click();
  const row = page.getByRole("row", { name: /TEST Kurtas/ });
  await expect(row).toBeVisible();
  await row.getByLabel("Status of TEST Kurtas").selectOption("PUBLISHED");
  await expect(row.locator('[data-status="PUBLISHED"]')).toBeVisible();

  await page.getByRole("link", { name: "Colours", exact: true }).click();
  await page.getByLabel("Name").fill("TEST Ivory");
  await page.getByRole("button", { name: "Add colour" }).click();
  await expect(page.getByText("TEST Ivory")).toBeVisible();

  await page.getByRole("link", { name: "Media", exact: true }).click();
  const png = await sharp({
    create: {
      width: 1440,
      height: 1800,
      channels: 3,
      background: { r: 210, g: 205, b: 195 },
    },
  })
    .composite([
      {
        input: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1800"><text x="720" y="900" font-size="96" text-anchor="middle" font-family="sans-serif">TEST PLACEHOLDER</text></svg>',
        ),
      },
    ])
    .png()
    .toBuffer();
  await page.getByLabel(/Image file/).setInputFiles({
    name: "test-placeholder.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Uploaded test-placeholder.png." }),
  ).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: join(shots, "media-1440.png") });

  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "New product" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("TEST Sample Kurta");
  await page
    .getByRole("combobox", { name: "Category", exact: true })
    .selectOption({ label: "TEST Kurtas" });
  await page
    .getByRole("textbox", { name: "Short description", exact: true })
    .fill("TEST data. Not a real product.");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("TEST paragraph one.\n\nTEST paragraph two.");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(
    page.getByRole("heading", { name: "TEST Sample Kurta", level: 1 }),
  ).toBeVisible();

  // Publishing too early explains what is missing.
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByRole("alert").first()).toContainText(
    "Add at least one active variant",
  );

  for (const [size, sku] of [
    ["M", "TEST-SK-IV-M"],
    ["L", "TEST-SK-IV-L"],
  ]) {
    const form = page.locator("form", {
      has: page.getByRole("heading", { name: "Add a variant" }),
    });
    await form.getByLabel("Colour").selectOption({ label: "TEST Ivory" });
    await form.getByLabel("Size").selectOption({ label: size! });
    await form.getByLabel("SKU").fill(sku!);
    await form.getByLabel("Price (₹)").fill("3499");
    await form.getByRole("button", { name: "Add variant" }).click();
    await expect(
      page.getByRole("cell", { name: sku!, exact: true }),
    ).toBeVisible();
  }

  await page.getByRole("button", { name: "Add from media library" }).click();
  await page.getByRole("button", { name: "Add test-placeholder.png" }).click();
  await page
    .getByLabel("Alt text, image 1")
    .fill("TEST placeholder image, not a product photograph");
  await page.getByRole("button", { name: "Save images" }).click();
  await expect(page.getByText("Images saved.")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByText("Published. It is now visible on the storefront."),
  ).toBeVisible();
  await page.screenshot({
    path: join(shots, "product-editor-1440.png"),
    fullPage: true,
  });

  const listing = await request.get(
    "/api/v1/catalogue/products?size=M&colour=test-ivory",
  );
  const body = await listing.json();
  expect(body.items.map((p: { slug: string }) => p.slug)).toEqual([
    "test-sample-kurta",
  ]);
  const search = await (await request.get("/api/v1/search?q=kurta")).json();
  expect(search.items[0].slug).toBe("test-sample-kurta");
});

test("catalogue editor sees prices read-only; fulfilment cannot edit", async ({
  browser,
}) => {
  let page = await pageAs(browser, "CATALOGUE_EDITOR");
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("link", { name: "TEST Sample Kurta" }).click();
  await expect(page.getByText("₹3,499", { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel("Price (₹)")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Add a variant" }),
  ).toHaveCount(0);

  page = await pageAs(browser, "FULFILMENT");
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(page.getByRole("button", { name: "New product" })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "TEST Sample Kurta" }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toBeDisabled();
});

test("mobile layout of the shell and product list", async ({ browser }) => {
  const page = await pageAs(browser, "OWNER", { width: 390, height: 844 });
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "TEST Sample Kurta" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({
    path: join(shots, "products-390.png"),
    fullPage: true,
  });
});

test("keyboard: skip link and focus after navigation", async ({ browser }) => {
  const page = await pageAs(browser, "OWNER");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await page.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(page.locator("main#main")).toBeFocused();
});

test("sign-out ends the session on the server", async ({ browser }) => {
  const page = await pageAs(browser, "OWNER");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to admin" }),
  ).toBeVisible();
  const me = await page.request.get("/api/v1/admin/auth/me");
  expect(me.status()).toBe(401);
});
