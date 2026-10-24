// Shared checkout steps for the storefront journeys.
import { expect, type Page } from "@playwright/test";

export async function fillDetails(page: Page) {
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

/** Buys one Free Size piece with cash on delivery; returns the order number. */
export async function placeCod(page: Page, slug: string): Promise<string> {
  await page.goto(`/products/${slug}`);
  await page.getByRole("button", { name: "Free Size" }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
  await page.goto("/checkout");
  await fillDetails(page);
  await page.getByRole("radio", { name: /Cash on delivery/ }).check();
  await page.getByRole("button", { name: /^Place order/ }).click();
  const heading = page.getByRole("heading", {
    name: /^Order SP-\d{4}-\d{6}$/,
    level: 1,
  });
  await expect(heading).toBeVisible();
  return ((await heading.textContent()) ?? "").replace("Order ", "");
}
