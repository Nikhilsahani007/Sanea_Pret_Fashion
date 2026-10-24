// Phase 17 hardening checks that need a browser: page meta for search and
// link previews (OD-14 default), robots.txt and sitemap, and an accessibility
// smoke test of structure on the key pages. This is not a full WCAG audit:
// no axe or Lighthouse package is approved (D-080), so contrast and screen
// reader behaviour are covered by the design tokens' checked ratios and the
// keyboard tests elsewhere.
import { expect, test, type Page } from "@playwright/test";

test.use({ baseURL: "http://localhost:5173" });

test("product page meta: description, canonical and preview tags", async ({
  page,
}) => {
  await page.goto("/products/test-demo-kurta-a");
  await expect(
    page.getByRole("heading", { name: "TEST Kurta A", level: 1 }),
  ).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    "http://localhost:5173/products/test-demo-kurta-a",
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    "content",
    "product",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /\S/,
  );
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
});

test("bag, checkout and unknown pages are not indexed", async ({ page }) => {
  await page.goto("/checkout");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
  await page.goto("/no-such-page");
  await expect(
    page.getByRole("heading", { name: "Not found", level: 1 }),
  ).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    "noindex",
  );
});

test("robots.txt and sitemap.xml are served from published content", async ({
  request,
}) => {
  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Disallow: /checkout");
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(
    "<loc>http://localhost:5173/products/test-demo-kurta-a</loc>",
  );
});

async function structure(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const unlabeled = [...document.querySelectorAll("input, select, textarea")]
      .filter((el) => (el as HTMLInputElement).type !== "hidden" && visible(el))
      .filter((el) => {
        const id = el.id;
        return !(
          el.getAttribute("aria-label") ||
          el.getAttribute("aria-labelledby") ||
          el.closest("label") ||
          (id && document.querySelector(`label[for="${id}"]`))
        );
      })
      .map((el) => el.outerHTML.slice(0, 80));
    return {
      lang: document.documentElement.lang,
      h1: document.querySelectorAll("h1").length,
      main: document.querySelectorAll("main").length,
      imagesWithoutAlt: [...document.images].filter(
        (i) => !i.hasAttribute("alt"),
      ).length,
      unnamedButtons: [...document.querySelectorAll("button")]
        .filter(
          (b) =>
            visible(b) &&
            !(b.textContent?.trim() || b.getAttribute("aria-label")),
        )
        .map((b) => b.outerHTML.slice(0, 80)),
      unlabeled,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
}

for (const path of [
  "/",
  "/shop/test-demo-kurtas",
  "/products/test-demo-kurta-a",
  "/cart",
  "/checkout",
  "/contact",
  "/policies/returns",
]) {
  for (const width of [1440, 390]) {
    test(`structure at ${width} px: ${path}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      if (path === "/checkout") {
        await page.goto("/products/test-demo-dupatta-a");
        await page.getByRole("button", { name: "Free Size" }).click();
        await page.getByRole("button", { name: "Add to bag" }).click();
        await expect(page.getByRole("dialog", { name: /^Bag/ })).toBeVisible();
      }
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      const s = await structure(page);
      expect(s.lang).toBe("en-IN");
      expect(s.h1).toBe(1);
      expect(s.main).toBe(1);
      expect(s.imagesWithoutAlt).toBe(0);
      expect(s.unnamedButtons).toEqual([]);
      expect(s.unlabeled).toEqual([]);
      expect(s.overflow).toBeLessThanOrEqual(0);
    });
  }
}
