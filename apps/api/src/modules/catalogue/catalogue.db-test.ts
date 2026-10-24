// Phase 8 verification (index): a product with colour × size variants and
// images is published and found by filter and search; roles, prices, audit,
// media safety and public visibility rules through the real API and database.
import { existsSync } from "node:fs";
import { join } from "node:path";

import { AdminRole } from "@sanea/shared";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { STOREFRONT } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";

let h: Harness;
let owner: Session;
let manager: Session;
let editor: Session;
let fulfilment: Session;

const A = "/api/v1/admin";
const description = {
  blocks: [{ type: "paragraph", text: "TEST data. Not a real product." }],
};

/** A test photograph: a PNG carrying EXIF that must not survive. */
async function testImage(width = 1600, height = 2000) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 200, g: 180, b: 170 },
    },
  })
    .withExif({ IFD0: { Copyright: "TEST", Artist: "TEST camera" } })
    .png()
    .toBuffer();
}

const pub = (path: string) =>
  request(h.app).get(`/api/v1${path}`).set("Origin", STOREFRONT);

let categoryId: string;
let ivory: string;
let rose: string;
let sizes: Record<string, string>;
let productId: string;
let assetId: string;

beforeAll(async () => {
  h = await adminHarness();
  owner = await h.signIn(await h.createAdmin(AdminRole.OWNER));
  manager = await h.signIn(await h.createAdmin(AdminRole.MANAGER));
  editor = await h.signIn(await h.createAdmin(AdminRole.CATALOGUE_EDITOR));
  fulfilment = await h.signIn(await h.createAdmin(AdminRole.FULFILMENT));
});
afterAll(() => h.drop());

describe("taxonomy", () => {
  it("lets the catalogue editor create a category with a generated slug", async () => {
    const res = await h.post(
      `${A}/categories`,
      { name: "TEST Kurtas", status: "PUBLISHED" },
      editor,
    );
    expect(res.status).toBe(201);
    expect(res.body.category.slug).toBe("test-kurtas");
    categoryId = res.body.category.id;
  });

  it("refuses fulfilment staff and a duplicate slug", async () => {
    expect(
      (await h.post(`${A}/categories`, { name: "X" }, fulfilment)).status,
    ).toBe(403);
    const dup = await h.post(
      `${A}/categories`,
      { name: "TEST Kurtas" },
      editor,
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("CONFLICT");
  });

  it("refuses a category cycle", async () => {
    const child = await h.post(
      `${A}/categories`,
      { name: "TEST Child", parentId: categoryId },
      editor,
    );
    const res = await h.patch(
      `${A}/categories/${categoryId}`,
      { parentId: child.body.category.id },
      editor,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: "CATEGORY_CYCLE" });
  });

  it("creates colours and lists the six approved sizes", async () => {
    ivory = (
      await h.post(
        `${A}/colours`,
        { name: "TEST Ivory", swatchHex: "#f3eee3" },
        editor,
      )
    ).body.colour.id;
    rose = (
      await h.post(
        `${A}/colours`,
        { name: "TEST Rose", swatchHex: "#C98A8F", position: 1 },
        editor,
      )
    ).body.colour.id;
    const res = await h.get(`${A}/sizes`, fulfilment);
    expect(res.body.sizes.map((s: { label: string }) => s.label)).toEqual([
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "Free Size",
    ]);
    sizes = Object.fromEntries(
      res.body.sizes.map((s: { label: string; id: string }) => [s.label, s.id]),
    );
  });

  it("rejects a bad swatch and unknown fields", async () => {
    expect(
      (await h.post(`${A}/colours`, { name: "Bad", swatchHex: "red" }, editor))
        .status,
    ).toBe(400);
    expect(
      (
        await h.post(
          `${A}/colours`,
          { name: "Bad", swatchHex: "#000000", extra: 1 },
          editor,
        )
      ).status,
    ).toBe(400);
  });
});

