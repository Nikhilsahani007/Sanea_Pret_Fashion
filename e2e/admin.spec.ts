// Admin end to end (phase-8-ui-plan.md §4; P8-UI-AC2 to AC5, AC7): invite to
// first sign-in with QR enrolment, sign-in through the shell for every role,
// the catalogue built and published through the screens and found through the
// public API, role limits in the UI and the API, keyboard-only sign-in, axe
// scans, no horizontal scroll at 390 px, and screenshots for review.
import { createHmac } from "node:crypto";
import { mkdirSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";

const ADMIN = "http://localhost:5174";
// One folder per run date (India time), so a later run never overwrites the
// screenshots recorded as an earlier gate's evidence.
const SHOTS = `docs/reviews/admin/${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())}`;
const WIDTHS = [1440, 768, 390] as const;
const PASSWORD = "e2e passphrase for testing only";
type Role = "OWNER" | "MANAGER" | "CATALOGUE_EDITOR" | "FULFILMENT";
const ROLE_NAMES: Record<Role, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  CATALOGUE_EDITOR: "Catalogue editor",
  FULFILMENT: "Fulfilment",
};
const state = (role: Role) => `test-results/e2e-state-${role}.json`;
const secrets = new Map<Role, string>();
const invites = new Map<Role, string>();

test.describe.configure({ mode: "serial" });

// ── Helpers ────────────────────────────────────────────────────────────────

