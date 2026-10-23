// Inventory against real PostgreSQL (phase-9-plan.md §4; testing-strategy.md
// §3 "Inventory and overselling"; P9-AC1 to P9-AC5). The concurrency cases C1
// to C12 run parallel transactions on their own connections and write a
// `[P9-CONC]` line each, for the Phase 9 gate review. After every test the
// movement ledger must reconcile with the stock levels (C10).
import { PrismaPg } from "@prisma/adapter-pg";
import { AdminRole, EMPTY_RICH_TEXT } from "@sanea/shared";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client.ts";
import { urlFor } from "../../db/testing/database.ts";
import { ADMIN } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";
import { startExpiryJob } from "./job.ts";
import {
  adjust,
  availabilityOf,
  expireDue,
  mergeLines,
  release,
  reserve,
} from "./service.ts";

let h: Harness;
/** A second client with a large pool: the parallel cases need real connections. */
let pool: PrismaClient;
const sessions = new Map<AdminRole, Session>();
let actorId: string;
const TTL = { ttlMinutes: 15 };
const A = "/api/v1/admin/inventory";

beforeAll(async () => {
  h = await adminHarness();
  pool = new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlFor(h.dbName), max: 40 }),
  });
  for (const role of Object.values(AdminRole)) {
    const admin = await h.createAdmin(role);
    if (role === AdminRole.MANAGER) actorId = admin.id;
    sessions.set(role, await h.signIn(admin));
  }
}, 120_000);

afterAll(async () => {
  await pool.$disconnect();
  await h.drop();
});

/** C10: sum of movement deltas equals the stock level, for every variant. */
afterEach(async () => {
  const drift = await pool.$queryRaw<{ variant_id: string }[]>`
    SELECT il."variant_id"::text FROM "inventory_level" il
    LEFT JOIN "stock_movement" m ON m."variant_id" = il."variant_id"
    GROUP BY il."variant_id", il."on_hand", il."reserved"
    HAVING il."on_hand" <> COALESCE(SUM(m."on_hand_delta"), 0)
        OR il."reserved" <> COALESCE(SUM(m."reserved_delta"), 0)`;
  expect(drift, "ledger out of step with stock levels").toEqual([]);
});

const report = (line: string) => process.stdout.write(`[P9-CONC] ${line}\n`);

let n = 0;
async function variant(
  onHand: number,
  options: {
    active?: boolean;
    productStatus?: "PUBLISHED" | "DRAFT" | "ARCHIVED";
  } = {},
): Promise<string> {
  const i = ++n;
  const category = await h.db.category.create({
    data: { name: `TEST ${i}`, slug: `test-inv-cat-${i}`, status: "PUBLISHED" },
  });
  const colour = await h.db.colour.create({
    data: {
      name: `TEST ${i}`,
      slug: `test-inv-col-${i}`,
      swatchHex: "#000000",
    },
  });
  const status = options.productStatus ?? "PUBLISHED";
  const product = await h.db.product.create({
    data: {
      name: `TEST ${i}`,
      slug: `test-inv-${i}`,
      categoryId: category.id,
      shortDescription: "TEST",
      description: EMPTY_RICH_TEXT,
      status,
      publishedAt: status === "DRAFT" ? null : new Date(),
    },
  });
  const size = await h.db.size.findUniqueOrThrow({ where: { label: "S" } });
  const v = await h.db.productVariant.create({
    data: {
      productId: product.id,
      colourId: colour.id,
      sizeId: size.id,
      sku: `TEST-INV-${i}`,
      pricePaise: 100_000,
      isActive: options.active ?? true,
      inventory: { create: {} },
    },
  });
  // Stock arrives as a RECEIVED movement, like a real delivery.
  if (onHand > 0)
    await adjust(pool, {
      variantId: v.id,
      type: "RECEIVED",
      delta: onHand,
      reason: null,
      actorAdminId: actorId,
      ip: undefined,
      ipHashKey: "x".repeat(32),
    });
  return v.id;
}

const level = (variantId: string) =>
  h.db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });

