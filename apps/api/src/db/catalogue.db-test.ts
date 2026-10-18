// Catalogue and pricing rules, enforced by PostgreSQL (raw SQL, no app code).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { createTestDatabase } from "./testing/database.ts";
import {
  SQLSTATE,
  expectAccepted,
  expectCheck,
  expectCode,
} from "./testing/expect.ts";
import * as fx from "./testing/fixtures.ts";

let db: PrismaClient;
let drop: () => Promise<void>;
let productId: string;
let colourId: string;
let sizeM: string;
let sizeL: string;
let adminId: string;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  productId = await fx.product(db);
  colourId = await fx.colour(db);
  sizeM = await fx.size(db, "M");
  sizeL = await fx.size(db, "L");
  adminId = await fx.admin(db);
});
afterAll(() => drop());

let sku = 0;
const variantSql = (price: string, compareAt = "NULL", size = sizeM) =>
  `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "compare_at_price_paise", "updated_at")
   VALUES ('${productId}', '${colourId}', '${size}', 'TEST-CAT-${++sku}', ${price}, ${compareAt}, now())`;

describe("prices", () => {
  it.each(["0", "-1", "-129900"])("rejects price %s paise", (price) =>
    expectCheck(db, variantSql(price), "product_variant_price_check"),
  );

  it("stores whole paise only, but rounds a fractional number (limitation)", async () => {
    // PostgreSQL does not reject 12.5 for an integer column; it rounds it.
    // The API must reject non-integer paise before writing (@sanea/shared).
    const p = await fx.product(db);
    await db.$executeRawUnsafe(
      `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "updated_at")
       VALUES ('${p}', '${colourId}', '${sizeM}', 'TEST-ROUND', 12.5, now())`,
    );
    const rows = await db.$queryRawUnsafe<{ price: number }[]>(
      `SELECT "price_paise" AS price FROM "product_variant" WHERE "sku" = 'TEST-ROUND'`,
    );
    expect(rows[0]?.price).toBe(13);
  });

  it("rejects values beyond the 32-bit range", () =>
    expectCode(db, variantSql("2147483648"), SQLSTATE.OUT_OF_RANGE));

  it.each([
    ["equal", "129900"],
    ["lower", "100000"],
  ])("rejects a compare-at price %s to the price", (_name, compareAt) =>
    expectCheck(
      db,
      variantSql("129900", compareAt),
      "product_variant_compare_at_price_check",
    ),
  );

  it("accepts a positive price with a higher compare-at price", () =>
    expectAccepted(db, variantSql("129900", "149900")));

  it("accepts a positive price without a compare-at price", () =>
    expectAccepted(db, variantSql("129900", "NULL", sizeL)));
});

describe("variants", () => {
  it("rejects a second variant for the same product, colour and size", async () => {
    const p = await fx.product(db);
    const insert = (code: string) =>
      `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "updated_at")
       VALUES ('${p}', '${colourId}', '${sizeM}', '${code}', 1000, now())`;
    await expectAccepted(db, insert("TEST-DUP-1"));
    await expectCode(
      db,
      insert("TEST-DUP-2"),
      SQLSTATE.UNIQUE,
      "product_variant_product_id_colour_id_size_id_key",
    );
  });

  it("rejects a duplicate SKU", async () => {
    await expectAccepted(
      db,
      variantSql("1000", "NULL", await fx.size(db, "S")),
    );
    const taken = `TEST-CAT-${sku}`;
    await expectCode(
      db,
      `INSERT INTO "product_variant" ("product_id", "colour_id", "size_id", "sku", "price_paise", "updated_at")
       VALUES ('${productId}', '${colourId}', '${await fx.size(db, "XL")}', '${taken}', 1000, now())`,
      SQLSTATE.UNIQUE,
      "product_variant_sku_key",
    );
  });
});