function base32(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of text.replace(/[\s=]/g, "").toUpperCase()) {
    value = (value << 5) | alphabet.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 code for the step `offset` steps from now (an authenticator app). */
function totp(secret: string, offset = 0): string {
  const step = Math.floor(Date.now() / 30_000) + offset;
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32(secret)).update(counter).digest();
  const o = h[19]! & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
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

async function noHorizontalScroll(page: Page, label: string) {
  const report = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const overflow = document.documentElement.scrollWidth - width;
    // The outermost elements that stick out, for a useful failure message.
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > width + 1)
      .filter(
        (el) =>
          !el.parentElement ||
          el.parentElement.getBoundingClientRect().right <= width + 1,
      )
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`);
    return { overflow, wide };
  });
  expect(
    report.overflow,
    `horizontal scroll on ${label}: ${report.wide.join(", ")}`,
  ).toBeLessThanOrEqual(0);
}

/** Axe and overflow at each width, plus a full-page screenshot for review. */
async function review(page: Page, name: string) {
  mkdirSync(SHOTS, { recursive: true });
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    await noHorizontalScroll(page, `${name} at ${width}`);
    await axe(page, `${name} at ${width}`);
    await page.screenshot({
      path: `${SHOTS}/${name}-${width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function setUpAccount(page: Page, url: string, role: Role, name: string) {
  await page.goto(url);
  await expect(
    page.getByText(ROLE_NAMES[role], { exact: false }).first(),
  ).toBeVisible();
  expect(new URL(page.url()).hash).toBe(""); // token removed from the address bar
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("New password").fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page
    .getByRole("button", { name: "Continue to two-factor set-up" })
    .click();
  await expect(
    page.getByRole("img", { name: /QR code to add Sanéa Pret Admin/ }),
  ).toBeVisible();
  const secret = (await page.getByTestId("totp-secret").textContent())!.replace(
    /\s/g,
    "",
  );
  secrets.set(role, secret);
  if (role === "OWNER") await axe(page, "account set-up (authenticator step)");
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Confirm and finish" }).click();
  await expect(
    page.getByRole("list", { name: "Recovery codes" }).getByRole("listitem"),
  ).toHaveCount(10);
  await page.getByLabel("I have saved my recovery codes").check();
  await page.getByRole("link", { name: "Continue to sign-in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** Signs in with the keyboard only: Tab, typing and Enter. */
async function signInByKeyboard(page: Page, email: string, role: Role) {
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("6-digit code")).toBeFocused();
  // The set-up code was used in this 30-second step; the next step's code is
  // also accepted (window of one), as an authenticator would show it shortly.
  await page.keyboard.type(totp(secrets.get(role)!, 1));
  await page.keyboard.press("Enter");
  // Staff start at the dashboard (Phase 16).
  await expect(
    page.getByRole("heading", { name: "Today", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText(ROLE_NAMES[role], { exact: false }).first(),
  ).toBeVisible();
}

async function csrf(page: Page): Promise<string> {
  const me = await page.request.get(`${ADMIN}/api/v1/admin/auth/me`);
  expect(me.status()).toBe(200);
  return ((await me.json()) as { csrfToken: string }).csrfToken;
}

async function as(browser: Browser, role: Role) {
  const context = await browser.newContext({
    storageState: state(role),
    baseURL: ADMIN,
  });
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept());
  return { context, page };
}

async function navLabels(page: Page) {
  return page
    .getByRole("navigation", { name: "Admin" })
    .getByRole("link")
    .allTextContents();
}

// ── Tests ──────────────────────────────────────────────────────────────────

test("sign-in screen: screenshots, axe, generic error on wrong details", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await review(page, "sign-in");
  await page.getByLabel("Email").fill("nobody@e2e.example.test");
  await page.getByLabel("Password").fill("not the password at all");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The details are not correct, or the account is locked.",
  );
  await expect(page.getByLabel("6-digit code")).toHaveCount(0);
});

test("Owner: invite link to first sign-in, with QR enrolment and keyboard-only sign-in", async ({
  page,
  context,
}) => {
  const url = process.env.E2E_OWNER_INVITE_URL;
  expect(url, "global setup creates the Owner invite").toBeTruthy();
  await setUpAccount(page, url!, "OWNER", "Olivia Owner");
  await signInByKeyboard(page, "owner@e2e.example.test", "OWNER");
  expect(await navLabels(page)).toEqual([
    "Today",
    "Orders",
    "Enquiries",
    "Products",
    "Inventory",
    "Stock movements",
    "Content",
    "Categories",
    "Collections",
    "Colours",
    "Size charts",
    "Media library",
    "Store settings",
  ]);
  await page.goto("/products");
  await expect(page.getByText("No products yet.")).toBeVisible();
  await context.storageState({ path: state("OWNER") });

  // The Owner invites one person per role (staff screens arrive in a later phase).
  const token = await csrf(page);
  for (const [role, email] of [
    ["MANAGER", "manager@e2e.example.test"],
    ["CATALOGUE_EDITOR", "editor@e2e.example.test"],
    ["FULFILMENT", "fulfilment@e2e.example.test"],
  ] as const) {
    const r = await page.request.post(`${ADMIN}/api/v1/admin/staff/invites`, {
      data: { email, role },
      headers: { "X-CSRF-Token": token, Origin: ADMIN },
    });
    expect(r.status(), role).toBe(201);
    invites.set(role, ((await r.json()) as { inviteUrl: string }).inviteUrl);
  }
});

for (const [role, email, name, nav] of [
  ["MANAGER", "manager@e2e.example.test", "Manav Manager", 13],
  ["CATALOGUE_EDITOR", "editor@e2e.example.test", "Esha Editor", 9],
  ["FULFILMENT", "fulfilment@e2e.example.test", "Farid Fulfilment", 5],
] as const) {
  test(`${role}: invite set-up and sign-in through the shell`, async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: ADMIN });
    const page = await context.newPage();
    await setUpAccount(page, invites.get(role)!, role, name);
    await signInByKeyboard(page, email, role);
    expect(await navLabels(page)).toHaveLength(nav);
    await context.storageState({ path: state(role) });
    await context.close();
  });
}

