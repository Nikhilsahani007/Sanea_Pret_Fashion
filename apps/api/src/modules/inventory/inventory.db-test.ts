// Phase 9 verification (testing-strategy.md §3, "Inventory and overselling"):
// concurrent reservations never oversell, multi-line holds are all-or-nothing,
// expiry and release return stock, adjustments respect reservations, and each
// change writes exactly one movement. Real PostgreSQL, real concurrency.
import { AdminRole } from "@sanea/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.ts";
import * as fx from "../../db/testing/fixtures.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";
import {
  adjust,
  OutOfStock,
  release,
  releaseExpired,
  reserve,
  StockRuleViolation,
} from "./service.ts";

let h: Harness;
let db: PrismaClient;
const T0 = new Date("2026-10-19T10:00:00.000Z");
const HOLD = new Date(T0.getTime() + 15 * 60_000);
// Many transactions wait for the connection pool at once.
const TX = { maxWait: 30_000, timeout: 30_000 };

beforeAll(async () => {
  h = await adminHarness();
  db = h.db;
});
afterAll(() => h.drop());

async function stocked(onHand: number): Promise<string> {
  const id = await fx.variant(db);
  await db.inventoryLevel.create({ data: { variantId: id, onHand } });
  return id;
}

const level = (variantId: string) =>
  db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });
const reserveOne = (variantId: string, quantity = 1) =>
  db.$transaction(
    (tx) =>
      reserve(tx, [{ variantId, quantity }], { expiresAt: HOLD, now: T0 }),
    TX,
  );