const settled = <T>(promises: Promise<T>[]) => Promise.allSettled(promises);
const codeOf = (r: PromiseSettledResult<unknown>) =>
  r.status === "rejected"
    ? ((r.reason as { code?: string }).code ?? String(r.reason))
    : "OK";

/** Makes reservations due now (the TTL is at least 5 minutes in production). */
async function makeDue(variantId: string) {
  await pool.$executeRaw`
    UPDATE "stock_reservation"
    SET "created_at" = now() - interval '20 minutes', "expires_at" = now() - interval '1 minute'
    WHERE "variant_id" = ${variantId}::uuid AND "status" = 'ACTIVE'`;
}

describe("concurrency and overselling (Phase 9 gate)", () => {
  it("C1: two concurrent reservations for the last unit: exactly one succeeds", async () => {
    const v = await variant(1);
    const results = await settled(
      [1, 2].map(() => reserve(pool, [{ variantId: v, quantity: 1 }], TTL)),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    expect(ok).toHaveLength(1);
    const failed = results.find(
      (r) => r.status === "rejected",
    ) as PromiseRejectedResult;
    expect(failed.reason).toMatchObject({
      code: "OUT_OF_STOCK",
      details: [{ variantId: v, requested: 1, available: 0 }],
    });
    expect(await level(v)).toMatchObject({ onHand: 1, reserved: 1 });
    report(
      `C1 last unit, 2 concurrent: ${ok.length} reserved, ${results.length - ok.length} OUT_OF_STOCK; on_hand 1, reserved 1`,
    );
  });

  it("C2: fifty concurrent reservations of 1 for 10 units: exactly 10 succeed", async () => {
    const v = await variant(10);
    const results = await settled(
      Array.from({ length: 50 }, () =>
        reserve(pool, [{ variantId: v, quantity: 1 }], TTL),
      ),
    );
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c === "OK")).toHaveLength(10);
    expect(codes.filter((c) => c === "OUT_OF_STOCK")).toHaveLength(40);
    const l = await level(v);
    expect(l).toMatchObject({ onHand: 10, reserved: 10 });
    expect(
      await h.db.stockReservation.count({
        where: { variantId: v, status: "ACTIVE" },
      }),
    ).toBe(10);
    report(
      `C2 50 concurrent x1 for 10 units: 10 reserved, 40 OUT_OF_STOCK, other errors ${codes.filter((c) => c !== "OK" && c !== "OUT_OF_STOCK").length}; on_hand ${l.onHand}, reserved ${l.reserved}, available ${l.onHand - l.reserved}`,
    );
  });

  it("C3: fifty concurrent reservations of 1 to 3 for 20 units: never oversold", async () => {
    const v = await variant(20);
    const quantities = Array.from({ length: 50 }, (_, i) => (i % 3) + 1);
    const results = await settled(
      quantities.map((q) =>
        reserve(pool, [{ variantId: v, quantity: q }], TTL),
      ),
    );
    const granted = results.reduce(
      (sum, r, i) => (r.status === "fulfilled" ? sum + quantities[i]! : sum),
      0,
    );
    const l = await level(v);
    expect(
      results.every((r) => codeOf(r) === "OK" || codeOf(r) === "OUT_OF_STOCK"),
    ).toBe(true);
    expect(granted).toBeLessThanOrEqual(20);
    expect(l.reserved).toBe(granted);
    expect(l.onHand - l.reserved).toBeGreaterThanOrEqual(0);
    report(
      `C3 50 concurrent x(1..3) for 20 units: ${granted} units reserved in ${results.filter((r) => r.status === "fulfilled").length} reservations; available ${l.onHand - l.reserved}`,
    );
  });

  it("C4: a multi-line cart with one short line rolls back entirely", async () => {
    const [a, b, c] = [await variant(5), await variant(1), await variant(4)];
    const movementsBefore = await h.db.stockMovement.count();
    const error = await reserve(
      pool,
      [
        { variantId: a, quantity: 2 },
        { variantId: b, quantity: 2 },
        { variantId: c, quantity: 1 },
      ],
      TTL,
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "OUT_OF_STOCK" });
    const details = (
      error as {
        details: { variantId: string; requested: number; available: number }[];
      }
    ).details;
    expect(
      new Map(details.map((d) => [d.variantId, [d.requested, d.available]])),
    ).toEqual(
      new Map([
        [a, [2, 5]],
        [b, [2, 1]],
        [c, [1, 4]],
      ]),
    );
    for (const v of [a, b, c]) expect((await level(v)).reserved).toBe(0);
    expect(
      await h.db.stockReservation.count({
        where: { variantId: { in: [a, b, c] } },
      }),
    ).toBe(0);
    expect(await h.db.stockMovement.count()).toBe(movementsBefore);
    report(
      "C4 three-line cart, one line short: rolled back; no reservations or movements; each line's availability reported",
    );
  });

  it("C5: opposite-order two-line carts, 40 concurrent: no deadlocks", async () => {
    const [a, b] = [await variant(30), await variant(30)];
    const results = await settled(
      Array.from({ length: 40 }, (_, i) =>
        reserve(
          pool,
          i % 2
            ? [
                { variantId: a, quantity: 1 },
                { variantId: b, quantity: 1 },
              ]
            : [
                { variantId: b, quantity: 1 },
                { variantId: a, quantity: 1 },
              ],
          TTL,
        ),
      ),
    );
    const codes = results.map(codeOf);
    expect(codes.filter((c) => c !== "OK" && c !== "OUT_OF_STOCK")).toEqual([]);
    const ok = codes.filter((c) => c === "OK").length;
    expect(ok).toBe(30);
    expect((await level(a)).reserved).toBe(30);
    expect((await level(b)).reserved).toBe(30);
    report(
      `C5 40 concurrent two-line carts in opposite orders: ${ok} reserved, ${40 - ok} OUT_OF_STOCK, 0 deadlocks or other errors`,
    );
  });

  it("C6: two expiry runs at once and a reservation in flight: each hold expires exactly once", async () => {
    const v = await variant(40);
    await Promise.all(
      Array.from({ length: 30 }, () =>
        reserve(pool, [{ variantId: v, quantity: 1 }], TTL),
      ),
    );
    await makeDue(v);
    const [x, y, fresh] = await Promise.all([
      expireDue(pool, 7),
      expireDue(pool, 7),
      reserve(pool, [{ variantId: v, quantity: 5 }], TTL),
    ]);
    // Expired by the two job runs, or lazily by the reservation in flight.
    const expired = await h.db.stockReservation.count({
      where: { variantId: v, status: "EXPIRED" },
    });
    expect(expired).toBe(30);
    const releasedMovements = await h.db.stockMovement.count({
      where: { variantId: v, type: "RELEASED" },
    });
    expect(releasedMovements).toBe(30);
    expect(fresh).toHaveLength(1);
    expect((await level(v)).reserved).toBe(5);
    report(
      `C6 30 due holds, 2 concurrent expiry runs (${x} + ${y}) and a reservation in flight (lazy ${30 - x - y}): 30 expired once, 30 RELEASED movements; reserved 5`,
    );
  });

  it("C7: an expired hold does not block a new reservation before the job runs", async () => {
    const v = await variant(1);
    await reserve(pool, [{ variantId: v, quantity: 1 }], TTL);
    await expect(
      reserve(pool, [{ variantId: v, quantity: 1 }], TTL),
    ).rejects.toMatchObject({ code: "OUT_OF_STOCK" });
    await makeDue(v);
    const held = await reserve(pool, [{ variantId: v, quantity: 1 }], TTL);
    expect(held).toHaveLength(1);
    expect(
      await h.db.stockReservation.count({
        where: { variantId: v, status: "EXPIRED" },
      }),
    ).toBe(1);
    report(
      "C7 expired hold released lazily by the next reservation; the job was not needed",
    );
  });

  it("C8: concurrent adjustments and reservations never put on hand below reserved", async () => {
    const v = await variant(20);
    const work = [
      ...Array.from({ length: 20 }, () =>
        reserve(pool, [{ variantId: v, quantity: 1 }], TTL),
      ),
      ...Array.from({ length: 10 }, () =>
        adjust(pool, {
          variantId: v,
          type: "ADJUSTMENT",
          delta: -3,
          reason: "TEST damaged",
          actorAdminId: actorId,
          ip: undefined,
          ipHashKey: "x".repeat(32),
        }),
      ),
    ];
    const results = await settled<unknown>(work);
    const reserved = results
      .slice(0, 20)
      .filter((r) => r.status === "fulfilled").length;
    const adjusted = results
      .slice(20)
      .filter((r) => r.status === "fulfilled").length;
    const refused = results.slice(20).filter((r) => r.status === "rejected");
    for (const r of refused)
      expect((r as PromiseRejectedResult).reason).toMatchObject({
        code: "CONFLICT",
        details: [{ code: "STOCK_BELOW_RESERVED" }],
      });
    const l = await level(v);
    expect(l.onHand).toBe(20 - 3 * adjusted);
    expect(l.reserved).toBe(reserved);
    expect(l.reserved).toBeLessThanOrEqual(l.onHand);
    report(
      `C8 20 reservations and 10 adjustments of -3 at once: ${reserved} reserved, ${adjusted} adjustments applied, ${refused.length} refused (STOCK_BELOW_RESERVED); on_hand ${l.onHand}, reserved ${l.reserved}`,
    );
  });

  it("C9: the database rejects invalid states through direct SQL", async () => {
    const v = await variant(2);
    await reserve(pool, [{ variantId: v, quantity: 2 }], TTL);
    const sqlstate = (p: Promise<unknown>) =>
      p.then(
        () => "accepted",
        (e: unknown) => {
          const text = String((e as Error).message ?? e);
          return /23514|check constraint/i.test(text)
            ? "CHECK"
            : /append-only/.test(text)
              ? "APPEND_ONLY"
              : text;
        },
      );
    const results = {
      negativeOnHand: await sqlstate(
        pool.$executeRaw`UPDATE "inventory_level" SET "on_hand" = -1, "reserved" = 0 WHERE "variant_id" = ${v}::uuid`,
      ),
      reservedAboveOnHand: await sqlstate(
        pool.$executeRaw`UPDATE "inventory_level" SET "reserved" = "on_hand" + 1 WHERE "variant_id" = ${v}::uuid`,
      ),
      negativeReserved: await sqlstate(
        pool.$executeRaw`UPDATE "inventory_level" SET "reserved" = -1 WHERE "variant_id" = ${v}::uuid`,
      ),
      movementUpdate: await sqlstate(
        pool.$executeRaw`UPDATE "stock_movement" SET "on_hand_delta" = 99 WHERE "variant_id" = ${v}::uuid`,
      ),
      movementDelete: await sqlstate(
        pool.$executeRaw`DELETE FROM "stock_movement" WHERE "variant_id" = ${v}::uuid`,
      ),
      movementTruncate: await sqlstate(
        pool.$executeRawUnsafe(`TRUNCATE "stock_movement"`),
      ),
      zeroQuantityHold: await sqlstate(
        pool.$executeRaw`INSERT INTO "stock_reservation" ("variant_id", "quantity", "expires_at", "updated_at") VALUES (${v}::uuid, 0, now() + interval '1 minute', now())`,
      ),
      activeHoldWithoutExpiry: await sqlstate(
        pool.$executeRaw`INSERT INTO "stock_reservation" ("variant_id", "quantity", "updated_at") VALUES (${v}::uuid, 1, now())`,
      ),
    };
    expect(results).toEqual({
      negativeOnHand: "CHECK",
      reservedAboveOnHand: "CHECK",
      negativeReserved: "CHECK",
      movementUpdate: "APPEND_ONLY",
      movementDelete: "APPEND_ONLY",
      movementTruncate: "APPEND_ONLY",
      zeroQuantityHold: "CHECK",
      activeHoldWithoutExpiry: "CHECK",
    });
    expect(await level(v)).toMatchObject({ onHand: 2, reserved: 2 });
    report(
      `C9 direct SQL: ${Object.keys(results).length} invalid writes all rejected by CHECKs or the append-only trigger`,
    );
  });

  it("C11: inactive variants and unpublished products cannot be reserved (SR-14)", async () => {
    const inactive = await variant(5, { active: false });
    const draft = await variant(5, { productStatus: "DRAFT" });
    const archived = await variant(5, { productStatus: "ARCHIVED" });
    for (const v of [inactive, draft, archived]) {
      await expect(
        reserve(pool, [{ variantId: v, quantity: 1 }], TTL),
      ).rejects.toMatchObject({
        code: "OUT_OF_STOCK",
        details: [{ variantId: v, requested: 1, available: 0 }],
      });
      expect((await level(v)).reserved).toBe(0);
    }
    report(
      "C11 inactive variant, draft and archived products: OUT_OF_STOCK with available 0; nothing reserved",
    );
  });

  it("C12: releasing twice writes one movement", async () => {
    const v = await variant(3);
    const [held] = await reserve(pool, [{ variantId: v, quantity: 2 }], TTL);
    const [first, second] = await Promise.all([
      release(pool, [held!.id]),
      release(pool, [held!.id]),
    ]);
    expect(first + second).toBe(1);
    expect(
      await h.db.stockMovement.count({
        where: { referenceId: held!.id, type: "RELEASED" },
      }),
    ).toBe(1);
    expect((await level(v)).reserved).toBe(0);
    report(
      "C12 the same reservation released twice concurrently: one release, one RELEASED movement",
    );
  });
});