describe("media", () => {
  it("re-encodes an upload to AVIF and WebP at the approved widths without metadata", async () => {
    const res = await h.upload(
      await testImage(),
      "image/png",
      editor,
      "C:\\photos\\kurta front.png",
    );
    expect(res.status).toBe(201);
    const asset = res.body.asset;
    assetId = asset.id;
    expect(asset.originalFilename).toBe("kurta front.png");
    expect([asset.width, asset.height]).toEqual([1600, 2000]);
    expect(
      asset.variants.map(
        (v: { format: string; width: number }) => `${v.format}${v.width}`,
      ),
    ).toEqual([
      "avif480",
      "webp480",
      "avif960",
      "webp960",
      "avif1440",
      "webp1440",
    ]);
    const webp = asset.variants.find(
      (v: { format: string; width: number }) =>
        v.format === "webp" && v.width === 960,
    );
    expect(webp.height).toBe(1200);
    const served = await request(h.app)
      .get(webp.url)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(served.status).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    const meta = await sharp(served.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(960);
    // The original stays private: it is not under the public folder.
    const row = await h.db.mediaAsset.findUniqueOrThrow({
      where: { id: assetId },
    });
    expect(
      existsSync(
        join(h.config.mediaDir, "private", row.storageKey, "original.png"),
      ),
    ).toBe(true);
    expect(
      (await request(h.app).get(`/media/${row.storageKey}/original.png`))
        .status,
    ).toBe(404);
  });

  it("checks magic bytes, not the declared type", async () => {
    const res = await h.upload(
      Buffer.from("<svg onload=alert(1)>"),
      "image/png",
      editor,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].message).toMatch(/JPEG, PNG or WebP/);
  });

  it("refuses other content types, oversized dimensions, and non-editors", async () => {
    expect(
      (await h.upload(Buffer.from("x"), "application/octet-stream", editor))
        .status,
    ).toBe(415);
    expect(
      (await h.upload(await testImage(8001, 10), "image/png", editor)).status,
    ).toBe(400);
    expect(
      (await h.upload(await testImage(100, 100), "image/png", fulfilment))
        .status,
    ).toBe(403);
  });

  it("requires the CSRF token", async () => {
    const res = await request(h.app)
      .post("/api/v1/admin/media")
      .set("Origin", "http://localhost:5174")
      .set("Cookie", editor.cookie)
      .set("Content-Type", "image/png")
      .send(await testImage(100, 100));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_FAILED");
  });

  it("keeps small images at their own width", async () => {
    const res = await h.upload(await testImage(300, 400), "image/png", editor);
    expect(
      res.body.asset.variants.map((v: { width: number }) => v.width),
    ).toEqual([300, 300]);
  });
});

