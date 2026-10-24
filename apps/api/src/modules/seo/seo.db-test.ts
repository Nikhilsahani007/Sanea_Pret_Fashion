// Phase 17 SEO (OD-14 default): page meta, bot preview HTML, sitemap, robots.
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { STOREFRONT } from "../../platform/testing.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";
import { previewHtml } from "./router.ts";

let h: Harness;

beforeAll(async () => {
  h = await adminHarness();
  const cat = await fx.category(h.db);
  await h.db.category.update({
    where: { id: cat },
    data: { status: "PUBLISHED", slug: "test-seo-kurtas", name: "TEST Kurtas" },
  });
  const live = await fx.product(h.db, cat);
  await h.db.product.update({
    where: { id: live },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
      slug: "test-seo-live",
      name: "TEST <Live> Kurta",
      shortDescription: 'TEST "quoted" & short description',
    },
  });
  const draft = await fx.product(h.db, cat);
  await h.db.product.update({
    where: { id: draft },
    data: { slug: "test-seo-draft" },
  });
});
afterAll(() => h.drop());

const meta = (path: string) =>
  request(h.app).get(`/api/v1/seo/meta?path=${encodeURIComponent(path)}`);

describe("page meta", () => {
  it("describes a published product with its canonical storefront URL", async () => {
    const res = await meta("/products/test-seo-live");
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({
      title: "TEST <Live> Kurta · Sanéa Pret",
      description: 'TEST "quoted" & short description',
      canonical: `${STOREFRONT}/products/test-seo-live`,
      type: "product",
      noindex: false,
    });
  });

  it("says nothing about drafts or unknown pages, and marks private pages noindex", async () => {
    expect((await meta("/products/test-seo-draft")).status).toBe(404);
    expect((await meta("/products/nope")).status).toBe(404);
    expect((await meta("/checkout")).body.meta.noindex).toBe(true);
    expect((await meta("/order/SP-2610-000001")).body.meta.noindex).toBe(true);
    expect((await meta("/")).body.meta.title).toBe(
      "Sanéa Pret · Effortless Elegance",
    );
    expect((await meta("/shop/test-seo-kurtas")).body.meta.title).toBe(
      "TEST Kurtas · Sanéa Pret",
    );
    expect(
      (await request(h.app).get("/api/v1/seo/meta?path=https://evil.test"))
        .status,
    ).toBe(400);
  });
});

describe("bot preview HTML", () => {
  it("escapes every value", async () => {
    const res = await request(h.app).get(
      "/api/v1/seo/preview?path=/products/test-seo-live",
    );
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain(
      "<title>TEST &lt;Live&gt; Kurta · Sanéa Pret</title>",
    );
    expect(res.text).toContain(
      'content="TEST &quot;quoted&quot; &amp; short description"',
    );
    expect(res.text).not.toContain("<Live>");
    expect(res.text).toContain(
      `<link rel="canonical" href="${STOREFRONT}/products/test-seo-live">`,
    );
  });

  it("answers 404 with noindex for unknown pages", async () => {
    const res = await request(h.app).get(
      "/api/v1/seo/preview?path=/products/nope",
    );
    expect(res.status).toBe(404);
    expect(res.text).toContain('<meta name="robots" content="noindex">');
  });

  it("previewHtml never lets markup through", () => {
    const html = previewHtml({
      title: '"><script>alert(1)</script>',
      description: "x",
      canonical: "https://x.test/",
      image: {
        url: 'https://x.test/a.jpg" onload="x',
        alt: "<b>",
        width: 1,
        height: 1,
      },
      type: "website",
      noindex: false,
    });
    expect(html).not.toMatch(/<script|onload="x|<b>/);
  });
});

describe("sitemap and robots", () => {
  it("lists published pages only", async () => {
    const res = await request(h.app).get("/api/v1/seo/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.type).toBe("application/xml");
    expect(res.text).toContain(
      `<loc>${STOREFRONT}/products/test-seo-live</loc>`,
    );
    expect(res.text).toContain(`<loc>${STOREFRONT}/shop/test-seo-kurtas</loc>`);
    expect(res.text).not.toContain("test-seo-draft");
  });

  it("keeps crawlers out of the bag, checkout and orders", async () => {
    const res = await request(h.app).get("/api/v1/seo/robots.txt");
    expect(res.text).toContain("Disallow: /checkout");
    expect(res.text).toContain("Disallow: /order/");
    expect(res.text).toContain(`Sitemap: ${STOREFRONT}/sitemap.xml`);
  });
});
