// Phase 17 hardening (phase-17-plan.md): page meta and link previews in the
// browser, noindex on private pages, robots.txt and the sitemap at the
// storefront's own address, and a page-structure check (one h1, one main,
// the language, image alt text, axe and no horizontal scroll) on the pages a
// shopper passes through, at 1440 and 390 px. Uses the synthetic product of
// checkout.spec.ts.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SHOP = "http://localhost:5173";

const meta = (page: Page, selector: string) =>
  page.locator(`head ${selector}`).getAttribute("content");

test("a product page carries its description, canonical URL and preview tags", async ({
  page,
}) => {
  await page.goto(`${SHOP}/products/test-checkout-kurta`);
  await expect(page.locator('head meta[property="og:type"]')).toHaveAttribute(
    "content",
    "product",
  );
  expect(await meta(page, 'meta[name="description"]')).toBe(
    "TEST synthetic product.",
  );
  expect(await meta(page, 'meta[property="og:title"]')).toBe(
    "TEST Checkout Kurta · Sanéa Pret",
  );
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute(
    "href",
    `${SHOP}/products/test-checkout-kurta`,
  );
  await expect(page.locator('head meta[name="robots"]')).toHaveCount(0);
});

test("the bag, checkout and unknown pages are not indexed", async ({
  page,
}) => {
  for (const path of ["/cart", "/checkout", "/pages/no-such-page"]) {
    await page.goto(`${SHOP}${path}`);
    await expect(
      page.locator('head meta[name="robots"]'),
      path,
    ).toHaveAttribute("content", "noindex");
  }
});

test("robots.txt and the sitemap are served at the storefront's address", async ({
  request,
}) => {
  const robots = await request.get(`${SHOP}/robots.txt`);
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toContain("Disallow: /checkout");
  expect(text).toContain("Sitemap: http://localhost:5173/sitemap.xml");
  const sitemap = await request.get(`${SHOP}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(
    "<loc>http://localhost:5173/products/test-checkout-kurta</loc>",
  );
  expect(xml).not.toContain("/checkout<");
  expect(xml).not.toContain("rehma-foundation");
});

for (const width of [1440, 390] as const) {
  test(`page structure and axe at ${width} px: home, shop, category, product, bag`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const path of [
      "/",
      "/shop",
      "/shop/test-checkout-kurtas",
      "/products/test-checkout-kurta",
      "/cart",
    ]) {
      await page.goto(`${SHOP}${path}`);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("h1"), path).toHaveCount(1);
      expect(await page.locator("html").getAttribute("lang")).toBe("en-IN");
      // Every image says what it shows, or is marked decorative (alt="").
      expect(
        await page.locator("img:not([alt])").count(),
        `images without alt on ${path}`,
      ).toBe(0);
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal scroll on ${path}`).toBeLessThanOrEqual(0);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations.map((v) => v.id),
        `axe on ${path} at ${width}`,
      ).toEqual([]);
    }
  });
}
