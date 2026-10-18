// The development seed against a real migrated database: only fake TEST data,
// valid stock with matching movements, and a second run changes nothing.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { SAMPLE_PRODUCTS, seedDevelopment } from "./seed.ts";
import { createTestDatabase } from "./testing/database.ts";

let db: PrismaClient;
let drop: () => Promise<void>;

const counts = async () => {
  const [row] = await db.$queryRawUnsafe<Record<string, number>[]>(
    `SELECT (SELECT count(*)::int FROM "category") AS category,
            (SELECT count(*)::int FROM "colour") AS colour,
            (SELECT count(*)::int FROM "product") AS product,
            (SELECT count(*)::int FROM "product_variant") AS variant,
            (SELECT count(*)::int FROM "inventory_level") AS inventory,
            (SELECT count(*)::int FROM "stock_movement") AS movement,
            (SELECT count(*)::int FROM "size") AS size`,
  );
  return row!;
};

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
});
afterAll(() => drop());

describe("development seed", () => {
  it("creates the sample catalogue on an empty database", async () => {
    const result = await seedDevelopment(db);
    const expectedVariants = SAMPLE_PRODUCTS.reduce(
      (n, p) => n + p.sizes.length * 2,
      0,
    );
    expect(result).toEqual({
      created: true,
      products: 3,
      variants: expectedVariants,
    });
    expect(await counts()).toMatchObject({
      category: 2,
      colour: 2,
      product: 3,
      variant: expectedVariants,
      inventory: expectedVariants,
      size: 6,
    });
  });

  it("uses only obviously fake names and TEST- SKUs", async () => {
    const rows = await db.$queryRawUnsafe<{ kind: string; value: string }[]>(
      `SELECT 'product' AS kind, "name" AS value FROM "product"
       UNION ALL SELECT 'category', "name" FROM "category"
       UNION ALL SELECT 'colour', "name" FROM "colour"
       UNION ALL SELECT 'sku', "sku" FROM "product_variant"
       UNION ALL SELECT 'short', "short_description" FROM "product"`,
    );
    for (const r of rows) {
      if (r.kind === "sku") expect(r.value).toMatch(/^TEST-/);
      else if (r.kind === "short") expect(r.value).toContain("TEST data");
      else expect(r.value).toMatch(/^Sample /);
    }
  });

  it("adds no sizes and touches no admin, media or content table", async () => {
    const [row] = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT (SELECT count(*) FROM "admin_user") + (SELECT count(*) FROM "admin_session")
            + (SELECT count(*) FROM "audit_log") + (SELECT count(*) FROM "media_asset")
            + (SELECT count(*) FROM "product_image") + (SELECT count(*) FROM "content_block")
            + (SELECT count(*) FROM "page") + (SELECT count(*) FROM "navigation_item")
            + (SELECT count(*) FROM "store_setting") + (SELECT count(*) FROM "collection")
            + (SELECT count(*) FROM "size_chart") + (SELECT count(*) FROM "stock_reservation") AS n`,
    );
    expect(Number(row?.n)).toBe(0);
    const sizes = await db.size.findMany({ orderBy: { position: "asc" } });
    expect(sizes.map((s) => s.label)).toEqual([
      "S",
      "M",
      "L",
      "XL",
      "XXL",
      "Free Size",
    ]);
  });

  it("records one RECEIVED movement per stocked variant, summing to on-hand", async () => {
    const rows = await db.$queryRawUnsafe<
      { sku: string; on_hand: number; moved: number; movements: number }[]
    >(
      `SELECT v."sku", i."on_hand",
              coalesce(sum(m."on_hand_delta"), 0)::int AS moved, count(m."id")::int AS movements
       FROM "product_variant" v
       JOIN "inventory_level" i ON i."variant_id" = v."id"
       LEFT JOIN "stock_movement" m ON m."variant_id" = v."id"
       GROUP BY v."sku", i."on_hand"`,
    );
    for (const r of rows) {
      expect(r.moved, r.sku).toBe(r.on_hand);
      expect(r.movements, r.sku).toBe(r.on_hand > 0 ? 1 : 0);
    }
    expect(rows.some((r) => r.on_hand === 0)).toBe(true); // a sold-out variant for later UI tests
  });

  it("publishes only products with a publication date; drafts have none", async () => {
    const rows = await db.product.findMany({
      select: { status: true, publishedAt: true },
    });
    for (const p of rows)
      expect(p.status === "PUBLISHED").toBe(p.publishedAt !== null);
    expect(rows.filter((p) => p.status === "DRAFT")).toHaveLength(1);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const before = await counts();
    const result = await seedDevelopment(db);
    expect(result.created).toBe(false);
    expect(await counts()).toEqual(before);
  });
});
