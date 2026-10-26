// The demo store seed (D-187) against a real migrated database: the owner's
// 16 demo products with their variants, stock and demo images, the home page
// content, menus and the About page; every image is a labelled demo image;
// a second run changes nothing. Production is refused by assertSeedAllowed
// (seed.test.ts).
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTENT_BLOCKS } from "@sanea/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { seedDemo } from "./demo-seed.ts";
import { createTestDatabase } from "./testing/database.ts";

let db: PrismaClient;
let drop: () => Promise<void>;
let media: string;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  media = await mkdtemp(join(tmpdir(), "sanea-demo-media-"));
}, 120_000);
afterAll(async () => {
  await drop();
  await rm(media, { recursive: true, force: true });
});

describe("demo store seed", () => {
  it("loads the owner's demo catalogue, content and labelled images, once", async () => {
    const first = await seedDemo(db, media);
    expect(first).toEqual({ created: true, products: 16, variants: 136 });
    expect(await db.product.count({ where: { status: "PUBLISHED" } })).toBe(16);
    expect(await db.category.count()).toBe(6);
    expect(await db.collection.count()).toBe(4);
    // XS is not an approved size (D-029): no XS variant exists.
    expect(
      await db.productVariant.count({ where: { size: { label: "XS" } } }),
    ).toBe(0);
    // Every image is a demo image, and its files exist.
    const images = await db.productImage.findMany({
      include: { mediaAsset: true },
    });
    expect(images.length).toBeGreaterThanOrEqual(32);
    expect(images.every((i) => i.alt.startsWith("Demo image for "))).toBe(true);
    expect((await readdir(join(media, "public"))).length).toBeGreaterThan(32);
    // Content blocks pass their schemas.
    const blocks = await db.contentBlock.findMany();
    for (const b of blocks) {
      const schema =
        CONTENT_BLOCKS[b.key as keyof typeof CONTENT_BLOCKS].schema;
      expect(schema.safeParse(b.published).success, b.key).toBe(true);
    }
    expect(blocks.map((b) => b.key).sort()).toEqual(
      [
        "home.hero",
        "home.newIns",
        "home.row2",
        "home.tabbedGrid",
        "site.announcement",
        "site.footer",
      ].sort(),
    );
    const about = await db.page.findUniqueOrThrow({ where: { slug: "about" } });
    expect(about.status).toBe("PUBLISHED");
    expect(JSON.stringify(about.publishedBody)).toContain("Saniya Abbadi");
    // Policy pages are placeholders: they say the text is being prepared.
    for (const slug of ["returns", "shipping", "privacy", "terms"]) {
      const policy = await db.page.findUniqueOrThrow({ where: { slug } });
      expect(JSON.stringify(policy.publishedBody), slug).toContain(
        "is being prepared",
      );
    }
    expect(
      await db.navigationItem.count({ where: { menu: "FOOTER_HELP" } }),
    ).toBe(4);

    const again = await seedDemo(db, media);
    expect(again.created).toBe(false);
    expect(await db.product.count()).toBe(16);
  }, 120_000);
});