describe("service details", () => {
  it("merges repeated variants and sorts by id (the lock order)", () => {
    expect(
      mergeLines([
        { variantId: "B0000000-0000-7000-8000-000000000000", quantity: 1 },
        { variantId: "a0000000-0000-7000-8000-000000000000", quantity: 2 },
        { variantId: "b0000000-0000-7000-8000-000000000000", quantity: 3 },
      ]),
    ).toEqual([
      { variantId: "a0000000-0000-7000-8000-000000000000", quantity: 2 },
      { variantId: "b0000000-0000-7000-8000-000000000000", quantity: 4 },
    ]);
  });

  it("holds expire after the TTL by the database clock, and one movement each", async () => {
    const v = await variant(4);
    const before = await pool.$queryRaw<{ now: Date }[]>`SELECT now()`;
    const [held] = await reserve(pool, [{ variantId: v, quantity: 4 }], {
      ttlMinutes: 15,
    });
    const minutes =
      (held!.expiresAt.getTime() - before[0]!.now.getTime()) / 60_000;
    expect(minutes).toBeGreaterThan(14.9);
    expect(minutes).toBeLessThan(15.1);
    const movement = await h.db.stockMovement.findFirstOrThrow({
      where: { referenceId: held!.id },
    });
    expect(movement).toMatchObject({
      type: "RESERVED",
      onHandDelta: 0,
      reservedDelta: 4,
      referenceType: "RESERVATION",
    });
    expect((await availabilityOf(pool, [v])).get(v)).toBe(0);
  });

  it("the expiry job runs on its interval and stops cleanly, waiting for a run", async () => {
    const v = await variant(1);
    await reserve(pool, [{ variantId: v, quantity: 1 }], TTL);
    await makeDue(v);
    const logs: string[] = [];
    const logger = {
      info: (_o: unknown, m: string) => logs.push(m),
      error: (_o: unknown, m: string) => logs.push(m),
    };
    const job = startExpiryJob(pool, logger as never, { intervalMs: 50 });
    await new Promise((r) => setTimeout(r, 400));
    await job.stop();
    expect((await level(v)).reserved).toBe(0);
    expect(logs).toContain("stock reservations expired");
    const after = await h.db.stockMovement.count({ where: { variantId: v } });
    await new Promise((r) => setTimeout(r, 150));
    expect(await h.db.stockMovement.count({ where: { variantId: v } })).toBe(
      after,
    );
  });
});

