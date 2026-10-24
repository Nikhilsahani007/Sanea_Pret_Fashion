// Shared E2E-1 browsing steps: landing → category pill → size filter → sort.
import { expect, type Page } from "@playwright/test";

export async function browseToProduct(page: Page) {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Categories" })
    .getByRole("link", { name: "Kurtas" })
    .click();
  await expect(page).toHaveURL(/\/shop\/test-demo-kurtas$/);
  await expect(
    page.getByRole("heading", { name: "TEST Kurtas", level: 1 }),
  ).toBeVisible();
  const toggle = page.getByRole("button", { name: "Filter" });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByRole("checkbox", { name: /^XL/ }).click();
  await expect(page.getByRole("checkbox", { name: /^XL/ })).toBeChecked();
  await expect(page).toHaveURL(/size=XL/);
  await expect(page.getByRole("link", { name: "TEST Kurta A" })).toBeVisible();
  await expect(page.getByRole("link", { name: "TEST Kurta B" })).toHaveCount(0);
  await page.getByLabel("Sort by").selectOption("price_asc");
  await expect(page).toHaveURL(/sort=price_asc/);
}
