// Inventory, movement and reservation rules, enforced by PostgreSQL (D-105).
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
let variantId: string;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  variantId = await fx.variant(db);
  await db.$executeRawUnsafe(
    `INSERT INTO "inventory_level" ("variant_id", "on_hand", "reserved", "updated_at") VALUES ('${variantId}', 5, 2, now())`,
  );
});
afterAll(() => drop());

const level = (set: string) =>
  `UPDATE "inventory_level" SET ${set} WHERE "variant_id" = '${variantId}'`;

describe("stock levels", () => {
  it("rejects negative on-hand stock", () =>
    expectCheck(
      db,
      level(`"on_hand" = -1, "reserved" = 0`),
      "inventory_level_on_hand_check",
    ));

  it("rejects negative reserved stock", () =>
    expectCheck(
      db,
      level(`"reserved" = -1`),
      "inventory_level_reserved_check",
    ));

  it("rejects reserving more than is on hand", () =>
    expectCheck(db, level(`"reserved" = 6`), "inventory_level_reserved_check"));

  it("rejects lowering on-hand below what is reserved", () =>
    expectCheck(db, level(`"on_hand" = 1`), "inventory_level_reserved_check"));

  it("rejects an atomic decrement that would oversell", () =>
    expectCheck(
      db,
      level(`"reserved" = "reserved" + 4`),
      "inventory_level_reserved_check",
    ));

  it("rejects a negative low-stock threshold and version", async () => {
    await expectCheck(
      db,
      level(`"low_stock_threshold" = -1`),
      "inventory_level_low_stock_threshold_check",
    );
    await expectCheck(
      db,
      level(`"version" = -1`),
      "inventory_level_version_check",
    );
  });

  it("accepts reserving exactly what is on hand, and leaves the row valid", async () => {
    await expectAccepted(db, level(`"reserved" = 5`));
    await expectAccepted(db, level(`"reserved" = 2`));
    const [row] = await db.$queryRawUnsafe<
      { on_hand: number; reserved: number }[]
    >(
      `SELECT "on_hand", "reserved" FROM "inventory_level" WHERE "variant_id" = '${variantId}'`,
    );
    expect(row).toEqual({ on_hand: 5, reserved: 2 });
  });
});

describe("stock movements", () => {
  const movement = (cols: Record<string, string>) => {
    const all = {
      variant_id: `'${variantId}'`,
      type: "'RECEIVED'",
      on_hand_delta: "1",
      ...cols,
    };
    return `INSERT INTO "stock_movement" (${Object.keys(all)
      .map((k) => `"${k}"`)
      .join(", ")})
            VALUES (${Object.values(all).join(", ")})`;
  };

  it("rejects a movement that changes nothing", () =>
    expectCheck(
      db,
      movement({ on_hand_delta: "0", reserved_delta: "0" }),
      "stock_movement_delta_check",
    ));

  it.each(["ADJUSTMENT", "CORRECTION"])(
    "requires a reason for %s",
    async (type) => {
      await expectCheck(
        db,
        movement({ type: `'${type}'` }),
        "stock_movement_reason_check",
      );
      await expectCheck(
        db,
        movement({ type: `'${type}'`, reason: "'  '" }),
        "stock_movement_reason_check",
      );
      await expectAccepted(
        db,
        movement({ type: `'${type}'`, reason: "'TEST count'" }),
      );
    },
  );

  it("does not require a reason for RECEIVED", () =>
    expectAccepted(db, movement({})));

  it("requires reference type and id together", async () => {
    await expectCheck(
      db,
      movement({ reference_type: "'ADMIN'" }),
      "stock_movement_reference_check",
    );
    await expectCheck(
      db,
      movement({ reference_id: "uuidv7()" }),
      "stock_movement_reference_check",
    );
    await expectAccepted(
      db,
      movement({ reference_type: "'ADMIN'", reference_id: "uuidv7()" }),
    );
  });

  it("rejects a movement for a variant that does not exist", () =>
    expectCode(
      db,
      movement({ variant_id: "uuidv7()" }),
      SQLSTATE.FOREIGN_KEY,
      "stock_movement_variant_id_fkey",
    ));
});

