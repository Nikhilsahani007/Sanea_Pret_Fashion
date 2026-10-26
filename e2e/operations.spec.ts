// Phase 16 admin operations end to end (phase-16-plan.md; testing-strategy.md
// §4): E2E-2 admin part (a storefront COD order confirmed, packed, shipped
// and delivered by Fulfilment; the guest's page follows), declining a COD
// order with a reason (D-181), E2E-5 (a hero slide edited and published, the
// storefront shows it) and E2E-6 (stock to zero: "sold out" and checkout
// blocked). Runs after admin.spec.ts, which creates the staff accounts, and
// checkout.spec.ts, whose synthetic product it uses. Axe at three widths and
// screenshots for review.
import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

const ADMIN = "http://localhost:5174";
const SHOP = "http://localhost:5173";
const SHOTS = `docs/reviews/operations/${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;
const WIDTHS = [1440, 768, 390] as const;
type Role = "MANAGER" | "CATALOGUE_EDITOR" | "FULFILMENT";

test.describe.configure({ mode: "serial" });

async function as(browser: Browser, role: Role) {
  const context = await browser.newContext({
    storageState: `test-results/e2e-state-${role}.json`,
    baseURL: ADMIN,
  });
  return { context, page: await context.newPage() };
}

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

/** Axe and overflow at each width, plus a full-page screenshot for review. */
async function review(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
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
  await page.setViewportSize({ width: 1440, height: 900 });
}

/** A guest buys one TEST Checkout Kurta in `size` with cash on delivery. */
async function placeCod(page: Page, size: "M" | "L"): Promise<string> {
  await page.goto(`${SHOP}/products/test-checkout-kurta`);
  await page.getByRole("button", { name: size, exact: true }).click();
  await page.getByRole("button", { name: /^Add to bag/ }).click();
  await page
    .getByRole("dialog", { name: "Your bag" })
    .getByRole("link", { name: "Checkout", exact: true })
    .click();
  await page.getByLabel("Email").fill("shopper@example.test");
  await page.getByLabel("Mobile number").fill("90000 00003");
  await page.getByLabel("Full name").fill("TEST Shopper");
  await page.getByLabel("Address", { exact: true }).fill("TEST 1 Example Road");
  await page.getByLabel("Town or city").fill("Lucknow");
  await page
    .getByLabel("State or union territory")
    .selectOption({ label: "Uttar Pradesh" });
  await page.getByLabel("PIN code").fill("226001");
  await page.getByRole("radio", { name: /Cash on delivery/ }).click();
  await page.getByRole("button", { name: /^Place order/ }).click();
  await expect(
    page.getByRole("heading", { name: "Thank you. Your order is placed." }),
  ).toBeVisible();
  const title = await page
    .getByRole("heading", { name: /^Order SP-\d{4}-\d{6}$/, level: 1 })
    .textContent();
  return title!.replace("Order ", "");
}

/** Chooses a next step on the order page and submits its form. */
async function step(
  page: Page,
  no: string,
  action: string,
  status: string,
  fill?: (form: ReturnType<Page["getByRole"]>) => Promise<void>,
) {
  await page.getByRole("button", { name: action, exact: true }).click();
  const form = page.getByRole("form", { name: action });
  if (fill) await fill(form);
  await form.getByRole("button", { name: action, exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Order ${no}: ${status}.` }),
  ).toBeVisible();
}

