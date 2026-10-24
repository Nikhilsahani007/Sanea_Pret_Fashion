// Append-only logs (D-057): PostgreSQL rejects UPDATE, DELETE and TRUNCATE,
// with SQLSTATE P0001 (not a misleading foreign-key code), and rows survive.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { APPEND_ONLY_TABLES } from "./handwritten.ts";
import { createTestDatabase, dbError } from "./testing/database.ts";
import { SQLSTATE, expectCode } from "./testing/expect.ts";
import * as fx from "./testing/fixtures.ts";

let db: PrismaClient;
let drop: () => Promise<void>;
const ids: Record<string, string> = {};

const snapshot = (table: string) =>
  db.$queryRawUnsafe<{ row: string }[]>(
    `SELECT row_to_json(t)::text AS row FROM "${table}" t ORDER BY "id"`,
  );

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
  const variant = await fx.variant(db);
  const actor = await fx.admin(db);
  const [m] = await db.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "stock_movement" ("variant_id", "type", "on_hand_delta", "reason", "actor_admin_id")
     VALUES ('${variant}', 'ADJUSTMENT', 2, 'TEST count', '${actor}') RETURNING "id"`,
  );
  const [a] = await db.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "audit_log" ("actor_admin_id", "action", "entity_type", "entity_id", "after")
     VALUES ('${actor}', 'product.update', 'product', 'TEST', '{"name":"TEST"}') RETURNING "id"`,
  );
  const order = await fx.order(db);
  const [e] = await db.$queryRawUnsafe<{ id: string }[]>(
    `INSERT INTO "order_status_event" ("order_id", "to_status", "actor_type", "note")
     VALUES ('${order}', 'PENDING_CONFIRMATION', 'SYSTEM', 'TEST placed') RETURNING "id"`,
  );
  ids.stock_movement = m!.id;
  ids.audit_log = a!.id;
  ids.order_status_event = e!.id;
});
afterAll(() => drop());

describe.each(APPEND_ONLY_TABLES)("%s", (table) => {
  const message = `${table} is append-only`;

  it("rejects UPDATE, DELETE and TRUNCATE with P0001, leaving rows intact", async () => {
    const before = await snapshot(table);
    expect(before).toHaveLength(1);
    const column = {
      audit_log: `"action" = 'tampered'`,
      stock_movement: `"reason" = 'tampered'`,
      order_status_event: `"note" = 'tampered'`,
    }[table];
    await expectCode(
      db,
      `UPDATE "${table}" SET ${column}`,
      SQLSTATE.RAISE,
      message,
    );
    await expectCode(
      db,
      `DELETE FROM "${table}" WHERE "id" = '${ids[table]}'`,
      SQLSTATE.RAISE,
      message,
    );
    await expectCode(db, `DELETE FROM "${table}"`, SQLSTATE.RAISE, message);
    await expectCode(db, `TRUNCATE "${table}"`, SQLSTATE.RAISE, message);
    await expectCode(
      db,
      `TRUNCATE "${table}" CASCADE`,
      SQLSTATE.RAISE,
      message,
    );
    expect(await snapshot(table)).toEqual(before);
  });

  it("still accepts new rows", async () => {
    const before = (await snapshot(table)).length;
    const [actor] = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "admin_user" LIMIT 1`,
    );
    const sql = {
      audit_log: `INSERT INTO "audit_log" ("actor_admin_id", "action", "entity_type") VALUES ('${actor!.id}', 'settings.update', 'store_setting')`,
      stock_movement: `INSERT INTO "stock_movement" ("variant_id", "type", "on_hand_delta") SELECT "variant_id", 'RECEIVED', 1 FROM "stock_movement" LIMIT 1`,
      order_status_event: `INSERT INTO "order_status_event" ("order_id", "from_status", "to_status", "actor_type") SELECT "order_id", 'PENDING_CONFIRMATION', 'CONFIRMED', 'ADMIN' FROM "order_status_event" LIMIT 1`,
    }[table];
    await db.$executeRawUnsafe(sql);
    expect((await snapshot(table)).length).toBe(before + 1);
  });
});

describe("through the Prisma client", () => {
  it("reports the trigger's P0001, not a foreign-key error (P2003)", async () => {
    const attempts = [
      db.stockMovement.update({
        where: { id: ids.stock_movement! },
        data: { reason: "tampered" },
      }),
      db.stockMovement.delete({ where: { id: ids.stock_movement! } }),
      db.auditLog.update({
        where: { id: ids.audit_log! },
        data: { action: "tampered" },
      }),
      db.auditLog.deleteMany({}),
    ];
    for (const attempt of attempts) {
      const error = await attempt.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeDefined();
      expect((error as { code?: string }).code).not.toBe("P2003");
      expect(dbError(error)).toEqual({
        code: SQLSTATE.RAISE,
        message: expect.stringMatching(
          /^(stock_movement|audit_log) is append-only$/,
        ),
      });
    }
  });
});