describe("stock reservations", () => {
  const reservation = (quantity: string, status: string, expires: string) =>
    `INSERT INTO "stock_reservation" ("variant_id", "quantity", "status", "expires_at", "updated_at")
     VALUES ('${variantId}', ${quantity}, '${status}', ${expires}, now())`;

  it.each(["0", "-1"])("rejects quantity %s", (quantity) =>
    expectCheck(
      db,
      reservation(quantity, "ACTIVE", "now() + interval '15 minutes'"),
      "stock_reservation_quantity_check",
    ),
  );

  it.each([
    ["no expiry", "NULL"],
    ["an expiry in the past", "now() - interval '1 minute'"],
    ["an expiry equal to creation", "now()"],
  ])("rejects an ACTIVE reservation with %s", (_name, expires) =>
    expectCheck(
      db,
      reservation("1", "ACTIVE", expires),
      "stock_reservation_expiry_check",
    ),
  );

  it("accepts an ACTIVE reservation that expires later", () =>
    expectAccepted(
      db,
      reservation("1", "ACTIVE", "now() + interval '15 minutes'"),
    ));

  it.each(["CONVERTED", "RELEASED", "EXPIRED"])(
    "allows %s without an expiry",
    (status) => expectAccepted(db, reservation("1", status, "NULL")),
  );
});

describe("history survives deletion attempts", () => {
  it("refuses to delete a product whose variant has stock history; nothing is lost", async () => {
    const product = await fx.product(db);
    const variant = await fx.variant(db, product);
    const actor = await fx.admin(db);
    await db.$executeRawUnsafe(
      `INSERT INTO "inventory_level" ("variant_id", "on_hand", "updated_at") VALUES ('${variant}', 3, now())`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "stock_movement" ("variant_id", "type", "on_hand_delta", "actor_admin_id") VALUES ('${variant}', 'RECEIVED', 3, '${actor}')`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "audit_log" ("actor_admin_id", "action", "entity_type", "entity_id") VALUES ('${actor}', 'product.update', 'product', '${product}')`,
    );
    const counts = () =>
      db.$queryRawUnsafe<{ m: number; a: number; v: number; i: number }[]>(
        `SELECT (SELECT count(*)::int FROM "stock_movement" WHERE "variant_id" = '${variant}') AS m,
                (SELECT count(*)::int FROM "audit_log" WHERE "entity_id" = '${product}') AS a,
                (SELECT count(*)::int FROM "product_variant" WHERE "id" = '${variant}') AS v,
                (SELECT count(*)::int FROM "inventory_level" WHERE "variant_id" = '${variant}') AS i`,
      );
    const before = await counts();
    expect(before).toEqual([{ m: 1, a: 1, v: 1, i: 1 }]);
    await expectCode(
      db,
      `DELETE FROM "product" WHERE "id" = '${product}'`,
      SQLSTATE.RESTRICT,
      "product_variant_product_id_fkey",
    );
    await expectCode(
      db,
      `DELETE FROM "product_variant" WHERE "id" = '${variant}'`,
      SQLSTATE.RESTRICT,
    );
    expect(await counts()).toEqual(before);
  });

  it("cascades only product images and collection links when a product has no variants", async () => {
    const product = await fx.product(db);
    const media = await fx.media(db);
    await db.$executeRawUnsafe(
      `INSERT INTO "product_image" ("product_id", "media_asset_id", "alt") VALUES ('${product}', '${media}', 'TEST alt')`,
    );
    const [col] = await db.$queryRawUnsafe<{ id: string }[]>(
      `INSERT INTO "collection" ("name", "slug", "updated_at") VALUES ('TEST', 'test-cascade', now()) RETURNING "id"`,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO "collection_product" ("collection_id", "product_id") VALUES ('${col!.id}', '${product}')`,
    );
    await expectAccepted(db, `DELETE FROM "product" WHERE "id" = '${product}'`);
    const [left] = await db.$queryRawUnsafe<
      { img: number; link: number; media: number; col: number }[]
    >(
      `SELECT (SELECT count(*)::int FROM "product_image" WHERE "product_id" = '${product}') AS img,
              (SELECT count(*)::int FROM "collection_product" WHERE "product_id" = '${product}') AS link,
              (SELECT count(*)::int FROM "media_asset" WHERE "id" = '${media}') AS media,
              (SELECT count(*)::int FROM "collection" WHERE "id" = '${col!.id}') AS col`,
    );
    // Images and links go; the media file record and the collection stay.
    expect(left).toEqual({ img: 0, link: 0, media: 1, col: 1 });
  });
});