describe("products", () => {
  const productSql = (status: string, publishedAt: string, short = "TEST") =>
    `INSERT INTO "product" ("name", "slug", "category_id", "short_description", "description", "status", "published_at", "updated_at")
     SELECT 'Sample Kurta P', 'test-p-' || gen_random_uuid(), "category_id", '${short}', '{}', '${status}', ${publishedAt}, now()
     FROM "product" WHERE "id" = '${productId}'`;

  it("rejects a published product without a publication date", () =>
    expectCheck(
      db,
      productSql("PUBLISHED", "NULL"),
      "product_published_at_check",
    ));

  it("accepts a published product with a publication date", () =>
    expectAccepted(db, productSql("PUBLISHED", "now()")));

  it("accepts a draft without a publication date", () =>
    expectAccepted(db, productSql("DRAFT", "NULL")));

  it("rejects publishing an existing product without a date", () =>
    expectCheck(
      db,
      `UPDATE "product" SET "status" = 'PUBLISHED' WHERE "id" = '${productId}'`,
      "product_published_at_check",
    ));

  it("rejects a short description over 200 characters", () =>
    expectCheck(
      db,
      productSql("DRAFT", "NULL", "x".repeat(201)),
      "product_short_description_length_check",
    ));

  it("accepts a 200-character short description", () =>
    expectAccepted(db, productSql("DRAFT", "NULL", "x".repeat(200))));
});

describe("categories and collections", () => {
  it("rejects a category that is its own parent", async () => {
    const c = await fx.category(db);
    await expectCheck(
      db,
      `UPDATE "category" SET "parent_id" = "id" WHERE "id" = '${c}'`,
      "category_not_own_parent_check",
    );
  });

  it("accepts a sub-category", async () => {
    const parent = await fx.category(db);
    const child = await fx.category(db);
    await expectAccepted(
      db,
      `UPDATE "category" SET "parent_id" = '${parent}' WHERE "id" = '${child}'`,
    );
  });

  const collectionSql = (startsAt: string, endsAt: string) =>
    `INSERT INTO "collection" ("name", "slug", "starts_at", "ends_at", "updated_at")
     VALUES ('TEST Collection', 'test-col-' || gen_random_uuid(), ${startsAt}, ${endsAt}, now())`;

  it.each([
    ["ends before it starts", "now()", "now() - interval '1 day'"],
    ["ends when it starts", "'2026-01-01T00:00:00Z'", "'2026-01-01T00:00:00Z'"],
  ])("rejects a collection that %s", (_name, startsAt, endsAt) =>
    expectCheck(
      db,
      collectionSql(startsAt, endsAt),
      "collection_schedule_check",
    ),
  );

  it.each([
    ["ends after it starts", "now()", "now() + interval '1 day'"],
    ["has no end", "now()", "NULL"],
    ["has no dates", "NULL", "NULL"],
  ])("accepts a collection that %s", (_name, startsAt, endsAt) =>
    expectAccepted(db, collectionSql(startsAt, endsAt)),
  );
});

describe("colours and media", () => {
  const colourSql = (hex: string) =>
    `INSERT INTO "colour" ("name", "slug", "swatch_hex")
     VALUES ('TEST Colour', 'test-swatch-' || gen_random_uuid(), '${hex}')`;

  it.each(["red", "#FFF", "#GGGGGG", "A1B2C3", "#A1B2C3D4", "#a1b2c "])(
    "rejects swatch %j",
    (hex) => expectCheck(db, colourSql(hex), "colour_swatch_hex_check"),
  );

  it.each(["#a1b2c3", "#A1B2C3", "#000000"])("accepts swatch %s", (hex) =>
    expectAccepted(db, colourSql(hex)),
  );

  const mediaSql = (w: number, h: number, bytes: number) =>
    `INSERT INTO "media_asset" ("storage_key", "original_filename", "mime_type", "width", "height", "bytes", "uploaded_by_admin_id")
     VALUES ('test/' || gen_random_uuid(), 'TEST.jpg', 'image/jpeg', ${w}, ${h}, ${bytes}, '${adminId}')`;

  it.each([
    [0, 100, 100],
    [100, 0, 100],
    [100, 100, 0],
    [-1, 100, 100],
  ])("rejects media %i×%i, %i bytes", (w, h, bytes) =>
    expectCheck(db, mediaSql(w, h, bytes), "media_asset_dimensions_check"),
  );

  it("accepts positive media dimensions", () =>
    expectAccepted(db, mediaSql(800, 1000, 2048)));

  it("requires image alt text", async () => {
    const m = await fx.media(db);
    await expectCheck(
      db,
      `INSERT INTO "product_image" ("product_id", "media_asset_id", "alt") VALUES ('${productId}', '${m}', '   ')`,
      "product_image_alt_check",
    );
  });
});