test("Manager: builds the catalogue, publishes, archives and republishes; found through the public API", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "MANAGER");

  // Category
  await page.goto("/categories");
  await expect(page.getByText("No categories yet.")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("Kurtas");
  await expect(page.getByLabel("Web address")).toHaveValue("kurtas");
  await page.getByLabel("Status", { exact: true }).selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Create category" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "“Kurtas” created." }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");

  // Colour
  await page.goto("/colours");
  await page.getByLabel("Name", { exact: true }).fill("Rose");
  await page.getByLabel("Swatch colour").fill("7A1F3D");
  await expect(
    page.getByRole("img", { name: "Swatch for Rose" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create colour" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "“Rose” created." }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
  await review(page, "colours");

  // Size chart
  await page.goto("/size-charts");
  await page.getByLabel("Name", { exact: true }).fill("Kurta sizes");
  await page.getByLabel("Row 1 size").fill("S");
  await page.getByLabel("S Bust").fill("34");
  await page.getByLabel("S Length").fill("44");
  await page.getByRole("button", { name: "Create size chart" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "“Kurta sizes” created." }),
  ).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
  await review(page, "size-charts");

  // Product
  await page.goto("/products/new");
  await page.getByLabel("Name", { exact: true }).fill("Rose Silk Kurta");
  await page.getByLabel("Category").selectOption({ label: "Kurtas" });
  await page
    .getByLabel("Short description")
    .fill("A straight-cut kurta for e2e testing.");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(
    page.getByRole("heading", { name: "Rose Silk Kurta", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Product created as a draft")).toBeVisible();

  // Publishing without variants or images lists the problems.
  await page.getByRole("button", { name: "Publish" }).click();
  const checklist = page.getByRole("list", { name: "Publishing checklist" });
  await expect(checklist.getByRole("listitem")).toHaveCount(2);

  // Description and details
  await page.getByRole("button", { name: "Add paragraph" }).click();
  await page
    .getByLabel("Block 1 text")
    .fill(
      "Pure **silk** with _hand_ embroidery. See [kurtas](/categories/kurtas).",
    );
  await page.getByLabel("Show the “New” label").check();
  await page.getByLabel("Size chart").selectOption({ label: "Kurta sizes" });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Changes saved" }),
  ).toBeVisible();

  // Variants
  const variantForm = page.getByRole("form", { name: "Add a variant" });
  for (const [size, sku] of [
    ["S", "E2E-ROSE-S"],
    ["M", "E2E-ROSE-M"],
  ] as const) {
    await variantForm.getByLabel("Colour").selectOption({ label: "Rose" });
    await variantForm.getByLabel("Size").selectOption({ label: size });
    await variantForm.getByLabel("SKU").fill(sku);
    await variantForm.getByLabel("Price (₹)", { exact: true }).fill("2499");
    await variantForm.getByRole("button", { name: "Add variant" }).click();
    await expect(
      page.getByRole("cell", { name: sku, exact: true }),
    ).toBeVisible();
  }

  // Image: a synthetic JPEG (no real product photography exists yet, B-03).
  const jpeg = await sharp({
    create: {
      width: 1200,
      height: 1500,
      channels: 3,
      background: { r: 200, g: 200, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
  const imageForm = page.getByRole("form", { name: "Add an image" });
  await imageForm.getByLabel("Image file").setInputFiles({
    name: "e2e-grey.jpg",
    mimeType: "image/jpeg",
    buffer: jpeg,
  });
  await imageForm
    .getByLabel("Alt text")
    .fill("Grey test image standing in for a product photo");
  await imageForm.getByRole("button", { name: "Upload and add" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Image added." }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(
    page.getByRole("img", {
      name: "Grey test image standing in for a product photo",
    }),
  ).toBeVisible();

  // Publish
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published." }),
  ).toBeVisible();
  await expect(
    page.getByText("Published", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByLabel("Web address")).toHaveAttribute("readonly", "");
  await review(page, "product-editor");

  // The public API and search find it (anonymous request, straight to the API).
  const api = process.env.E2E_API_URL!;
  const pub = await page.request.get(
    `${api}/api/v1/catalogue/products/rose-silk-kurta`,
  );
  expect(pub.status()).toBe(200);
  const detail = (await pub.json()) as { name: string; description: unknown };
  expect(detail.name).toBe("Rose Silk Kurta");
  expect(JSON.stringify(detail.description)).toContain('"text":"silk"');
  const search = await page.request.get(`${api}/api/v1/search?q=rose`);
  expect(JSON.stringify(await search.json())).toContain("rose-silk-kurta");

  // Archive (confirmed) hides it; publishing again restores it.
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Archived." }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`${api}/api/v1/catalogue/products/rose-silk-kurta`)
    ).status(),
  ).toBe(404);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Published." }),
  ).toBeVisible();
  expect(
    (
      await page.request.get(`${api}/api/v1/catalogue/products/rose-silk-kurta`)
    ).status(),
  ).toBe(200);

  // Collection with the product in it
  await page.goto("/collections");
  await page.getByLabel("Name", { exact: true }).fill("Eid Edit");
  await page.getByRole("button", { name: "Create collection" }).click();
  await expect(
    page.getByRole("heading", { name: "Eid Edit", level: 1 }),
  ).toBeVisible();
  await page
    .getByLabel("Add a product")
    .selectOption({ label: "Rose Silk Kurta" });
  await page.getByRole("button", { name: "Add to the list" }).click();
  await page.getByRole("button", { name: "Save product order" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Product order saved." }),
  ).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("PUBLISHED");
  await page.getByRole("button", { name: "Save collection" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Collection saved." }),
  ).toBeVisible();
  await review(page, "collection-editor");

  // Lists
  await page.goto("/collections");
  await expect(page.getByRole("link", { name: "Eid Edit" })).toBeVisible();
  await review(page, "collections");
  await page.goto("/categories");
  await review(page, "categories");
  await page.goto("/products");
  await expect(
    page.getByRole("link", { name: "Rose Silk Kurta" }),
  ).toBeVisible();
  await review(page, "products");
  await page.goto("/media");
  await expect(
    page.getByRole("list", { name: "Uploaded images" }).getByRole("listitem"),
  ).toHaveCount(1);
  await review(page, "media-library");
  await context.close();
});

test("Catalogue editor: prices read-only, no variant creation; the API refuses a price change", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "CATALOGUE_EDITOR");
  await page.goto("/products");
  await page.getByRole("link", { name: "Rose Silk Kurta" }).click();
  const variants = page.getByRole("region", { name: "Variants", exact: true });
  await expect(
    variants.getByText("Prices are set by an Owner or Manager"),
  ).toBeVisible();
  await expect(page.getByRole("form", { name: "Add a variant" })).toHaveCount(
    0,
  );
  await expect(
    variants.getByRole("button", { name: /Change price/ }),
  ).toHaveCount(0);

  // The API is the authority: a direct price change is refused.
  const productId = page.url().split("/").pop()!;
  const product = (await (
    await page.request.get(`${ADMIN}/api/v1/admin/products/${productId}`)
  ).json()) as {
    variants: { id: string; pricePaise: number }[];
  };
  const token = await csrf(page);
  const refused = await page.request.patch(
    `${ADMIN}/api/v1/admin/products/${productId}/variants/${product.variants[0]!.id}`,
    {
      data: { pricePaise: 100 },
      headers: { "X-CSRF-Token": token, Origin: ADMIN },
    },
  );
  expect(refused.status()).toBe(403);
  const create = await page.request.post(
    `${ADMIN}/api/v1/admin/products/${productId}/variants`,
    {
      data: {
        colourId: "00000000-0000-7000-8000-000000000000",
        sizeId: "00000000-0000-7000-8000-000000000000",
        sku: "E2E-NO",
        pricePaise: 100,
      },
      headers: { "X-CSRF-Token": token, Origin: ADMIN },
    },
  );
  expect(create.status()).toBe(403);
  await axe(page, "product editor (catalogue editor)");
  await context.close();
});

test("Fulfilment: views products only; catalogue editing refused in the UI and the API", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "FULFILMENT");
  await page.goto("/products");
  await page.getByRole("link", { name: "Rose Silk Kurta" }).click();
  await expect(
    page.getByText("Your role can view this product but not change it."),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Publish" })).toHaveCount(0);
  await axe(page, "product editor (fulfilment)");

  await page.goto("/categories");
  await expect(page.getByText("You do not have access to this")).toBeVisible();

  const token = await csrf(page);
  const r = await page.request.post(`${ADMIN}/api/v1/admin/categories`, {
    data: { name: "X", slug: "x" },
    headers: { "X-CSRF-Token": token, Origin: ADMIN },
  });
  expect(r.status()).toBe(403);
  await context.close();
});

test("Inventory: fulfilment receives and adjusts stock; the public product follows; the editor only views", async ({
  browser,
}) => {
  const api = process.env.E2E_API_URL!;
  const publicVariant = async (sku: string) => {
    const r = await (
      await browser.newContext()
    ).request.get(`${api}/api/v1/catalogue/products/rose-silk-kurta`);
    const body = (await r.json()) as {
      variants: { sku: string; availability: string; remaining?: number }[];
    };
    return body.variants.find((v) => v.sku === sku);
  };
  expect(await publicVariant("E2E-ROSE-S")).toMatchObject({
    availability: "SOLD_OUT",
  });

  const { context, page } = await as(browser, "FULFILMENT");
  await page.goto("/inventory");
  const rowS = page.getByRole("row").filter({ hasText: "E2E-ROSE-S" });
  await expect(rowS.getByText("Sold out")).toBeVisible();

  // Receive 5, then remove 2 damaged units (reason required).
  await page
    .getByRole("button", { name: "Change stock for E2E-ROSE-S" })
    .click();
  const change = page.getByRole("form", {
    name: "Change stock for E2E-ROSE-S",
  });
  await change.getByLabel("Units").fill("5");
  await expect(
    change.getByText("On hand will change from 0 to 5; available from 0 to 5."),
  ).toBeVisible();
  await change.getByRole("button", { name: "Save stock change" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "E2E-ROSE-S: on hand 0 → 5." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Change stock for E2E-ROSE-S" })
    .click();
  await change.getByLabel("Kind of change").selectOption("ADJUSTMENT");
  await change.getByLabel("Units").fill("2");
  await change.getByLabel("Reason").fill("Two damaged in the e2e test");
  await change.getByRole("button", { name: "Save stock change" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "E2E-ROSE-S: on hand 5 → 3." }),
  ).toBeVisible();

  // Removing more than on hand is refused before sending.
  await page
    .getByRole("button", { name: "Change stock for E2E-ROSE-S" })
    .click();
  await change.getByLabel("Kind of change").selectOption("CORRECTION");
  await change.getByLabel("Units").fill("4");
  await change.getByLabel("Reason").fill("Recount");
  await change.getByRole("button", { name: "Save stock change" }).click();
  await expect(change.getByLabel("Units")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    change.getByText("On hand cannot go below 0.").first(),
  ).toBeVisible();

  // Low-stock level 4: available 3 is low; the filter and the public page agree.
  const level = page.getByRole("form", {
    name: "Low-stock level for E2E-ROSE-S",
  });
  await level.getByLabel("Low-stock level").fill("4");
  await level.getByRole("button", { name: "Save low-stock level" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "low-stock level set to 4" }),
  ).toBeVisible();
  // The box follows the URL, so wait for it rather than using check().
  await page.getByLabel("Low stock only").click();
  await expect(page.getByLabel("Low stock only")).toBeChecked();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "E2E-ROSE-S" })
      .getByText("Low stock"),
  ).toBeVisible();
  expect(await publicVariant("E2E-ROSE-S")).toMatchObject({
    availability: "LOW_STOCK",
    remaining: 3,
  });
  await page.getByLabel("Low stock only").click();
  await expect(page.getByLabel("Low stock only")).not.toBeChecked();
  await review(page, "inventory");

  // The ledger shows both changes, with who made them.
  await page.goto("/inventory/movements");
  const ledger = page.getByRole("table");
  await expect(
    ledger.getByRole("row").filter({ hasText: "Two damaged in the e2e test" }),
  ).toContainText("−2");
  await expect(
    ledger.getByRole("row").filter({ hasText: "Received" }).first(),
  ).toContainText("Farid Fulfilment");
  await review(page, "stock-movements");
  await context.close();

  // The catalogue editor views stock only; the API refuses a change.
  const editor = await as(browser, "CATALOGUE_EDITOR");
  await editor.page.goto("/inventory");
  await expect(
    editor.page.getByText("Your role can view stock but not change it."),
  ).toBeVisible();
  await expect(
    editor.page.getByRole("button", { name: /Change stock/ }),
  ).toHaveCount(0);
  await editor.page.goto("/inventory/movements");
  await expect(
    editor.page.getByText("You do not have access to this"),
  ).toBeVisible();
  const variantId = (
    (await (
      await editor.page.request.get(
        `${ADMIN}/api/v1/admin/inventory?sku=E2E-ROSE-S`,
      )
    ).json()) as {
      items: { variantId: string }[];
    }
  ).items[0]!.variantId;
  const refused = await editor.page.request.post(
    `${ADMIN}/api/v1/admin/inventory/${variantId}/adjustments`,
    {
      data: { type: "RECEIVED", delta: 1 },
      headers: { "X-CSRF-Token": await csrf(editor.page), Origin: ADMIN },
    },
  );
  expect(refused.status()).toBe(403);
  await editor.context.close();
});