describe("products", () => {
  it("creates a draft that the storefront cannot see", async () => {
    const res = await h.post(
      `${A}/products`,
      {
        name: "TEST Sample Kurta",
        categoryId,
        shortDescription: "TEST short description.",
        description,
        fabric: "TEST cotton",
        labels: ["NEW"],
      },
      editor,
    );
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({
      slug: "test-sample-kurta",
      status: "DRAFT",
    });
    productId = res.body.product.id;
    expect((await pub("/catalogue/products/test-sample-kurta")).status).toBe(
      404,
    );
  });

  it("rejects HTML in the description", async () => {
    const res = await h.patch(
      `${A}/products/${productId}`,
      {
        description: { blocks: [{ type: "html", html: "<script>x</script>" }] },
      },
      editor,
    );
    expect(res.status).toBe(400);
  });

  it("explains why it cannot be published yet", async () => {
    const res = await h.post(`${A}/products/${productId}/publish`, {}, editor);
    expect(res.status).toBe(409);
    expect(res.body.error.details.reasons).toEqual([
      "NO_ACTIVE_VARIANT",
      "NO_PRIMARY_IMAGE",
    ]);
  });

  it("needs the price permission to create a variant", async () => {
    const body = {
      colourId: ivory,
      sizeId: sizes.M,
      sku: "test-skt-iv-m",
      pricePaise: 349_900,
    };
    expect(
      (await h.post(`${A}/products/${productId}/variants`, body, editor))
        .status,
    ).toBe(403);
    const res = await h.post(
      `${A}/products/${productId}/variants`,
      body,
      manager,
    );
    expect(res.status).toBe(201);
    expect(res.body.variant).toMatchObject({
      sku: "TEST-SKT-IV-M",
      pricePaise: 349_900,
      stock: { onHand: 0, reserved: 0 },
    });
  });

  it("creates the rest of the colour × size grid and rejects duplicates", async () => {
    for (const [colour, code] of [
      [ivory, "IV"],
      [rose, "RO"],
    ] as const)
      for (const size of ["S", "L"])
        expect(
          (
            await h.post(
              `${A}/products/${productId}/variants`,
              {
                colourId: colour,
                sizeId: sizes[size],
                sku: `TEST-SKT-${code}-${size}`,
                pricePaise: colour === rose ? 399_900 : 349_900,
              },
              manager,
            )
          ).status,
        ).toBe(201);
    const dupCombo = await h.post(
      `${A}/products/${productId}/variants`,
      { colourId: ivory, sizeId: sizes.M, sku: "TEST-OTHER", pricePaise: 1 },
      manager,
    );
    expect(dupCombo.status).toBe(409);
    const badCompare = await h.post(
      `${A}/products/${productId}/variants`,
      {
        colourId: rose,
        sizeId: sizes.M,
        sku: "TEST-SKT-RO-M",
        pricePaise: 399_900,
        compareAtPricePaise: 399_900,
      },
      manager,
    );
    expect(badCompare.status).toBe(400);
  });

  it("lets the editor deactivate a variant but not change its price", async () => {
    const product = (await h.get(`${A}/products/${productId}`, editor)).body
      .product;
    const roseL = product.variants.find(
      (v: { sku: string }) => v.sku === "TEST-SKT-RO-L",
    );
    expect(
      (
        await h.patch(
          `${A}/products/${productId}/variants/${roseL.id}`,
          { pricePaise: 100 },
          editor,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.patch(
          `${A}/products/${productId}/variants/${roseL.id}`,
          { isActive: true },
          editor,
        )
      ).status,
    ).toBe(200);
  });

  it("audits price changes with before and after", async () => {
    const product = (await h.get(`${A}/products/${productId}`, manager)).body
      .product;
    const roseS = product.variants.find(
      (v: { sku: string }) => v.sku === "TEST-SKT-RO-S",
    );
    const res = await h.patch(
      `${A}/products/${productId}/variants/${roseS.id}`,
      { pricePaise: 379_900, compareAtPricePaise: 449_900 },
      manager,
    );
    expect(res.status).toBe(200);
    const entry = await h.db.auditLog.findFirst({
      where: { action: "variant.price_changed", entityId: roseS.id },
    });
    expect(entry?.before).toEqual({
      pricePaise: 399_900,
      compareAtPricePaise: null,
    });
    expect(entry?.after).toEqual({
      pricePaise: 379_900,
      compareAtPricePaise: 449_900,
    });
  });

  it("attaches images, enforcing one primary per colour", async () => {
    const twoPrimaries = await h.put(
      `${A}/products/${productId}/images`,
      {
        images: [
          { mediaAssetId: assetId, alt: "TEST front", role: "PRIMARY" },
          { mediaAssetId: assetId, alt: "TEST again", role: "PRIMARY" },
        ],
      },
      editor,
    );
    expect(twoPrimaries.status).toBe(400);
    const missingAlt = await h.put(
      `${A}/products/${productId}/images`,
      {
        images: [{ mediaAssetId: assetId, alt: "  ", role: "PRIMARY" }],
      },
      editor,
    );
    expect(missingAlt.status).toBe(400);
    const res = await h.put(
      `${A}/products/${productId}/images`,
      {
        images: [
          {
            mediaAssetId: assetId,
            alt: "TEST placeholder, front",
            role: "PRIMARY",
          },
          {
            mediaAssetId: assetId,
            alt: "TEST placeholder, rose",
            role: "PRIMARY",
            colourId: rose,
          },
          {
            mediaAssetId: assetId,
            alt: "TEST placeholder, detail",
            role: "GALLERY",
          },
        ],
      },
      editor,
    );
    expect(res.status).toBe(200);
    expect(res.body.product.images).toHaveLength(3);
  });

  it("publishes, and the storefront shows the detail with availability", async () => {
    // Stock comes from the inventory module in Phase 9; set it directly here.
    const variants = await h.db.productVariant.findMany({
      where: { productId },
    });
    const stock: Record<string, number> = {
      "TEST-SKT-IV-M": 10,
      "TEST-SKT-IV-S": 2,
      "TEST-SKT-IV-L": 0,
      "TEST-SKT-RO-S": 1,
      "TEST-SKT-RO-L": 0,
    };
    for (const v of variants)
      await h.db.inventoryLevel.update({
        where: { variantId: v.id },
        data: { onHand: stock[v.sku] ?? 0 },
      });

    const res = await h.post(`${A}/products/${productId}/publish`, {}, editor);
    expect(res.status).toBe(200);
    expect(res.body.product.status).toBe("PUBLISHED");

    const detail = (await pub("/catalogue/products/test-sample-kurta")).body
      .product;
    expect(detail).toMatchObject({
      fromPricePaise: 349_900,
      currency: "INR",
      labels: ["NEW"],
    });
    expect(detail.colours.map((c: { name: string }) => c.name)).toEqual([
      "TEST Ivory",
      "TEST Rose",
    ]);
    expect(detail.sizes.map((s: { label: string }) => s.label)).toEqual([
      "S",
      "M",
      "L",
    ]);
    const bySku = Object.fromEntries(
      detail.variants.map((v: { sku: string }) => [v.sku, v]),
    );
    expect(bySku["TEST-SKT-IV-M"]).toMatchObject({ availability: "IN_STOCK" });
    expect(bySku["TEST-SKT-IV-M"].remaining).toBeUndefined();
    expect(bySku["TEST-SKT-IV-S"]).toMatchObject({
      availability: "LOW_STOCK",
      remaining: 2,
    });
    expect(bySku["TEST-SKT-IV-L"]).toMatchObject({ availability: "SOLD_OUT" });
    expect(detail.images[0]).toMatchObject({
      role: "PRIMARY",
      alt: "TEST placeholder, front",
      width: 1600,
      height: 2000,
    });
    expect(detail.images[0].avifSrcset).toContain("480w");
    // Exact stock and internal fields are never exposed.
    expect(JSON.stringify(detail)).not.toMatch(
      /onHand|reserved|hsnCode|lowStockThreshold/,
    );
  });

  it("records every catalogue write in the audit log", async () => {
    const actions = (
      await h.db.auditLog.findMany({ select: { action: true } })
    ).map((a) => a.action);
    for (const action of [
      "category.created",
      "colour.created",
      "media.uploaded",
      "product.created",
      "variant.created",
      "variant.price_changed",
      "product.images_replaced",
      "product.published",
    ])
      expect(actions).toContain(action);
  });
});

describe("public listing, filters and search", () => {
  let secondId: string;

  beforeAll(async () => {
    const created = await h.post(
      `${A}/products`,
      {
        name: "TEST Co-ord Set",
        categoryId,
        shortDescription: "TEST set.",
        description,
      },
      editor,
    );
    secondId = created.body.product.id;
    await h.post(
      `${A}/products/${secondId}/variants`,
      {
        colourId: rose,
        sizeId: sizes["Free Size"],
        sku: "TEST-SCS-RO-FS",
        pricePaise: 249_900,
      },
      owner,
    );
    await h.put(
      `${A}/products/${secondId}/images`,
      {
        images: [
          { mediaAssetId: assetId, alt: "TEST placeholder", role: "PRIMARY" },
        ],
      },
      editor,
    );
    await h.post(`${A}/products/${secondId}/publish`, {}, editor);
    // A draft with stock must never appear.
    const draft = await h.post(
      `${A}/products`,
      {
        name: "TEST Hidden Draft",
        categoryId,
        shortDescription: "x",
        description,
      },
      editor,
    );
    await h.post(
      `${A}/products/${draft.body.product.id}/variants`,
      {
        colourId: rose,
        sizeId: sizes.M,
        sku: "TEST-HID-RO-M",
        pricePaise: 100_000,
      },
      owner,
    );
  });

  it("lists published products, newest first, with facets", async () => {
    const res = await pub("/catalogue/products");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, max-age=30");
    expect(res.body.items.map((p: { slug: string }) => p.slug)).toEqual([
      "test-co-ord-set",
      "test-sample-kurta",
    ]);
    expect(res.body.facets.sizes).toEqual([
      { label: "S", count: 1 },
      { label: "M", count: 1 },
      { label: "L", count: 1 },
      { label: "Free Size", count: 1 },
    ]);
    expect(
      res.body.facets.colours.map((c: { name: string; count: number }) => [
        c.name,
        c.count,
      ]),
    ).toEqual([
      ["TEST Ivory", 1],
      ["TEST Rose", 2],
    ]);
    expect(res.body.items[1]).toMatchObject({
      availability: "IN_STOCK",
      sizes: ["S", "M", "L"],
      fromPricePaise: 349_900,
    });
  });

  it("filters by size, colour, price and stock, and sorts by price", async () => {
    const slugs = async (qs: string) =>
      (await pub(`/catalogue/products?${qs}`)).body.items.map(
        (p: { slug: string }) => p.slug,
      );
    expect(await slugs("size=Free%20Size")).toEqual(["test-co-ord-set"]);
    expect(await slugs("colour=test-ivory")).toEqual(["test-sample-kurta"]);
    expect(await slugs("priceMax=300000")).toEqual(["test-co-ord-set"]);
    expect(await slugs("sort=price_desc")).toEqual([
      "test-sample-kurta",
      "test-co-ord-set",
    ]);
    // Size L is sold out in both colours.
    expect(await slugs("size=L&inStock=true")).toEqual([]);
    expect(await slugs("size=S&colour=test-rose&inStock=true")).toEqual([
      "test-sample-kurta",
    ]);
    expect(await slugs("category=test-kurtas")).toHaveLength(2);
    expect(await slugs("category=no-such-category")).toEqual([]);
  });

  it("paginates with an opaque cursor", async () => {
    const first = await pub("/catalogue/products?limit=1");
    expect(first.body.items).toHaveLength(1);
    expect(first.body.total).toBe(2);
    const second = await pub(
      `/catalogue/products?limit=1&cursor=${first.body.nextCursor}`,
    );
    expect(second.body.items[0].slug).toBe("test-sample-kurta");
    expect(second.body.nextCursor).toBeNull();
  });

  it("rejects unknown query parameters", async () => {
    expect((await pub("/catalogue/products?admin=true")).status).toBe(400);
  });

  it("finds products by text, by prefix, despite typos, and by colour name", async () => {
    const slugs = async (q: string) =>
      (await pub(`/search?q=${encodeURIComponent(q)}`)).body.items.map(
        (p: { slug: string }) => p.slug,
      );
    // Both are in the "TEST Kurtas" category; the name match ranks first.
    expect(await slugs("kurtas")).toEqual([
      "test-sample-kurta",
      "test-co-ord-set",
    ]);
    expect(await slugs("kur")).toContain("test-sample-kurta");
    expect(await slugs("smple kurt")).toContain("test-sample-kurta");
    expect(await slugs("ivory")).toEqual(["test-sample-kurta"]);
    expect(await slugs("hidden draft")).toEqual([]);
    expect(await slugs("'; DROP TABLE product; --")).toEqual([]);
  });

  it("suggests products and categories", async () => {
    const res = await pub("/search/suggest?q=test");
    expect(res.body.categories.map((c: { slug: string }) => c.slug)).toEqual([
      "test-kurtas",
    ]);
    expect(res.body.products.length).toBeGreaterThan(0);
    expect((await pub("/search/suggest?q=k")).status).toBe(400);
  });

  it("updates the search document when a collection is added", async () => {
    const col = await h.post(
      `${A}/collections`,
      { name: "TEST Festive Edit", status: "PUBLISHED" },
      editor,
    );
    await h.put(
      `${A}/collections/${col.body.collection.id}/products`,
      { productIds: [secondId] },
      editor,
    );
    expect(
      (await pub("/search?q=festive")).body.items.map(
        (p: { slug: string }) => p.slug,
      ),
    ).toEqual(["test-co-ord-set"]);
    expect(
      (await pub("/catalogue/products?collection=test-festive-edit")).body
        .items,
    ).toHaveLength(1);
    expect((await pub("/catalogue/collections/test-festive-edit")).status).toBe(
      200,
    );
  });

  it("hides collections outside their schedule", async () => {
    const res = await h.post(
      `${A}/collections`,
      {
        name: "TEST Future Drop",
        status: "PUBLISHED",
        startsAt: "2099-01-01T00:00:00.000Z",
      },
      editor,
    );
    expect(res.status).toBe(201);
    expect((await pub("/catalogue/collections/test-future-drop")).status).toBe(
      404,
    );
    const bad = await h.post(
      `${A}/collections`,
      {
        name: "TEST Bad",
        startsAt: "2027-01-02T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
      },
      editor,
    );
    expect(bad.status).toBe(400);
  });

  it("hides everything in an unpublished category", async () => {
    await h.patch(`${A}/categories/${categoryId}`, { status: "DRAFT" }, editor);
    expect((await pub("/catalogue/products")).body.items).toEqual([]);
    expect((await pub("/catalogue/products/test-sample-kurta")).status).toBe(
      404,
    );
    await h.patch(
      `${A}/categories/${categoryId}`,
      { status: "PUBLISHED" },
      editor,
    );
    expect((await pub("/catalogue/products")).body.items).toHaveLength(2);
  });

  it("archives a product off the storefront", async () => {
    await h.post(`${A}/products/${secondId}/archive`, {}, editor);
    expect((await pub("/catalogue/products/test-co-ord-set")).status).toBe(404);
    expect(
      (await h.post(`${A}/products/${secondId}/archive`, {}, fulfilment))
        .status,
    ).toBe(403);
  });

  it("refuses to delete a category that still has products", async () => {
    const res = await h.del(`${A}/categories/${categoryId}`, editor);
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: "IN_USE" });
  });

  it("returns the published category tree", async () => {
    const res = await pub("/catalogue/categories");
    expect(res.body.categories.map((c: { slug: string }) => c.slug)).toEqual([
      "test-kurtas",
    ]);
  });
});
