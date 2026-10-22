// The catalogue and search API through real routes, sessions and database
// (phase-8-plan.md §5, §9; P8-AC3, P8-AC4, P8-AC6, P8-AC7).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AdminRole } from "@sanea/shared";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";

sharp.cache(false);

let h: Harness;
let root: string;
const s = new Map<AdminRole, Session>();
const owner = () => s.get(AdminRole.OWNER)!;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sanea-catalogue-test-"));
  h = await adminHarness({
    env: { MEDIA_STORAGE_DIR: root },
    searchLimit: { windowMs: 60_000, limit: 1_000 },
  });
  for (const role of Object.values(AdminRole))
    s.set(role, await h.signIn(await h.createAdmin(role)));
});
afterAll(async () => {
  await h.drop();
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

const A = "/api/v1/admin";
const send = (
  method: "post" | "patch" | "put" | "delete",
  path: string,
  body?: object,
  session = owner(),
) => {
  const r = request(h.app)
    [method](path)
    .set("Origin", ADMIN)
    .set("Cookie", session.cookie)
    .set("X-CSRF-Token", session.csrfToken);
  return body ? r.send(body) : r;
};
const pub = (path: string) => request(h.app).get(path);

let n = 0;
const uniq = (p: string) => `${p}-${++n}`;
const sizeId = async (label: string) =>
  (await h.db.size.findUniqueOrThrow({ where: { label } })).id;

async function category(
  status: "DRAFT" | "PUBLISHED" = "PUBLISHED",
  name = "Kurtas",
) {
  const r = await send("post", `${A}/categories`, {
    name,
    slug: uniq("cat"),
    status,
  });
  expect(r.status).toBe(201);
  return r.body as { id: string; slug: string };
}
async function colour(name: string) {
  const r = await send("post", `${A}/colours`, {
    name,
    slug: uniq(name.toLowerCase()),
    swatchHex: "#A1B2C3",
  });
  expect(r.status).toBe(201);
  return r.body as { id: string; slug: string };
}
async function product(categoryId: string, name = "Sample Kurta") {
  const r = await send("post", `${A}/products`, {
    name,
    slug: uniq("prod"),
    categoryId,
    shortDescription: "TEST product",
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string; slug: string };
}
async function variant(
  productId: string,
  colourId: string,
  size: string,
  pricePaise: number,
) {
  const r = await send("post", `${A}/products/${productId}/variants`, {
    colourId,
    sizeId: await sizeId(size),
    sku: uniq("TEST-SKU").toUpperCase(),
    pricePaise,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as { id: string };
}
async function mediaAsset() {
  const prefix = `${String(++n).padStart(32, "0")}`;
  const admin = await h.db.adminUser.findFirstOrThrow();
  return h.db.mediaAsset.create({
    data: {
      storageKey: `${prefix}/master.jpeg`,
      originalFilename: "TEST.jpg",
      mimeType: "image/jpeg",
      width: 1200,
      height: 1500,
      bytes: 1000,
      variants: [480, 960, 1440, 2048].flatMap((w) =>
        ["avif", "webp"].map((f) => ({
          key: `${prefix}/${w}.${f}`,
          format: f,
          width: Math.min(w, 1200),
          height: 1500,
          bytes: 10,
        })),
      ),
      uploadedByAdminId: admin.id,
    },
  });
}
async function primaryImage(productId: string, colourId: string | null = null) {
  const asset = await mediaAsset();
  const r = await send("post", `${A}/products/${productId}/images`, {
    mediaAssetId: asset.id,
    alt: "TEST image",
    role: "PRIMARY",
    colourId,
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body;
}
const stock = (variantId: string, onHand: number, reserved = 0) =>
  h.db.inventoryLevel.update({
    where: { variantId },
    data: { onHand, reserved },
  });

/** A publishable product: published category, one active variant, a primary image. */
async function published(
  opts: {
    name?: string;
    categoryName?: string;
    colours?: [string, string, number][];
  } = {},
) {
  const cat = await category("PUBLISHED", opts.categoryName ?? "Kurtas");
  const p = await product(cat.id, opts.name ?? "Sample Kurta");
  const variants = [];
  for (const [colourName, size, price] of opts.colours ?? [
    ["Ivory", "M", 129_900],
  ]) {
    const c = await colour(colourName);
    variants.push({ ...(await variant(p.id, c.id, size, price)), colour: c });
  }
  await primaryImage(p.id);
  const r = await send("post", `${A}/products/${p.id}/publish`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return { ...p, category: cat, variants };
}

describe("permissions on the real catalogue routes (P8-AC4)", () => {
  it("everyone views; O M C edit content; F cannot", async () => {
    for (const role of Object.values(AdminRole))
      expect((await h.get(`${A}/products`, s.get(role))).status, role).toBe(
        200,
      );
    const cat = await category();
    for (const role of [
      AdminRole.OWNER,
      AdminRole.MANAGER,
      AdminRole.CATALOGUE_EDITOR,
    ]) {
      const r = await send(
        "post",
        `${A}/products`,
        {
          name: "P",
          slug: uniq("perm"),
          categoryId: cat.id,
          shortDescription: "TEST",
        },
        s.get(role),
      );
      expect(r.status, role).toBe(201);
    }
    const f = await send(
      "post",
      `${A}/products`,
      {
        name: "P",
        slug: uniq("perm"),
        categoryId: cat.id,
        shortDescription: "TEST",
      },
      s.get(AdminRole.FULFILMENT),
    );
    expect(f.status).toBe(403);
    for (const path of ["categories", "collections", "colours", "size-charts"])
      expect(
        (await send("post", `${A}/${path}`, {}, s.get(AdminRole.FULFILMENT)))
          .status,
        path,
      ).toBe(403);
  });

  it("creating a variant needs price rights: O M yes, C and F no (Q8-4)", async () => {
    const cat = await category();
    const p = await product(cat.id);
    const c = await colour("Rose");
    const body = {
      colourId: c.id,
      sizeId: await sizeId("S"),
      sku: uniq("TEST-Q84").toUpperCase(),
      pricePaise: 99_900,
    };
    for (const role of [AdminRole.CATALOGUE_EDITOR, AdminRole.FULFILMENT])
      expect(
        (
          await send(
            "post",
            `${A}/products/${p.id}/variants`,
            body,
            s.get(role),
          )
        ).status,
        role,
      ).toBe(403);
    expect(
      (
        await send(
          "post",
          `${A}/products/${p.id}/variants`,
          body,
          s.get(AdminRole.MANAGER),
        )
      ).status,
    ).toBe(201);
  });

  it("a catalogue editor's request with a price field is refused whole; without one it is allowed", async () => {
    const cat = await category();
    const p = await product(cat.id);
    const v = await variant(p.id, (await colour("Mint")).id, "L", 150_000);
    const editor = s.get(AdminRole.CATALOGUE_EDITOR);
    const mixed = await send(
      "patch",
      `${A}/products/${p.id}/variants/${v.id}`,
      { isActive: false, pricePaise: 1 },
      editor,
    );
    expect(mixed.status).toBe(403);
    const row = await h.db.productVariant.findUniqueOrThrow({
      where: { id: v.id },
    });
    expect([row.isActive, row.pricePaise]).toEqual([true, 150_000]);
    expect(
      (
        await send(
          "patch",
          `${A}/products/${p.id}/variants/${v.id}`,
          { isActive: false },
          editor,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          "patch",
          `${A}/products/${p.id}/variants/${v.id}`,
          { pricePaise: 120_000 },
          s.get(AdminRole.MANAGER),
        )
      ).status,
    ).toBe(200);
  });

  it("publish and archive: O M C; F refused; unauthenticated 401; no CSRF 403", async () => {
    const pr = await published();
    expect(
      (
        await send(
          "post",
          `${A}/products/${pr.id}/archive`,
          undefined,
          s.get(AdminRole.FULFILMENT),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          "post",
          `${A}/products/${pr.id}/archive`,
          undefined,
          s.get(AdminRole.CATALOGUE_EDITOR),
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(h.app).get(`${A}/products`).set("Origin", ADMIN)).status,
    ).toBe(401);
    const noCsrf = await request(h.app)
      .post(`${A}/products/${pr.id}/publish`)
      .set("Origin", ADMIN)
      .set("Cookie", owner().cookie);
    expect(noCsrf.status).toBe(403);
  });

  it("lists the six approved sizes in order, read only (D-029)", async () => {
    const r = await h.get(`${A}/sizes`, s.get(AdminRole.CATALOGUE_EDITOR));
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(r.body.items.map((x: { label: string }) => x.label)).toEqual([
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "Free Size",
    ]);
    expect((await send("post", `${A}/sizes`, { label: "XS" })).status).toBe(
      404,
    );
  });

  it("reference data (categories, collections, colours, sizes, size charts) is O M C only", async () => {
    const f = s.get(AdminRole.FULFILMENT);
    for (const path of [
      "categories",
      "collections",
      "colours",
      "sizes",
      "size-charts",
    ]) {
      expect((await h.get(`${A}/${path}`, f)).status, path).toBe(403);
      expect(
        (await h.get(`${A}/${path}`, s.get(AdminRole.CATALOGUE_EDITOR))).status,
        path,
      ).toBe(200);
    }
  });

  it("admin responses are no-store", async () => {
    expect(
      (await h.get(`${A}/categories`, owner())).headers["cache-control"],
    ).toBe("no-store");
  });
});

describe("writes, validation and audit (P8-AC7)", () => {
  it("records an audit row with before and after for each write", async () => {
    const cat = await category();
    const p = await product(cat.id);
    await send("patch", `${A}/products/${p.id}`, { name: "Renamed Kurta" });
    const row = await h.db.auditLog.findFirstOrThrow({
      where: { action: "product.updated", entityId: p.id },
    });
    expect(row.before).toEqual({ name: "Sample Kurta" });
    expect(row.after).toEqual({ name: "Renamed Kurta" });
    for (const action of ["category.created", "product.created"])
      expect(await h.db.auditLog.count({ where: { action } })).toBeGreaterThan(
        0,
      );
  });

  it("creates the stock row with each variant (Q8-7)", async () => {
    const cat = await category();
    const p = await product(cat.id);
    const v = await variant(p.id, (await colour("Sand")).id, "M", 99_900);
    expect(
      await h.db.inventoryLevel.findUnique({ where: { variantId: v.id } }),
    ).toMatchObject({ onHand: 0, reserved: 0 });
  });

  it("rejects bad input with 400 and duplicates with 409", async () => {
    const cat = await category();
    const p = await product(cat.id);
    const c = await colour("Wine");
    expect(
      (
        await send("post", `${A}/products`, {
          name: "x",
          slug: "Bad Slug",
          categoryId: cat.id,
          shortDescription: "x",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("post", `${A}/products`, {
          name: "x",
          slug: uniq("ok"),
          categoryId: cat.id,
          shortDescription: "x",
          labels: ["BESTSELLER"],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("post", `${A}/products`, {
          name: "x",
          slug: uniq("ok"),
          categoryId: cat.id,
          shortDescription: "x",
          extra: 1,
        })
      ).status,
    ).toBe(400);
    const badLink = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "link",
              href: "javascript:alert(1)",
              content: [{ type: "text", text: "x" }],
            },
          ],
        },
      ],
    };
    expect(
      (await send("patch", `${A}/products/${p.id}`, { description: badLink }))
        .status,
    ).toBe(400);
    const base = {
      colourId: c.id,
      sizeId: await sizeId("XL"),
      pricePaise: 100_000,
    };
    expect(
      (
        await send("post", `${A}/products/${p.id}/variants`, {
          ...base,
          sku: uniq("TEST-CMP").toUpperCase(),
          compareAtPricePaise: 100_000,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("post", `${A}/products/${p.id}/variants`, {
          ...base,
          sku: uniq("TEST-FR").toUpperCase(),
          pricePaise: 12.5,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send("post", `${A}/products/${p.id}/variants`, {
          ...base,
          sku: uniq("TEST-A").toUpperCase(),
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await send("post", `${A}/products/${p.id}/variants`, {
          ...base,
          sku: uniq("TEST-B").toUpperCase(),
        })
      ).status,
    ).toBe(409);
  });

  it("a category in use, or a cycle, is refused with 409", async () => {
    const parent = await category();
    const child = (
      await send("post", `${A}/categories`, {
        name: "Short",
        slug: uniq("child"),
        parentId: parent.id,
      })
    ).body;
    await product(child.id);
    expect((await send("delete", `${A}/categories/${child.id}`)).status).toBe(
      409,
    );
    expect((await send("delete", `${A}/categories/${parent.id}`)).status).toBe(
      409,
    );
    expect(
      (
        await send("patch", `${A}/categories/${parent.id}`, {
          parentId: child.id,
        })
      ).status,
    ).toBe(409);
    const empty = await category();
    expect((await send("delete", `${A}/categories/${empty.id}`)).status).toBe(
      204,
    );
  });

  it("sets a collection's products in order", async () => {
    const cat = await category();
    const [a, b] = [await product(cat.id), await product(cat.id)];
    const col = (
      await send("post", `${A}/collections`, {
        name: "Edit",
        slug: uniq("col"),
      })
    ).body;
    expect(
      (
        await send("put", `${A}/collections/${col.id}/products`, {
          productIds: [b.id, a.id],
        })
      ).status,
    ).toBe(204);
    const detail = await h.get(`${A}/collections/${col.id}`, owner());
    expect(
      detail.body.products.map((p: { productId: string }) => p.productId),
    ).toEqual([b.id, a.id]);
    expect(
      (
        await send("put", `${A}/collections/${col.id}/products`, {
          productIds: [a.id, a.id],
        })
      ).status,
    ).toBe(400);
  });
});

describe("publishing rules (D-083, Q8-6; P8-AC6)", () => {
  it("lists every unmet rule", async () => {
    const cat = await category("DRAFT");
    const p = await product(cat.id);
    const r = await send("post", `${A}/products/${p.id}/publish`);
    expect(r.status).toBe(409);
    expect(
      r.body.error.details.map((d: { code: string }) => d.code).sort(),
    ).toEqual([
      "CATEGORY_NOT_PUBLISHED",
      "NO_ACTIVE_VARIANT",
      "NO_PRIMARY_IMAGE",
    ]);
  });

  it("sets publishedAt once, keeps it on re-publish, and locks the slug", async () => {
    const pr = await published();
    const first = (
      await h.db.product.findUniqueOrThrow({ where: { id: pr.id } })
    ).publishedAt;
    expect(first).not.toBeNull();
    h.clock.advance(60_000);
    await send("post", `${A}/products/${pr.id}/archive`);
    await send("post", `${A}/products/${pr.id}/publish`);
    expect(
      (await h.db.product.findUniqueOrThrow({ where: { id: pr.id } }))
        .publishedAt,
    ).toEqual(first);
    expect(
      (await send("patch", `${A}/products/${pr.id}`, { slug: uniq("new") }))
        .status,
    ).toBe(409);
    expect(
      (
        await send("patch", `${A}/products/${pr.id}`, {
          slug: pr.slug,
          name: "Same slug",
        })
      ).status,
    ).toBe(200);
  });
});

describe("public catalogue: visibility, availability, caching (D-082; P8-AC6)", () => {
  it("never shows drafts, archived products, unpublished categories or products without an active variant", async () => {
    const visible = await published({ name: "Visible Kurta" });
    const cat = await category();
    const draft = await product(cat.id, "Draft Kurta");
    await variant(draft.id, (await colour("Gold")).id, "M", 100_000);
    const archived = await published({ name: "Archived Kurta" });
    await send("post", `${A}/products/${archived.id}/archive`);
    const hiddenCat = await published({ name: "Hidden Category Kurta" });
    await send("patch", `${A}/categories/${hiddenCat.category.id}`, {
      status: "DRAFT",
    });
    const inactive = await published({ name: "Inactive Kurta" });
    await send(
      "patch",
      `${A}/products/${inactive.id}/variants/${inactive.variants[0]!.id}`,
      { isActive: false },
    );

    expect(
      (await pub(`/api/v1/catalogue/products/${visible.slug}`)).status,
    ).toBe(200);
    for (const p of [draft, archived, hiddenCat, inactive])
      expect(
        (await pub(`/api/v1/catalogue/products/${p.slug}`)).status,
        p.slug,
      ).toBe(404);
    const list = await pub("/api/v1/catalogue/products?limit=48");
    const slugs: string[] = list.body.items.map(
      (i: { slug: string }) => i.slug,
    );
    expect(slugs).toContain(visible.slug);
    for (const p of [draft, archived, hiddenCat, inactive])
      expect(slugs).not.toContain(p.slug);
  });

  it("shows availability states; remaining only for LOW_STOCK", async () => {
    const pr = await published({
      colours: [
        ["Ivory", "S", 100_000],
        ["Ivory2", "M", 100_000],
        ["Ivory3", "L", 100_000],
      ],
    });
    const [a, b, c] = pr.variants;
    await stock(a!.id, 10);
    await stock(b!.id, 3, 1); // available 2, threshold 2
    await stock(c!.id, 1, 1); // available 0
    const r = await pub(`/api/v1/catalogue/products/${pr.slug}`);
    const byId = new Map(r.body.variants.map((v: { id: string }) => [v.id, v]));
    expect(byId.get(a!.id)).toMatchObject({ availability: "IN_STOCK" });
    expect(byId.get(a!.id)).not.toHaveProperty("remaining");
    expect(byId.get(b!.id)).toMatchObject({
      availability: "LOW_STOCK",
      remaining: 2,
    });
    expect(byId.get(c!.id)).toEqual(
      expect.objectContaining({ availability: "SOLD_OUT" }),
    );
    expect(JSON.stringify(r.body)).not.toMatch(
      /onHand|reserved|lowStockThreshold/,
    );
  });

  it("returns derivative image URLs only, and caches for 60 seconds (Q8-5)", async () => {
    const pr = await published();
    const r = await pub(`/api/v1/catalogue/products/${pr.slug}`);
    expect(r.headers["cache-control"]).toBe("public, max-age=60");
    expect(r.body.images[0].url).toMatch(
      /^http:\/\/127\.0\.0\.1:4010\/\d{32}\/1440\.webp$/,
    );
    expect(JSON.stringify(r.body)).not.toMatch(/master|storageKey|original/);
  });

  it("shows only published categories (as a tree) and scheduled collections", async () => {
    const parent = await category("PUBLISHED", "Sets");
    await send("post", `${A}/categories`, {
      name: "Co-ords",
      slug: uniq("coords"),
      parentId: parent.id,
      status: "PUBLISHED",
    });
    await category("DRAFT", "Secret");
    const tree = await pub("/api/v1/catalogue/categories");
    const node = tree.body.items.find(
      (c: { slug: string }) => c.slug === parent.slug,
    );
    expect(node.children.map((c: { name: string }) => c.name)).toEqual([
      "Co-ords",
    ]);
    expect(JSON.stringify(tree.body)).not.toContain("Secret");
    const future = new Date(h.clock.now().getTime() + 86_400_000).toISOString();
    await send("post", `${A}/collections`, {
      name: "Live",
      slug: uniq("live"),
      status: "PUBLISHED",
    });
    await send("post", `${A}/collections`, {
      name: "Later",
      slug: uniq("later"),
      status: "PUBLISHED",
      startsAt: future,
    });
    const names = (await pub("/api/v1/catalogue/collections")).body.items.map(
      (c: { name: string }) => c.name,
    );
    expect(names).toContain("Live");
    expect(names).not.toContain("Later");
  });
});

describe("listing filters, facets, sorting and cursors", () => {
  let cat: { id: string; slug: string };
  const made: { slug: string; price: number }[] = [];
  beforeAll(async () => {
    cat = await category("PUBLISHED", "Filter Test");
    const blue = await colour("Indigo");
    const red = await colour("Madder");
    for (let i = 0; i < 7; i++) {
      const p = await product(cat.id, `Filter Kurta ${i}`);
      const price = 100_000 + i * 50_000;
      // Even products: Indigo M in stock. Odd: Madder L sold out, Indigo S in stock.
      if (i % 2 === 0)
        await stock((await variant(p.id, blue.id, "M", price)).id, 5);
      else {
        await variant(p.id, red.id, "L", price);
        await stock((await variant(p.id, blue.id, "S", price + 10_000)).id, 5);
      }
      await primaryImage(p.id);
      h.clock.advance(1_000);
      expect((await send("post", `${A}/products/${p.id}/publish`)).status).toBe(
        200,
      );
      made.push({ slug: p.slug, price });
    }
  });
  const list = (q: string) =>
    pub(`/api/v1/catalogue/products?category=${cat.slug}&${q}`);

  it("matches size, colour, price and stock on the same variant", async () => {
    const madderL = await list(
      "colour=" +
        (await h.db.colour.findFirstOrThrow({ where: { name: "Madder" } }))
          .slug +
        "&size=L",
    );
    expect(madderL.body.items).toHaveLength(3);
    const inStock = await list(
      "colour=" +
        (await h.db.colour.findFirstOrThrow({ where: { name: "Madder" } }))
          .slug +
        "&size=L&inStock=true",
    );
    expect(inStock.body.items).toHaveLength(0); // Madder L is sold out, even though Indigo S is in stock
    const priced = await list("priceMin=150000&priceMax=250000");
    expect(
      priced.body.items
        .map((i: { fromPricePaise: number }) => i.fromPricePaise)
        .every((p: number) => p >= 150_000 && p <= 250_000),
    ).toBe(true);
    expect((await list("size[]=M")).body.items).toHaveLength(4);
  });

  it("counts facets before variant filters", async () => {
    const r = await list("size=M");
    const sizes = Object.fromEntries(
      r.body.facets.sizes.map((f: { label: string; count: number }) => [
        f.label,
        f.count,
      ]),
    );
    expect(sizes).toEqual({ S: 3, M: 4, L: 3 });
    expect(
      r.body.facets.priceBands.reduce(
        (a: number, b: { count: number }) => a + b.count,
        0,
      ),
    ).toBe(7);
  });

  it("sorts and pages without duplicates or gaps", async () => {
    for (const sort of ["newest", "price_asc", "price_desc"]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const r = await list(
          `sort=${sort}&limit=3${cursor ? `&cursor=${cursor}` : ""}`,
        );
        expect(r.status).toBe(200);
        seen.push(...r.body.items.map((i: { slug: string }) => i.slug));
        cursor = r.body.nextCursor;
      } while (cursor);
      expect(new Set(seen).size, sort).toBe(7);
      if (sort === "newest")
        expect(seen).toEqual([...made].reverse().map((m) => m.slug));
      if (sort === "price_asc")
        expect(seen).toEqual(
          [...made].sort((a, b) => a.price - b.price).map((m) => m.slug),
        );
      if (sort === "price_desc")
        expect(seen).toEqual(
          [...made].sort((a, b) => b.price - a.price).map((m) => m.slug),
        );
    }
  });

  it("rejects tampered cursors, a cursor for another sort, and bad ranges", async () => {
    expect((await list("cursor=not-a-cursor!")).status).toBe(400);
    expect(
      (
        await list(
          `cursor=${Buffer.from('{"s":"newest","t":"x"}').toString("base64url")}`,
        )
      ).status,
    ).toBe(400);
    const first = await list("sort=newest&limit=2");
    expect(
      (await list(`sort=price_asc&cursor=${first.body.nextCursor}`)).status,
    ).toBe(400);
    expect((await list("priceMin=5&priceMax=1")).status).toBe(400);
    expect((await list("limit=49")).status).toBe(400);
    expect((await list("unknown=1")).status).toBe(400);
  });
});

describe("search and suggestions (D-081; P8-AC3)", () => {
  it("finds by name, category, collection and colour terms, and by a misspelling", async () => {
    const pr = await published({
      name: "Ivory Anarkali Kurta",
      categoryName: "Anarkalis",
      colours: [["Mehendi", "M", 200_000]],
    });
    const col = (
      await send("post", `${A}/collections`, {
        name: "Festive Edit",
        slug: uniq("festive"),
        status: "PUBLISHED",
      })
    ).body;
    await send("put", `${A}/collections/${col.id}/products`, {
      productIds: [pr.id],
    });
    const draft = await product((await category()).id, "Ivory Anarkali Draft");
    for (const q of [
      "anarkali",
      "anarkalis",
      "festive",
      "mehendi",
      "anarkalli",
    ]) {
      const r = await pub(`/api/v1/search?q=${q}`);
      expect(r.status, q).toBe(200);
      const slugs = r.body.items.map((i: { slug: string }) => i.slug);
      expect(slugs, q).toContain(pr.slug);
      expect(slugs, q).not.toContain(draft.slug);
    }
    const sug = await pub("/api/v1/search/suggest?q=anar");
    expect(
      sug.body.products.length + sug.body.categories.length,
    ).toBeLessThanOrEqual(6);
    expect(sug.body.products.map((p: { slug: string }) => p.slug)).toContain(
      pr.slug,
    );
    expect(JSON.stringify(sug.body)).not.toContain(draft.slug);
    expect((await pub("/api/v1/search?q=a")).status).toBe(400);
    expect(
      (await pub("/api/v1/search/suggest?q=" + "x".repeat(101))).status,
    ).toBe(400);
  });

  it("limits search to the configured rate (429 RATE_LIMITED with headers)", async () => {
    const limited = await adminHarness({
      env: { MEDIA_STORAGE_DIR: root },
      searchLimit: { windowMs: 60_000, limit: 3 },
    });
    try {
      for (let i = 0; i < 3; i++)
        expect(
          (await request(limited.app).get("/api/v1/search/suggest?q=ab"))
            .status,
        ).toBe(200);
      const r = await request(limited.app).get("/api/v1/search?q=ab");
      expect(r.status).toBe(429);
      expect(r.body.error.code).toBe("RATE_LIMITED");
      expect(r.headers["retry-after"]).toBeDefined();
    } finally {
      await limited.drop();
    }
  });
});

describe("end to end: upload, variants, publish, find (P8-AC3)", () => {
  it("a product with colour × size variants and real images is published and found by filter and search", async () => {
    const cat = await category("PUBLISHED", "Kaftans");
    const p = await product(cat.id, "Mulmul Kaftan");
    const colours = [await colour("Saffron"), await colour("Teal")];
    for (const c of colours)
      for (const size of ["M", "L"])
        await stock((await variant(p.id, c.id, size, 249_900)).id, 4);
    const image = await sharp({
      create: { width: 1600, height: 2000, channels: 3, background: "#d9a066" },
    })
      .jpeg()
      .toBuffer();
    const up = await request(h.app)
      .post(`${A}/media`)
      .set("Origin", ADMIN)
      .set("Cookie", owner().cookie)
      .set("X-CSRF-Token", owner().csrfToken)
      .set("Content-Type", "image/jpeg")
      .send(image);
    expect(up.status).toBe(201);
    for (const [i, c] of colours.entries()) {
      const r = await send("post", `${A}/products/${p.id}/images`, {
        mediaAssetId: up.body.id,
        alt: `Mulmul kaftan in ${c.slug}`,
        role: i === 0 ? "PRIMARY" : "GALLERY",
        colourId: c.id,
      });
      expect(r.status).toBe(201);
    }
    expect((await send("post", `${A}/products/${p.id}/publish`)).status).toBe(
      200,
    );

    const detail = await pub(`/api/v1/catalogue/products/${p.slug}`);
    expect(detail.body.variants).toHaveLength(4);
    expect(detail.body.colours).toHaveLength(2);
    expect(detail.body.sizes.map((x: { label: string }) => x.label)).toEqual([
      "M",
      "L",
    ]);
    expect(detail.body.images).toHaveLength(2);
    const filtered = await pub(
      `/api/v1/catalogue/products?category=${cat.slug}&colour=${colours[1]!.slug}&size=L&inStock=true`,
    );
    expect(filtered.body.items.map((i: { slug: string }) => i.slug)).toEqual([
      p.slug,
    ]);
    const found = await pub("/api/v1/search?q=kaftan");
    expect(found.body.items.map((i: { slug: string }) => i.slug)).toContain(
      p.slug,
    );
    expect(found.body.items[0].primaryImage.url).toMatch(/\/1440\.webp$/);
  });
});