test("E2E-2 admin part: Fulfilment confirms, packs, prints the slip, ships and delivers a COD order; the guest's page follows", async ({
  browser,
}) => {
  const shop = await browser.newPage();
  const no = await placeCod(shop, "M");

  const { context, page } = await as(browser, "FULFILMENT");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
  // Fulfilment sees orders and stock, not enquiries.
  await expect(page.getByRole("link", { name: /Open enquiries/ })).toHaveCount(
    0,
  );
  await review(page, "dashboard-fulfilment");
  await page.getByRole("link", { name: /COD orders to confirm/ }).click();
  await expect(page).toHaveURL(/status=PENDING_CONFIRMATION/);
  await review(page, "orders");
  await page.getByRole("link", { name: no, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Order ${no}`, level: 1 }),
  ).toBeVisible();
  // Before confirmation Fulfilment may decline a COD order (D-181).
  await expect(
    page.getByRole("button", { name: "Decline COD order" }),
  ).toBeVisible();
  await review(page, "order-to-confirm");

  await step(page, no, "Confirm order", "Confirmed");
  // A confirmed order is cancelled only by the Owner or a Manager.
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(
    0,
  );
  await step(page, no, "Mark packed", "Packed");

  await page.getByRole("link", { name: "Packing slip" }).click();
  await expect(
    page.getByText("Cash on delivery: collect ₹2,499"),
  ).toBeVisible();
  await expect(page.getByText("TEST-CO-M")).toBeVisible();
  await review(page, "packing-slip");
  await page.getByRole("link", { name: "Back to the order" }).click();

  await step(page, no, "Mark shipped", "Shipped", async (form) => {
    await form.getByLabel(/^Courier/).fill("TEST Courier");
    await form.getByLabel(/^Tracking number/).fill("TEST-TRK-001");
    await form
      .getByLabel(/^Tracking link/)
      .fill("https://track.example.test/TEST-TRK-001");
  });
  await expect(page.getByText(/with TEST Courier, tracking/)).toBeVisible();
  await step(page, no, "Mark delivered", "Delivered");
  await expect(page.getByText(/Collected · ₹2,499/)).toBeVisible();
  const history = page.getByRole("region", { name: "History" });
  for (const s of ["Confirmed", "Packed", "Shipped", "Delivered"])
    await expect(history.getByText(s, { exact: true })).toBeVisible();
  await review(page, "order-delivered");
  await context.close();

  // The guest's order page follows, with the tracking details.
  await shop.reload();
  await expect(
    shop.getByRole("heading", { name: "Your order was delivered." }),
  ).toBeVisible();
  await expect(shop.getByText("TEST-TRK-001")).toBeVisible();
  await expect(
    shop.getByRole("link", { name: "Track your parcel" }),
  ).toHaveAttribute("href", "https://track.example.test/TEST-TRK-001");
  await shop.close();
});

test("D-181: Fulfilment declines an unconfirmed COD order; a reason is required and OTHER needs a note", async ({
  browser,
}) => {
  const shop = await browser.newPage();
  const no = await placeCod(shop, "M");
  await shop.close();
  const { context, page } = await as(browser, "FULFILMENT");
  await page.goto(`/orders/${no}`);
  await page.getByRole("button", { name: "Decline COD order" }).click();
  const form = page.getByRole("form", { name: "Decline COD order" });
  await form.getByRole("button", { name: "Decline COD order" }).click();
  await expect(
    form.getByText("Choose why the order is cancelled.").first(),
  ).toBeVisible();
  await form.getByLabel(/^Reason/).selectOption("OTHER");
  await form.getByRole("button", { name: "Decline COD order" }).click();
  await expect(
    form.getByText("Describe the reason in the note.").first(),
  ).toBeVisible();
  await form
    .getByLabel(/^Note for the order history/)
    .fill("TEST customer ordered twice");
  await form.getByRole("button", { name: "Decline COD order" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Order ${no}: Cancelled.` }),
  ).toBeVisible();
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByText(/Other \(note required\)/)).toBeVisible();
  await expect(history.getByText(/TEST customer ordered twice/)).toBeVisible();
  await context.close();
});

test("catalogue editors see no orders, enquiries or settings", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "CATALOGUE_EDITOR");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Admin" });
  for (const name of ["Orders", "Enquiries", "Store settings"])
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /COD orders/ })).toHaveCount(0);
  await page.goto("/orders");
  await expect(page.getByText("You do not have access to this")).toBeVisible();
  await context.close();
});