test("Content: drafts stay private; the Rehma page is 404 until the Owner verifies and publishes it", async ({
  browser,
}) => {
  const api = process.env.E2E_API_URL!;
  const anon = (await browser.newContext()).request;
  const publicJson = async (path: string) => {
    const r = await anon.get(`${api}/api/v1/content${path}`);
    return {
      status: r.status(),
      body: r.status() === 200 ? await r.json() : null,
    };
  };
  const SYNTHETIC = "TEST synthetic text for the end-to-end test only.";

  // A catalogue editor drafts and publishes the announcement and the header menu.
  const editor = await as(browser, "CATALOGUE_EDITOR");
  await editor.page.goto("/content");
  await review(editor.page, "content");
  await editor.page.getByRole("link", { name: "Announcement bar" }).click();
  await editor.page
    .getByLabel("Text", { exact: true })
    .fill("TEST e2e announcement draft");
  await editor.page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    editor.page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  expect((await publicJson("/home")).body.announcement).toBeNull();
  await editor.page.getByRole("button", { name: "Publish" }).click();
  await expect(
    editor.page.getByRole("status").filter({ hasText: "Published." }),
  ).toBeVisible();
  expect((await publicJson("/home")).body.announcement).toMatchObject({
    text: "TEST e2e announcement draft",
  });
  await review(editor.page, "content-block-editor");

  await editor.page.goto("/content/navigation/HEADER");
  for (const [label, kind, option] of [
    ["Kurtas", "CATEGORY", "Kurtas"],
    ["Rehma Foundation", "PAGE", "Rehma Foundation (not published)"],
  ] as const) {
    await editor.page.getByRole("button", { name: "Add link" }).click();
    const n = await editor.page
      .getByRole("list", { name: "Links in menu order" })
      .getByRole("listitem")
      .count();
    await editor.page.getByLabel(`Link ${n} label`).fill(label);
    const target = editor.page.getByRole("group", { name: `Link ${n} target` });
    await target.getByLabel("Links to").selectOption(kind);
    await target
      .getByLabel(kind === "PAGE" ? "Page" : "Category", { exact: true })
      .selectOption({ label: option });
  }
  await editor.page.getByRole("button", { name: "Save menu" }).click();
  await expect(
    editor.page.getByRole("status").filter({ hasText: "Menu saved" }),
  ).toBeVisible();
  const nav = (await publicJson("/navigation")).body as {
    menus: Record<string, { label: string }[]>;
  };
  expect(nav.menus.HEADER?.map((i) => i.label)).toEqual(["Kurtas"]);

  // The catalogue editor cannot edit the Rehma page.
  await editor.page.goto("/content/pages/rehma-foundation");
  await expect(
    editor.page.getByText("Only the Owner or a Manager can edit this page."),
  ).toBeVisible();
  await editor.context.close();

  // A Manager edits the Rehma draft; it stays private.
  const manager = await as(browser, "MANAGER");
  await manager.page.goto("/content/pages/rehma-foundation");
  await manager.page.getByLabel("Block 1 text").fill(SYNTHETIC);
  await manager.page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    manager.page.getByRole("status").filter({ hasText: "Draft saved" }),
  ).toBeVisible();
  await expect(
    manager.page.getByRole("region", { name: "Verify and publish" }),
  ).toHaveCount(0);
  expect((await publicJson("/pages/rehma-foundation")).status).toBe(404);
  await manager.context.close();

  // The Owner reviews exactly that draft, verifies and publishes; then unpublishes.
  const owner = await as(browser, "OWNER");
  await owner.page.goto("/content/pages/rehma-foundation");
  const verify = owner.page.getByRole("region", { name: "Verify and publish" });
  await expect(verify.getByText(SYNTHETIC)).toBeVisible();
  await expect(
    verify.getByRole("button", { name: "Verify and publish" }),
  ).toBeDisabled();
  await review(owner.page, "content-rehma-owner");
  await verify.getByLabel(/I have verified that every statement/).check();
  await verify.getByRole("button", { name: "Verify and publish" }).click();
  await expect(
    owner.page
      .getByRole("status")
      .filter({ hasText: "Verified and published" }),
  ).toBeVisible();
  const live = await publicJson("/pages/rehma-foundation");
  expect(live.status).toBe(200);
  expect(JSON.stringify(live.body)).toContain(SYNTHETIC);
  expect(
    (
      (await publicJson("/navigation")).body as {
        menus: Record<string, { label: string }[]>;
      }
    ).menus.HEADER?.map((i) => i.label),
  ).toEqual(["Kurtas", "Rehma Foundation"]);
  await owner.page.getByRole("button", { name: "Unpublish" }).click();
  await expect(
    owner.page.getByRole("status").filter({ hasText: "Unpublished" }),
  ).toBeVisible();
  expect((await publicJson("/pages/rehma-foundation")).status).toBe(404);
  await owner.context.close();
});

test("sign-out ends the session; the shell then asks for sign-in", async ({
  browser,
}) => {
  const { context, page } = await as(browser, "OWNER");
  await page.goto("/products");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/colours");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(
    (await page.request.get(`${ADMIN}/api/v1/admin/auth/me`)).status(),
  ).toBe(401);
  await context.close();
});
