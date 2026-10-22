// Search triggers keep product.search_vector current (D-081, Phase 8
// safeguard 3). Raw SQL only: the API never writes the search column.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { createTestDatabase } from "./testing/database.ts";
import * as fx from "./testing/fixtures.ts";

let db: PrismaClient;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
});
afterAll(() => drop());

const exec = (sql: string) => db.$executeRawUnsafe(sql);

/** The stored search vector as text, for exact before/after comparison. */
async function vector(productId: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ v: string }[]>(
    `SELECT "search_vector"::text AS v FROM "product" WHERE "id" = '${productId}'`,
  );
  return rows[0]?.v ?? "";
}

/** Whether the product matches a `simple` tsquery, e.g. 'ivory:B'. */
async function matches(productId: string, query: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<{ m: boolean }[]>(
    `SELECT "search_vector" @@ to_tsquery('simple', '${query}') AS m FROM "product" WHERE "id" = '${productId}'`,
  );
  return rows[0]?.m === true;
}

let n = 0;
async function collection(name: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "collection" ("name", "slug", "updated_at")
     VALUES ('${name}', 'test-search-collection-${++n}', now()) RETURNING "id"`,
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("collection insert returned no id");
  return id;
}

describe("product's own fields", () => {
  it("indexes name (A), category (B) and short description (C) on insert", async () => {
    const cat = await fx.category(db);
    await exec(`UPDATE "category" SET "name" = 'Kurtas' WHERE "id" = '${cat}'`);
    const p = await fx.product(db, cat);
    await exec(
      `UPDATE "product" SET "name" = 'Ivory Anarkali', "short_description" = 'Handwoven cotton' WHERE "id" = '${p}'`,
    );
    expect(await matches(p, "anarkali:A")).toBe(true);
    expect(await matches(p, "kurtas:B")).toBe(true);
    expect(await matches(p, "handwoven:C")).toBe(true);
    // `simple` configuration: no English stemming.
    expect(await matches(p, "kurta")).toBe(false);
  });

  it("a fresh insert is searchable without a later update", async () => {
    const p = await fx.product(db);
    expect(await vector(p)).not.toBe("");
    expect(await matches(p, "sample:A")).toBe(true);
  });

  it("a rename replaces the old name", async () => {
    const p = await fx.product(db);
    await exec(
      `UPDATE "product" SET "name" = 'Mulmul Kaftan' WHERE "id" = '${p}'`,
    );
    expect(await matches(p, "kaftan:A")).toBe(true);
    expect(await matches(p, "sample")).toBe(false);
  });

  it("indexes only the text values of the rich-text description (C)", async () => {
    const p = await fx.product(db);
    await exec(
      `UPDATE "product" SET "description" = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Chikankari embroidery"}]}]}' WHERE "id" = '${p}'`,
    );
    expect(await matches(p, "chikankari:C")).toBe(true);
    expect(await matches(p, "paragraph")).toBe(false);
    expect(await matches(p, "doc")).toBe(false);
  });

  it("unexpected description JSON never blocks a save (silent lookup)", async () => {
    const p = await fx.product(db);
    for (const json of [
      '{"text":{"nested":1}}',
      '{"text":42,"content":[1,"two",null,{"text":["a"]}]}',
      '["loose",{"text":"Zardozi"}]',
      '"just a string"',
      "null",
    ]) {
      await expect(
        exec(
          `UPDATE "product" SET "description" = '${json}' WHERE "id" = '${p}'`,
        ),
      ).resolves.toBe(1);
    }
    // Only string "text" values are indexed; the last JSON had none.
    expect(await matches(p, "zardozi")).toBe(false);
    await exec(
      `UPDATE "product" SET "description" = '["loose",{"text":"Zardozi"}]' WHERE "id" = '${p}'`,
    );
    expect(await matches(p, "zardozi:C")).toBe(true);
  });

  it("moving to another category swaps the category name", async () => {
    const a = await fx.category(db);
    const b = await fx.category(db);
    await exec(`UPDATE "category" SET "name" = 'Coords' WHERE "id" = '${b}'`);
    const p = await fx.product(db, a);
    await exec(
      `UPDATE "product" SET "category_id" = '${b}' WHERE "id" = '${p}'`,
    );
    expect(await matches(p, "coords:B")).toBe(true);
  });

  it("an unrelated column change leaves the vector as it was", async () => {
    const p = await fx.product(db);
    const before = await vector(p);
    await exec(`UPDATE "product" SET "fabric" = 'Linen' WHERE "id" = '${p}'`);
    expect(await vector(p)).toBe(before);
  });
});