test("Manager: enquiries inbox and store settings; the WhatsApp number reaches the storefront", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "MANAGER");
  await page.goto("/enquiries");
  await expect(
    page.getByRole("heading", { name: "Enquiries", level: 1 }),
  ).toBeVisible();
  await review(page, "enquiries");

  await page.goto("/settings");
  const wa = page.getByRole("form", { name: "WhatsApp settings" });
  await wa.getByLabel(/^WhatsApp number/).fill("98765 43210");
  await wa.getByRole("button", { name: "Save WhatsApp" }).click();
  await expect(wa.getByText("WhatsApp saved.")).toBeVisible();
  await review(page, "settings");
  const pub = await page.request.get(
    `${process.env.E2E_API_URL}/api/v1/content/settings/public`,
  );
  expect(((await pub.json()) as { whatsApp: unknown }).whatsApp).toMatchObject({
    number: "+919876543210",
  });
  // Leave the storefront as the other tests expect it: no WhatsApp number.
  await wa.getByRole("button", { name: "Remove the number" }).click();
  await expect(
    wa.getByText(
      "No number is set, so the storefront shows no WhatsApp button.",
    ),
  ).toBeVisible();
  await context.close();
});

test("E2E-5: a Manager edits the first hero slide and publishes it; the storefront shows it", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "MANAGER");
  await page.goto("/content/blocks/home.hero");
  const line = page.getByLabel(/^Campaign line/).first();
  const original = await line.inputValue();
  await line.fill("TEST edited campaign line");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published." }),
  ).toBeVisible();

  const shop = await browser.newPage();
  await shop.emulateMedia({ reducedMotion: "reduce" });
  await shop.goto(SHOP);
  await expect(
    shop.getByText("TEST edited campaign line").first(),
  ).toBeAttached();
  mkdirSync(SHOTS, { recursive: true });
  await shop.screenshot({ path: `${SHOTS}/hero-edited-storefront-1440.png` });
  await shop.close();

  // Put the seeded line back for the tests that follow.
  await line.fill(original);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published." }),
  ).toBeVisible();
  await context.close();
});

test("E2E-6: Fulfilment sets the stock to zero; the storefront shows sold out and blocks checkout", async ({
  browser,
}) => {
  // A shopper has the size in the bag before the stock runs out.
  const shop = await browser.newPage();
  await shop.goto(`${SHOP}/products/test-checkout-kurta`);
  await shop.getByRole("button", { name: "L", exact: true }).click();
  await shop.getByRole("button", { name: /^Add to bag/ }).click();
  await expect(shop.getByRole("dialog", { name: "Your bag" })).toBeVisible();

  const { context, page } = await as(browser, "FULFILMENT");
  await page.goto("/inventory?sku=TEST-CO-L");
  const row = page.getByRole("row").filter({ hasText: "TEST-CO-L" });
  const available = Number(await row.getByRole("cell").nth(1).textContent());
  expect(available).toBeGreaterThan(0);
  await page
    .getByRole("button", { name: "Change stock for TEST-CO-L" })
    .click();
  const change = page.getByRole("form", { name: "Change stock for TEST-CO-L" });
  await change.getByLabel("Kind of change").selectOption("ADJUSTMENT");
  await change.getByLabel("Direction").selectOption("remove");
  await change.getByLabel("Units").fill(String(available));
  await change.getByLabel("Reason").fill("TEST stock count for E2E-6");
  await change.getByRole("button", { name: "Save stock change" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^TEST-CO-L: on hand/ }),
  ).toBeVisible();
  await expect(row.getByText("Sold out")).toBeVisible();
  await context.close();

  // A new visitor sees the size sold out; the shopper's bag cannot check out.
  const visitor = await browser.newPage();
  await visitor.goto(`${SHOP}/products/test-checkout-kurta`);
  await expect(
    visitor.getByRole("button", { name: "L, sold out" }),
  ).toBeDisabled();
  await visitor.close();
  await shop.goto(`${SHOP}/cart`);
  await expect(
    shop
      .getByRole("main")
      .getByRole("button", { name: "Checkout", exact: true }),
  ).toBeDisabled();
  await expect(
    shop.getByText("Sold out. Remove it to check out."),
  ).toBeVisible();
  await expect(
    shop.getByText("Fix the items marked above to check out."),
  ).toBeVisible();
  mkdirSync(SHOTS, { recursive: true });
  await shop.screenshot({
    path: `${SHOTS}/bag-sold-out-1440.png`,
    fullPage: true,
  });
  await shop.close();
});
