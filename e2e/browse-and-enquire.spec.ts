// Browsing, product detail and enquiries end to end (phase-13-plan.md §7):
// the browsing steps of E2E-1 (listing, filter, product, add to bag) and
// E2E-4 (enquiry and WhatsApp on a phone), with axe at 1440, 768 and 390 px,
// no horizontal scroll, and screenshots for review. The data is synthetic
// (e2e/support/seed-browse.ts), in the disposable database.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SHOP = "http://localhost:5173";
const SHOTS = `docs/reviews/browsing/${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;
const WIDTHS = [1440, 768, 390] as const;

test.describe.configure({ mode: "serial" });

test.beforeAll(() => {
  execFileSync(process.execPath, ["e2e/support/seed-browse.ts"], {
    env: process.env,
    stdio: "pipe",
  });
});

type Records = {
  enquiries: {
    name: string;
    phone: string | null;
    email: string | null;
    variantId: string | null;
    consentToContact: boolean;
    ipHash: boolean;
    sourcePath: string;
  }[];
  clicks: string[][];
};
const records = (): Records =>
  JSON.parse(
    execFileSync(process.execPath, ["e2e/support/browse-records.ts"], {
      env: process.env,
      encoding: "utf8",
    }),
  ) as Records;

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
async function review(page: Page, name: string, fullPage = true) {
  mkdirSync(SHOTS, { recursive: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    // From the top, so the sticky header is drawn once.
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
    await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

test("E2E-1 browsing (desktop): shop all, a category, a size filter in the URL, the product, add to bag", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${SHOP}/shop`);
  await expect(
    page.getByRole("heading", { name: "Shop all", level: 1 }),
  ).toBeVisible();
  const filters = page.getByRole("complementary", { name: "Filters" });
  await filters.getByRole("link", { name: "TEST Browse Kurtas" }).click();
  await expect(page).toHaveURL(`${SHOP}/shop/test-browse-kurtas`);
  await expect(
    page.getByRole("heading", { name: "TEST Browse Kurtas", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("3 products", { exact: true })).toBeVisible();
  await review(page, "listing-category");

  // Price under ₹1,000 leaves one product; the filter is in the address.
  // Filters update through the address, so the control settles a moment
  // after the click.
  const under = filters.getByRole("radio", { name: "Under ₹1,000" });
  await under.click();
  await expect(under).toBeChecked();
  await expect(page).toHaveURL(/price=0/);
  await expect(page.getByText("1 product", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("1 product", { exact: true })).toBeVisible();
  await filters.getByRole("button", { name: "Clear all filters" }).click();
  await expect(page.getByText("3 products", { exact: true })).toBeVisible();

  // Sort by price, low to high: the ₹999 kurta first.
  await page.getByLabel("Sort by").selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
  await expect(
    page.getByRole("list", { name: "Products" }).getByRole("heading").first(),
  ).toHaveText("TEST Browse Kurta 3");

  // To the product; colour and size are kept in the address.
  await page.getByRole("link", { name: "TEST Browse Kurta 1" }).click();
  await expect(page).toHaveURL(`${SHOP}/products/test-browse-kurta-1`);
  await expect(
    page.getByRole("heading", { name: "TEST Browse Kurta 1", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "L, sold out" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "M", exact: true }).click();
  await expect(page).toHaveURL(/colour=test-browse-rose&size=M/);
  await page.getByRole("button", { name: "Size guide" }).click();
  const guide = page.getByRole("dialog", { name: "Size guide" });
  await expect(guide.getByRole("columnheader", { name: "Bust" })).toBeVisible();
  await axe(page, "size guide");
  await page.keyboard.press("Escape");
  await expect(guide).toBeHidden();
  await review(page, "product");
  await page.getByRole("button", { name: /^Add to bag · ₹1,899$/ }).click();
  const bag = page.getByRole("dialog", { name: "Your bag" });
  await expect(bag).toBeVisible();
  await expect(bag.getByText("TEST Browse Kurta 1")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("a shared deep link opens with the colour and size chosen; a collection lists its products", async ({
  page,
}) => {
  await page.goto(
    `${SHOP}/products/test-browse-kurta-2?colour=test-browse-ivory&size=L`,
  );
  await expect(page.getByRole("radio", { name: "TEST Ivory" })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "L", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: /^Add to bag · ₹2,499$/ }),
  ).toBeEnabled();

  await page.goto(`${SHOP}/collections/test-browse-edit`);
  await expect(
    page.getByRole("heading", { name: "TEST Browse Edit", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("2 products", { exact: true })).toBeVisible();
  await review(page, "listing-collection");

  await page.goto(`${SHOP}/products/not-a-product`);
  await expect(
    page.getByRole("heading", { name: "Page not found" }),
  ).toBeVisible();
});

test("E2E-4 (phone): filters in a sheet, then an enquiry with consent and a WhatsApp link that logs an anonymous click", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${SHOP}/shop/test-browse-kurtas`);
  await page.getByRole("button", { name: "Filter" }).click();
  const sheet = page.getByRole("dialog", { name: "Filter" });
  const ivory = sheet.getByRole("checkbox", { name: "TEST Ivory" });
  await ivory.click();
  await expect(ivory).toBeChecked();
  await expect(page).toHaveURL(/colour=test-browse-ivory/);
  await axe(page, "filter sheet at 390");
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/filter-sheet-390.png` });
  await sheet.getByRole("button", { name: /^Show / }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("2 products", { exact: true })).toBeVisible();

  await page.goto(
    `${SHOP}/products/test-browse-kurta-1?colour=test-browse-rose&size=M`,
  );
  await page.getByRole("button", { name: "Enquire about this piece" }).click();
  const form = page.getByRole("dialog", { name: "Enquire" });
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByRole("alert")).toContainText(
    "Give an email address or a mobile number so we can reply.",
  );
  await axe(page, "enquiry errors at 390");
  await page.screenshot({ path: `${SHOTS}/enquiry-errors-390.png` });
  await form.getByLabel("Name").fill("TEST Shopper");
  await form.getByLabel("Mobile number").fill("90000 00001");
  await form
    .getByLabel("Message")
    .fill("TEST Is this available in a longer length?");
  await form.getByRole("checkbox").check();
  // A person takes a few seconds; faster forms are treated as bots.
  await page.waitForTimeout(2_100);
  await form.getByRole("button", { name: "Send enquiry" }).click();
  await expect(form.getByText(/We have your message/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/enquiry-sent-390.png` });
  await form.getByRole("button", { name: "Close" }).last().click();

  const stored = records().enquiries.filter((e) => e.name === "TEST Shopper");
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({
    phone: "+919000000001",
    email: null,
    consentToContact: true,
    ipHash: true,
    sourcePath: "/products/test-browse-kurta-1?colour=test-browse-rose&size=M",
  });
  expect(stored[0]!.variantId).not.toBeNull();

  // WhatsApp: the link carries the product, colour, size and SKU; the click
  // is logged without personal data. wa.me itself is not contacted.
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({ status: 200, body: "TEST" }),
  );
  const link = page.getByRole("link", { name: /Ask on WhatsApp/ });
  const href = decodeURIComponent((await link.getAttribute("href")) ?? "");
  expect(href).toContain("https://wa.me/919000000000?text=");
  expect(href).toContain("TEST Browse Kurta 1, TEST Rose, size M");
  expect(href).toContain("SKU: TEST-BR-1-0-M");
  const before = records().clicks.length;
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
  await expect.poll(() => records().clicks.length).toBe(before + 1);
  expect(records().clicks.at(-1)).toEqual([
    "createdAt",
    "id",
    "pagePath",
    "productId",
    "sessionId",
    "variantId",
  ]);
});