describe("admin API (P9-AC4)", () => {
  const as = (role: AdminRole) => sessions.get(role)!;

  it("everyone views stock; the low-stock filter uses the view", async () => {
    const plenty = await variant(10);
    const low = await variant(1);
    await reserve(pool, [{ variantId: plenty, quantity: 1 }], TTL);
    for (const role of Object.values(AdminRole))
      expect((await h.get(A, as(role))).status, role).toBe(200);
    const all = await h.get(`${A}?limit=100`, as(AdminRole.CATALOGUE_EDITOR));
    const row = all.body.items.find(
      (r: { variantId: string }) => r.variantId === plenty,
    );
    expect(row).toMatchObject({
      onHand: 10,
      reserved: 1,
      available: 9,
      lowStockThreshold: 2,
      lowStock: false,
      isActive: true,
      size: "S",
    });
    expect(all.headers["cache-control"]).toBe("no-store");
    const lowOnly = await h.get(
      `${A}?lowStock=true&limit=100`,
      as(AdminRole.FULFILMENT),
    );
    const ids = lowOnly.body.items.map(
      (r: { variantId: string }) => r.variantId,
    );
    expect(ids).toContain(low);
    expect(ids).not.toContain(plenty);
    expect((await h.get(A)).status).toBe(401);
  });

  it("filters by SKU prefix and product, and pages by SKU", async () => {
    const v = await variant(3);
    const sku = (
      await h.db.productVariant.findUniqueOrThrow({ where: { id: v } })
    ).sku;
    const bySku = await h.get(
      `${A}?sku=${sku.toLowerCase()}`,
      as(AdminRole.OWNER),
    );
    expect(bySku.body.items.map((r: { sku: string }) => r.sku)).toEqual([sku]);
    const page1 = await h.get(`${A}?limit=2`, as(AdminRole.OWNER));
    expect(page1.body.items).toHaveLength(2);
    const page2 = await h.get(
      `${A}?limit=2&cursor=${page1.body.nextCursor}`,
      as(AdminRole.OWNER),
    );
    expect(page2.body.items[0].sku > page1.body.items[1].sku).toBe(true);
    expect(
      (await h.get(`${A}?sku=%25`, as(AdminRole.OWNER))).body.items,
    ).toEqual([]);
  });

  it("O M F adjust; C cannot; adjustments write one movement and an audit row", async () => {
    const v = await variant(0);
    const body = { type: "RECEIVED", delta: 12 };
    const refused = await h.post(
      `${A}/${v}/adjustments`,
      body,
      as(AdminRole.CATALOGUE_EDITOR),
    );
    expect(refused.status).toBe(403);
    for (const role of [
      AdminRole.OWNER,
      AdminRole.MANAGER,
      AdminRole.FULFILMENT,
    ]) {
      const r = await h.post(`${A}/${v}/adjustments`, body, as(role));
      expect(r.status, role).toBe(201);
    }
    expect(await level(v)).toMatchObject({ onHand: 36 });
    const movements = await h.db.stockMovement.findMany({
      where: { variantId: v },
    });
    expect(movements).toHaveLength(3);
    expect(
      movements.every(
        (m) => m.type === "RECEIVED" && m.onHandDelta === 12 && m.actorAdminId,
      ),
    ).toBe(true);
    const audit = await h.db.auditLog.findMany({
      where: { entityId: v, action: "inventory.adjusted" },
    });
    expect(audit).toHaveLength(3);
    expect(JSON.stringify(audit)).not.toContain("reason");
  });

  it("validates adjustments: types, reasons, signs and bounds", async () => {
    const v = await variant(5);
    const s = as(AdminRole.MANAGER);
    const bad = [
      { type: "RECEIVED", delta: -1 },
      { type: "ADJUSTMENT", delta: -1 },
      { type: "CORRECTION", delta: 2, reason: "ab" },
      { type: "ADJUSTMENT", delta: 0, reason: "TEST" },
      { type: "ADJUSTMENT", delta: 10_001, reason: "TEST" },
      { type: "ADJUSTMENT", delta: 1.5, reason: "TEST" },
      { type: "SHIPPED", delta: -1, reason: "TEST" },
      { type: "RECEIVED", delta: 1, extra: true },
    ];
    for (const b of bad)
      expect(
        (await h.post(`${A}/${v}/adjustments`, b, s)).status,
        JSON.stringify(b),
      ).toBe(400);
    const missing = await h.post(
      `${A}/0192f0e2-0000-7000-8000-000000000001/adjustments`,
      { type: "RECEIVED", delta: 1 },
      s,
    );
    expect(missing.status).toBe(404);
  });

  it("an adjustment below reserved is refused with 409 STOCK_BELOW_RESERVED (SR-12)", async () => {
    const v = await variant(5);
    await reserve(pool, [{ variantId: v, quantity: 4 }], TTL);
    const r = await h.post(
      `${A}/${v}/adjustments`,
      { type: "CORRECTION", delta: -2, reason: "TEST recount" },
      as(AdminRole.FULFILMENT),
    );
    expect(r.status).toBe(409);
    expect(r.body.error.details[0]).toMatchObject({
      code: "STOCK_BELOW_RESERVED",
      onHand: 5,
      reserved: 4,
    });
    const ok = await h.post(
      `${A}/${v}/adjustments`,
      { type: "CORRECTION", delta: -1, reason: "TEST recount" },
      as(AdminRole.FULFILMENT),
    );
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ onHand: 4, reserved: 4 });
  });

  it("sets the low-stock level (O M F, audited, no movement)", async () => {
    const v = await variant(5);
    expect(
      (
        await h.patch(
          `${A}/${v}`,
          { lowStockThreshold: 6 },
          as(AdminRole.CATALOGUE_EDITOR),
        )
      ).status,
    ).toBe(403);
    const r = await h.patch(
      `${A}/${v}`,
      { lowStockThreshold: 6 },
      as(AdminRole.FULFILMENT),
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ lowStockThreshold: 6 });
    expect(
      (
        await h.patch(
          `${A}/${v}`,
          { lowStockThreshold: 1001 },
          as(AdminRole.OWNER),
        )
      ).status,
    ).toBe(400);
    expect(
      await h.db.auditLog.count({
        where: { entityId: v, action: "inventory.threshold_set" },
      }),
    ).toBe(1);
    expect(await h.db.stockMovement.count({ where: { variantId: v } })).toBe(1); // the RECEIVED one only
    const lowOnly = await h.get(
      `${A}?lowStock=true&limit=100`,
      as(AdminRole.OWNER),
    );
    expect(
      lowOnly.body.items.map((x: { variantId: string }) => x.variantId),
    ).toContain(v);
  });

  it("movement history: O M F only, newest first, filters and paging, no emails", async () => {
    const v = await variant(5);
    await reserve(pool, [{ variantId: v, quantity: 1 }], TTL);
    expect(
      (await h.get(`${A}/movements`, as(AdminRole.CATALOGUE_EDITOR))).status,
    ).toBe(403);
    const r = await h.get(
      `${A}/movements?variantId=${v}`,
      as(AdminRole.FULFILMENT),
    );
    expect(r.status).toBe(200);
    expect(r.body.items.map((m: { type: string }) => m.type)).toEqual([
      "RESERVED",
      "RECEIVED",
    ]);
    expect(r.body.items[1].actorName).toMatch(/^TEST MANAGER/);
    expect(JSON.stringify(r.body)).not.toContain("@example.test");
    const typed = await h.get(
      `${A}/movements?variantId=${v}&type=RECEIVED`,
      as(AdminRole.OWNER),
    );
    expect(typed.body.items).toHaveLength(1);
    const paged = await h.get(
      `${A}/movements?variantId=${v}&limit=1`,
      as(AdminRole.OWNER),
    );
    const next = await h.get(
      `${A}/movements?variantId=${v}&limit=1&cursor=${paged.body.nextCursor}`,
      as(AdminRole.OWNER),
    );
    expect(next.body.items[0].type).toBe("RECEIVED");
    expect(
      (
        await h.get(
          `${A}/movements?from=2026-10-23T00:00:00Z&to=2026-10-22T00:00:00Z`,
          as(AdminRole.OWNER),
        )
      ).status,
    ).toBe(400);
  });

  it("state-changing routes need the session's CSRF token", async () => {
    const v = await variant(1);
    const s = as(AdminRole.OWNER);
    const r = await request(h.app)
      .post(`${A}/${v}/adjustments`)
      .set("Origin", ADMIN)
      .set("Cookie", s.cookie)
      .send({ type: "RECEIVED", delta: 1 });
    expect(r.status).toBe(403);
  });
});