describe("shared category", () => {
  it("a rename updates every product in it and no other product", async () => {
    const cat = await fx.category(db);
    const p1 = await fx.product(db, cat);
    const p2 = await fx.product(db, cat);
    const other = await fx.product(db);
    const otherBefore = await vector(other);
    await exec(
      `UPDATE "category" SET "name" = 'Shararas' WHERE "id" = '${cat}'`,
    );
    expect(await matches(p1, "shararas:B")).toBe(true);
    expect(await matches(p2, "shararas:B")).toBe(true);
    expect(await vector(other)).toBe(otherBefore);
  });
});

describe("shared collection", () => {
  it("joining, renaming and leaving update only its products", async () => {
    const col = await collection("Festive Edit");
    const p1 = await fx.product(db);
    const p2 = await fx.product(db);
    const other = await fx.product(db);
    const otherBefore = await vector(other);

    await exec(
      `INSERT INTO "collection_product" ("collection_id", "product_id") VALUES ('${col}', '${p1}'), ('${col}', '${p2}')`,
    );
    expect(await matches(p1, "festive:B")).toBe(true);
    expect(await matches(p2, "festive:B")).toBe(true);

    await exec(
      `UPDATE "collection" SET "name" = 'Summer Edit' WHERE "id" = '${col}'`,
    );
    expect(await matches(p1, "summer:B")).toBe(true);
    expect(await matches(p2, "summer:B")).toBe(true);
    expect(await matches(p1, "festive")).toBe(false);

    await exec(
      `DELETE FROM "collection_product" WHERE "collection_id" = '${col}' AND "product_id" = '${p1}'`,
    );
    expect(await matches(p1, "summer")).toBe(false);
    expect(await matches(p2, "summer:B")).toBe(true);
    expect(await vector(other)).toBe(otherBefore);
  });

  it("deleting a collection removes its name through the cascade", async () => {
    const col = await collection("Wedding Edit");
    const p = await fx.product(db);
    await exec(
      `INSERT INTO "collection_product" ("collection_id", "product_id") VALUES ('${col}', '${p}')`,
    );
    expect(await matches(p, "wedding:B")).toBe(true);
    await exec(`DELETE FROM "collection" WHERE "id" = '${col}'`);
    expect(await matches(p, "wedding")).toBe(false);
  });

  it("deleting a product in a collection succeeds (cascade with trigger)", async () => {
    const col = await collection("Clearance Edit");
    const p = await fx.product(db);
    await exec(
      `INSERT INTO "collection_product" ("collection_id", "product_id") VALUES ('${col}', '${p}')`,
    );
    await expect(
      exec(`DELETE FROM "product" WHERE "id" = '${p}'`),
    ).resolves.toBe(1);
  });
});

