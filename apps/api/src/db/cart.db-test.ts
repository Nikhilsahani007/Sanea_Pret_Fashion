// Guest cart rules enforced by PostgreSQL (migration
// 20261023180000_guest_cart; phase-11-plan.md §5.1; D-099): a 32-byte token
// hash, unique; expiry after creation; line quantity 1 to 10; one line per
// variant; lines go with their cart; a variant in a cart cannot be deleted.
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

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
});
afterAll(() => drop());

let n = 0;
/** A distinct 32-byte value, as hex, for each cart. */
const hash = (bytes = 32) =>
  `decode('${(++n).toString(16).padStart(2, "0").repeat(bytes)}', 'hex')`;
const cartSql = (h = hash(), expires = "now() + interval '30 days'") =>
  `INSERT INTO "cart" ("token_hash", "updated_at", "expires_at") VALUES (${h}, now(), ${expires})`;

async function cart(): Promise<string> {
  const [row] = await db.$queryRawUnsafe<{ id: string }[]>(
    `${cartSql()} RETURNING "id"::text AS "id"`,
  );
  return row!.id;
}
const lineSql = (c: string, v: string, quantity: number) =>
  `INSERT INTO "cart_item" ("cart_id", "variant_id", "quantity", "updated_at") VALUES ('${c}', '${v}', ${quantity}, now())`;

describe("cart", () => {
  it("stores a 32-byte token hash and nothing shorter or longer", async () => {
    await expectCheck(db, cartSql(hash(31)), "cart_token_hash_check");
    await expectCheck(db, cartSql(hash(33)), "cart_token_hash_check");
    await expectAccepted(db, cartSql(hash(32)));
  });

  it("refuses a second cart with the same token hash", async () => {
    const h = hash();
    await expectAccepted(db, cartSql(h));
    await expectCode(db, cartSql(h), SQLSTATE.UNIQUE, "cart_token_hash_key");
  });

  it("requires the expiry to be after creation", () =>
    expectCheck(
      db,
      cartSql(hash(), "now() - interval '1 second'"),
      "cart_expiry_check",
    ));

  it("has no price, total or customer column (prices are never stored; D-034)", async () => {
    const rows = await db.$queryRawUnsafe<{ c: string }[]>(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name IN ('cart', 'cart_item') ORDER BY 1`,
    );
    expect(rows.map((r) => r.c)).toEqual([
      "cart.created_at",
      "cart.expires_at",
      "cart.id",
      "cart.token_hash",
      "cart.updated_at",
      "cart_item.cart_id",
      "cart_item.created_at",
      "cart_item.quantity",
      "cart_item.updated_at",
      "cart_item.variant_id",
    ]);
  });
});

describe("cart lines", () => {
  it("hold 1 to 10 of a variant (D-115, D-099)", async () => {
    const c = await cart();
    const v = await fx.variant(db);
    await expectCheck(db, lineSql(c, v, 0), "cart_item_quantity_check");
    await expectCheck(db, lineSql(c, v, 11), "cart_item_quantity_check");
    await expectCheck(db, lineSql(c, v, -1), "cart_item_quantity_check");
    await expectAccepted(db, lineSql(c, v, 10));
    await expectCheck(
      db,
      `UPDATE "cart_item" SET "quantity" = 11 WHERE "cart_id" = '${c}'`,
      "cart_item_quantity_check",
    );
  });

  it("keep one line per variant in a cart", async () => {
    const c = await cart();
    const v = await fx.variant(db);
    await expectAccepted(db, lineSql(c, v, 1));
    await expectCode(db, lineSql(c, v, 2), SQLSTATE.UNIQUE, "cart_item_pkey");
  });

  it("refuse an unknown cart or variant", async () => {
    const c = await cart();
    const v = await fx.variant(db);
    const none = "00000000-0000-7000-8000-000000000000";
    await expectCode(db, lineSql(none, v, 1), SQLSTATE.FOREIGN_KEY);
    await expectCode(db, lineSql(c, none, 1), SQLSTATE.FOREIGN_KEY);
  });

  it("are deleted with their cart", async () => {
    const c = await cart();
    await expectAccepted(db, lineSql(c, await fx.variant(db), 2));
    await expectAccepted(db, `DELETE FROM "cart" WHERE "id" = '${c}'`);
    expect(
      await db.$queryRawUnsafe(
        `SELECT 1 FROM "cart_item" WHERE "cart_id" = '${c}'`,
      ),
    ).toEqual([]);
  });

  it("stop a variant in a cart from being deleted", async () => {
    const c = await cart();
    const v = await fx.variant(db);
    await expectAccepted(db, lineSql(c, v, 1));
    await expectCode(
      db,
      `DELETE FROM "product_variant" WHERE "id" = '${v}'`,
      SQLSTATE.RESTRICT,
      "cart_item_variant_id_fkey",
    );
  });
});