describe("overselling", () => {
  it("two concurrent checkouts for the last unit: exactly one succeeds", async () => {
    const v = await stocked(1);
    const results = await Promise.allSettled([reserveOne(v), reserveOne(v)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failed = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(OutOfStock);
    expect((failed.reason as OutOfStock).lines).toEqual([
      { variantId: v, requested: 1, available: 0 },
    ]);
    expect(await level(v)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("fifty concurrent checkouts for ten units: exactly ten succeed", async () => {
    const v = await stocked(10);
    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => reserveOne(v)),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(
      results
        .filter((r) => r.status === "rejected")
        .every(
          (r) => (r as PromiseRejectedResult).reason instanceof OutOfStock,
        ),
    ).toBe(true);
    const l = await level(v);
    expect(l).toMatchObject({ onHand: 10, reserved: 10 });
    expect(l.onHand - l.reserved).toBe(0);
    expect(
      await db.stockReservation.count({
        where: { variantId: v, status: "ACTIVE" },
      }),
    ).toBe(10);
    expect(
      await db.stockMovement.count({
        where: { variantId: v, type: "RESERVED" },
      }),
    ).toBe(10);
  });

  it("concurrent multi-line carts in opposite orders do not deadlock or oversell", async () => {
    const a = await stocked(5);
    const b = await stocked(5);
    const runs = Array.from({ length: 20 }, (_, i) =>
      db.$transaction(
        (tx) =>
          reserve(
            tx,
            i % 2
              ? [
                  { variantId: a, quantity: 1 },
                  { variantId: b, quantity: 1 },
                ]
              : [
                  { variantId: b, quantity: 1 },
                  { variantId: a, quantity: 1 },
                ],
            { expiresAt: HOLD, now: T0 },
          ),
        TX,
      ),
    );
    const results = await Promise.allSettled(runs);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await level(a)).toMatchObject({ reserved: 5 });
    expect(await level(b)).toMatchObject({ reserved: 5 });
  });

  it("a multi-line cart with one short line rolls back entirely and reports each line", async () => {
    const plenty = await stocked(10);
    const short = await stocked(1);
    await expect(
      db.$transaction(
        (tx) =>
          reserve(
            tx,
            [
              { variantId: plenty, quantity: 2 },
              { variantId: short, quantity: 3 },
            ],
            { expiresAt: HOLD, now: T0 },
          ),
        TX,
      ),
    ).rejects.toMatchObject({
      lines: [{ variantId: short, requested: 3, available: 1 }],
    });
    expect(await level(plenty)).toMatchObject({ reserved: 0 });
    expect(await db.stockMovement.count({ where: { variantId: plenty } })).toBe(
      0,
    );
  });

  it("merges repeated lines for the same variant", async () => {
    const v = await stocked(3);
    await expect(
      db.$transaction(
        (tx) =>
          reserve(
            tx,
            [
              { variantId: v, quantity: 2 },
              { variantId: v, quantity: 2 },
            ],
            { expiresAt: HOLD, now: T0 },
          ),
        TX,
      ),
    ).rejects.toBeInstanceOf(OutOfStock);
    await db.$transaction(
      (tx) =>
        reserve(
          tx,
          [
            { variantId: v, quantity: 2 },
            { variantId: v, quantity: 1 },
          ],
          { expiresAt: HOLD, now: T0 },
        ),
      TX,
    );
    expect(await level(v)).toMatchObject({ reserved: 3 });
    expect(await db.stockReservation.count({ where: { variantId: v } })).toBe(
      1,
    );
  });

  it("refuses inactive variants (SR-14)", async () => {
    const v = await stocked(5);
    await db.productVariant.update({
      where: { id: v },
      data: { isActive: false },
    });
    await expect(reserveOne(v)).rejects.toMatchObject({
      lines: [{ variantId: v, requested: 1, available: 0 }],
    });
  });

  it("the database still rejects reserved above on hand, even through direct SQL", async () => {
    const v = await stocked(1);
    await expect(
      db.$executeRawUnsafe(
        `UPDATE "inventory_level" SET "reserved" = 2 WHERE "variant_id" = '${v}'`,
      ),
    ).rejects.toThrow(/inventory_level_reserved_check/);
  });
});

describe("release and expiry", () => {
  it("releases a reservation and records the movement", async () => {
    const v = await stocked(2);
    const { reservationIds } = await reserveOne(v, 2);
    expect(await db.$transaction((tx) => release(tx, reservationIds))).toBe(1);
    expect(await level(v)).toMatchObject({ reserved: 0 });
    expect(
      await db.stockReservation.findUniqueOrThrow({
        where: { id: reservationIds[0]! },
      }),
    ).toMatchObject({ status: "RELEASED", expiresAt: null });
    // Releasing twice changes nothing.
    expect(await db.$transaction((tx) => release(tx, reservationIds))).toBe(0);
    expect(
      await db.stockMovement.count({
        where: { variantId: v, type: "RELEASED" },
      }),
    ).toBe(1);
  });

  it("expires holds after their time, also lazily when someone else reserves", async () => {
    const v = await stocked(1);
    await reserveOne(v);
    await expect(reserveOne(v)).rejects.toBeInstanceOf(OutOfStock);
    // After the hold expires, the next reservation releases it first.
    const later = new Date(HOLD.getTime() + 1);
    await db.$transaction(
      (tx) =>
        reserve(tx, [{ variantId: v, quantity: 1 }], {
          expiresAt: new Date(later.getTime() + 900_000),
          now: later,
        }),
      TX,
    );
    expect(
      await db.stockReservation.count({
        where: { variantId: v, status: "EXPIRED" },
      }),
    ).toBe(1);
    expect(await level(v)).toMatchObject({ reserved: 1 });
  });

  it("the expiry sweep releases every expired hold once, even when run concurrently", async () => {
    const v = await stocked(4);
    for (let i = 0; i < 4; i++) await reserveOne(v);
    const after = new Date(HOLD.getTime() + 1);
    const counts = await Promise.all(
      [1, 2, 3].map(() =>
        db.$transaction((tx) => releaseExpired(tx, after, [v]), TX),
      ),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(4);
    expect(await level(v)).toMatchObject({ reserved: 0 });
  });
});

describe("adjustments", () => {
  let adminId: string;
  beforeAll(async () => {
    adminId = await fx.admin(db, "FULFILMENT");
  });

  it("cannot take on hand below reserved (SR-12) or below zero", async () => {
    const v = await stocked(3);
    await reserveOne(v, 2);
    await expect(
      db.$transaction((tx) =>
        adjust(tx, {
          variantId: v,
          delta: -2,
          type: "ADJUSTMENT",
          reason: "Damaged",
          actorAdminId: adminId,
        }),
      ),
    ).rejects.toMatchObject({ reason: "BELOW_RESERVED" });
    await expect(
      db.$transaction((tx) =>
        adjust(tx, {
          variantId: v,
          delta: -9,
          type: "ADJUSTMENT",
          reason: "Count",
          actorAdminId: adminId,
        }),
      ),
    ).rejects.toBeInstanceOf(StockRuleViolation);
    const r = await db.$transaction((tx) =>
      adjust(tx, {
        variantId: v,
        delta: -1,
        type: "ADJUSTMENT",
        reason: "Damaged in storage",
        actorAdminId: adminId,
      }),
    );
    expect(r.after).toEqual({ onHand: 2, reserved: 2 });
  });

  it("writes exactly one movement per change, matching the level", async () => {
    const v = await stocked(0);
    await db.$transaction((tx) =>
      adjust(tx, {
        variantId: v,
        delta: 7,
        type: "RECEIVED",
        reason: "TEST delivery",
        actorAdminId: adminId,
      }),
    );
    const { reservationIds } = await reserveOne(v, 3);
    await db.$transaction((tx) => release(tx, reservationIds));
    await db.$transaction((tx) =>
      adjust(tx, {
        variantId: v,
        delta: -2,
        type: "CORRECTION",
        reason: "Miscount",
        actorAdminId: adminId,
      }),
    );
    const moves = await db.stockMovement.findMany({ where: { variantId: v } });
    expect(moves.map((m) => m.type)).toEqual([
      "RECEIVED",
      "RESERVED",
      "RELEASED",
      "CORRECTION",
    ]);
    const sum = moves.reduce(
      (acc, m) => ({
        onHand: acc.onHand + m.onHandDelta,
        reserved: acc.reserved + m.reservedDelta,
      }),
      { onHand: 0, reserved: 0 },
    );
    expect(await level(v)).toMatchObject(sum);
  });

  it("concurrent adjustments are serialised", async () => {
    const v = await stocked(0);
    await Promise.all(
      Array.from({ length: 20 }, () =>
        db.$transaction(
          (tx) =>
            adjust(tx, {
              variantId: v,
              delta: 1,
              type: "RECEIVED",
              reason: "TEST unit",
              actorAdminId: adminId,
            }),
          TX,
        ),
      ),
    );
    expect(await level(v)).toMatchObject({ onHand: 20 });
  });
});

describe("admin inventory API", () => {
  let owner: Session;
  let fulfilment: Session;
  let editor: Session;
  let v: string;

  beforeAll(async () => {
    owner = await h.signIn(await h.createAdmin(AdminRole.OWNER));
    fulfilment = await h.signIn(await h.createAdmin(AdminRole.FULFILMENT));
    editor = await h.signIn(await h.createAdmin(AdminRole.CATALOGUE_EDITOR));
    v = await stocked(1);
    await db.inventoryLevel.update({
      where: { variantId: v },
      data: { lowStockThreshold: 2 },
    });
  });

  it("lists levels for every role and filters low stock", async () => {
    const res = await h.get("/api/v1/admin/inventory?lowStock=true", editor);
    expect(res.status).toBe(200);
    expect(
      res.body.items.map((i: { variantId: string }) => i.variantId),
    ).toContain(v);
    expect(res.body.items.every((i: { lowStock: boolean }) => i.lowStock)).toBe(
      true,
    );
  });

  it("lets fulfilment adjust with a reason, audited; refuses the catalogue editor", async () => {
    const path = `/api/v1/admin/inventory/${v}/adjustments`;
    expect(
      (
        await h.post(
          path,
          { delta: 5, type: "RECEIVED", reason: "TEST delivery" },
          editor,
        )
      ).status,
    ).toBe(403);
    expect(
      (await h.post(path, { delta: 5, reason: "" }, fulfilment)).status,
    ).toBe(400);
    expect(
      (
        await h.post(
          path,
          { delta: -1, type: "RECEIVED", reason: "TEST wrong" },
          fulfilment,
        )
      ).status,
    ).toBe(400);
    const res = await h.post(
      path,
      { delta: 5, type: "RECEIVED", reason: "TEST delivery" },
      fulfilment,
    );
    expect(res.status).toBe(201);
    expect(res.body.level).toMatchObject({
      onHand: 6,
      reserved: 0,
      available: 6,
    });
    const audit = await db.auditLog.findFirst({
      where: { action: "inventory.adjusted", entityId: v },
    });
    expect(audit?.before).toEqual({ onHand: 1, reserved: 0 });
  });

  it("returns 409 BELOW_RESERVED instead of overselling", async () => {
    await reserveOne(v, 4);
    const res = await h.post(
      `/api/v1/admin/inventory/${v}/adjustments`,
      { delta: -3, reason: "TEST count" },
      owner,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: "BELOW_RESERVED" });
  });

  it("shows the movement history to stock roles only", async () => {
    const res = await h.get(
      `/api/v1/admin/inventory/movements?variantId=${v}`,
      fulfilment,
    );
    expect(res.body.movements.map((m: { type: string }) => m.type)).toEqual([
      "RESERVED",
      "RECEIVED",
    ]);
    expect(
      (await h.get("/api/v1/admin/inventory/movements", editor)).status,
    ).toBe(403);
  });

  it("updates the threshold, and the storefront shows the real remaining count", async () => {
    expect(
      (
        await h.patch(
          `/api/v1/admin/inventory/${v}`,
          { lowStockThreshold: 3 },
          fulfilment,
        )
      ).status,
    ).toBe(204);
    const row = (
      await h.get(
        `/api/v1/admin/inventory?sku=${(await db.productVariant.findUniqueOrThrow({ where: { id: v } })).sku}`,
        owner,
      )
    ).body.items[0];
    expect(row).toMatchObject({
      onHand: 6,
      reserved: 4,
      available: 2,
      lowStockThreshold: 3,
      lowStock: true,
    });
    expect((await request(h.app).get("/api/v1/admin/inventory")).status).toBe(
      401,
    );
  });
});