describe("variant colours and shared colours", () => {
  it("adding, recolouring and removing a variant update the colour names", async () => {
    const p = await fx.product(db);
    const v = await fx.variant(db, p);
    const rows = await db.$queryRawUnsafe<{ colour: string }[]>(
      `SELECT c."name" AS colour FROM "product_variant" v JOIN "colour" c ON c."id" = v."colour_id" WHERE v."id" = '${v}'`,
    );
    expect(rows[0]?.colour).toMatch(/^TEST Colour \d+$/);
    expect(await matches(p, "colour:B")).toBe(true);

    const rose = await fx.colour(db);
    await exec(`UPDATE "colour" SET "name" = 'Rose' WHERE "id" = '${rose}'`);
    await exec(
      `UPDATE "product_variant" SET "colour_id" = '${rose}' WHERE "id" = '${v}'`,
    );
    expect(await matches(p, "rose:B")).toBe(true);
    expect(await matches(p, "colour")).toBe(false);

    await exec(`DELETE FROM "product_variant" WHERE "id" = '${v}'`);
    expect(await matches(p, "rose")).toBe(false);
  });

  it("a colour rename updates every product using it and no other product", async () => {
    const shared = await fx.colour(db);
    const size = await fx.size(db, "L");
    const p1 = await fx.product(db);
    const p2 = await fx.product(db);
    for (const [p, sku] of [
      [p1, "TEST-SRCH-1"],
      [p2, "TEST-SRCH-2"],
    ] as const) {
      await exec(
        `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "updated_at")
         VALUES ('${p}', '${shared}', '${size}', '${sku}', 129900, now())`,
      );
    }
    const other = await fx.product(db);
    await fx.variant(db, other);
    const otherBefore = await vector(other);

    await exec(
      `UPDATE "colour" SET "name" = 'Mehendi' WHERE "id" = '${shared}'`,
    );
    expect(await matches(p1, "mehendi:B")).toBe(true);
    expect(await matches(p2, "mehendi:B")).toBe(true);
    expect(await vector(other)).toBe(otherBefore);
  });

  it("only active variants' colours are searchable", async () => {
    const p = await fx.product(db);
    const rose = await fx.colour(db);
    const ivory = await fx.colour(db);
    await exec(`UPDATE "colour" SET "name" = 'Rose' WHERE "id" = '${rose}'`);
    await exec(`UPDATE "colour" SET "name" = 'Ivory' WHERE "id" = '${ivory}'`);
    const m = await fx.size(db, "M");
    const l = await fx.size(db, "L");
    const insert = (colour: string, size: string, sku: string) =>
      db.$queryRawUnsafe<{ id: string }[]>(
        `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "updated_at")
         VALUES ('${p}', '${colour}', '${size}', '${sku}', 129900, now()) RETURNING "id"`,
      );
    const [roseM] = await insert(rose, m, "TEST-ACT-1");
    const [roseL] = await insert(rose, l, "TEST-ACT-2");
    await insert(ivory, m, "TEST-ACT-3");
    expect(await matches(p, "rose:B")).toBe(true);

    // One of two rose variants inactive: still searchable.
    await exec(
      `UPDATE "product_variant" SET "is_active" = false WHERE "id" = '${roseM?.id}'`,
    );
    expect(await matches(p, "rose:B")).toBe(true);
    // Both inactive: rose gone, ivory kept.
    await exec(
      `UPDATE "product_variant" SET "is_active" = false WHERE "id" = '${roseL?.id}'`,
    );
    expect(await matches(p, "rose")).toBe(false);
    expect(await matches(p, "ivory:B")).toBe(true);
    // Reactivated: back.
    await exec(
      `UPDATE "product_variant" SET "is_active" = true WHERE "id" = '${roseM?.id}'`,
    );
    expect(await matches(p, "rose:B")).toBe(true);
    // A rename of a colour used only by an inactive variant does not add it.
    await exec(
      `UPDATE "product_variant" SET "is_active" = false WHERE "colour_id" = '${rose}'`,
    );
    await exec(`UPDATE "colour" SET "name" = 'Blush' WHERE "id" = '${rose}'`);
    expect(await matches(p, "blush")).toBe(false);
  });
});

describe("refresh and trigram", () => {
  it("refresh_product_search rebuilds a cleared vector (the backfill path)", async () => {
    const p = await fx.product(db);
    const before = await vector(p);
    await exec(
      `UPDATE "product" SET "search_vector" = ''::tsvector WHERE "id" = '${p}'`,
    );
    expect(await vector(p)).toBe("");
    await exec(`SELECT "refresh_product_search"(ARRAY['${p}']::uuid[])`);
    expect(await vector(p)).toBe(before);
  });

  it("finds a product name from a misspelling (pg_trgm word similarity)", async () => {
    const p = await fx.product(db);
    await exec(
      `UPDATE "product" SET "name" = 'Ivory Anarkali Kurta' WHERE "id" = '${p}'`,
    );
    const rows = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "product" WHERE 'anarkalli' <% "name" AND "id" = '${p}'`,
    );
    expect(rows).toHaveLength(1);
  });
});
