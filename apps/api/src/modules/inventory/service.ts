// Inventory: reservations, their release and expiry, and admin adjustments
// (system-design.md §2, SR-1 to SR-14; phase-9-plan.md §3, D-090).
//
// Invariants:
// - Available stock is on hand minus reserved; the database CHECKs
//   `on_hand >= 0` and `0 <= reserved <= on_hand` are the final guard against
//   overselling (D-105), whatever this code does.
// - Every change to on hand or reserved writes exactly one stock_movement row
//   per variant and cause (SR-11); movements are append-only (D-057).
// - Lock order, everywhere: stock_reservation rows first, then inventory_level
//   rows sorted by variant ID. Concurrent reservations, releases and the expiry
//   job therefore cannot deadlock.
// - Times come from the database clock (`now()`), never from the API host.
import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { AppError } from "../../platform/http/errors.ts";
import { recordAudit } from "../audit/record.ts";

const { sql } = Prisma;
type Tx = Prisma.TransactionClient;

/** Short transactions; generous waits so a burst queues instead of failing. */
const TX = { maxWait: 15_000, timeout: 15_000 } as const;

export type Line = { variantId: string; quantity: number };

export type ReservationHeld = {
  id: string;
  variantId: string;
  quantity: number;
  expiresAt: Date;
};

/** Merges repeated variants and sorts by variant ID: the global lock order. */
export function mergeLines(lines: readonly Line[]): Line[] {
  const totals = new Map<string, number>();
  for (const { variantId, quantity } of lines) {
    const id = variantId.toLowerCase();
    totals.set(id, (totals.get(id) ?? 0) + quantity);
  }
  return [...totals]
    .map(([variantId, quantity]) => ({ variantId, quantity }))
    .sort((a, b) =>
      a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0,
    );
}

type Held = { id: string; variant_id: string; quantity: number };

/**
 * Ends reservations already locked by the caller: status, `reserved`, and one
 * RELEASED movement each. Inventory rows are updated in variant order.
 */
async function settle(
  tx: Tx,
  rows: readonly Held[],
  status: "RELEASED" | "EXPIRED",
) {
  if (rows.length === 0) return;
  const byVariant = new Map<string, number>();
  for (const r of rows)
    byVariant.set(
      r.variant_id,
      (byVariant.get(r.variant_id) ?? 0) + r.quantity,
    );
  for (const variantId of [...byVariant.keys()].sort()) {
    await tx.$executeRaw(sql`
      UPDATE "inventory_level"
      SET "reserved" = "reserved" - ${byVariant.get(variantId)!}, "version" = "version" + 1, "updated_at" = now()
      WHERE "variant_id" = ${variantId}::uuid`);
  }
  await tx.$executeRaw(sql`
    UPDATE "stock_reservation" SET "status" = ${status}::"reservation_status", "updated_at" = now()
    WHERE "id" = ANY(${rows.map((r) => r.id)}::uuid[])`);
  await tx.stockMovement.createMany({
    data: rows.map((r) => ({
      variantId: r.variant_id,
      type: "RELEASED" as const,
      onHandDelta: 0,
      reservedDelta: -r.quantity,
      referenceType: "RESERVATION" as const,
      referenceId: r.id,
    })),
  });
}

/** Lazy release (SR-9): due reservations of these variants, skipping any the job holds. */
async function expireDueFor(tx: Tx, variantIds: readonly string[]) {
  const due = await tx.$queryRaw<Held[]>(sql`
    SELECT "id", "variant_id"::text AS "variant_id", "quantity" FROM "stock_reservation"
    WHERE "status" = 'ACTIVE' AND "expires_at" <= now() AND "variant_id" = ANY(${[...variantIds]}::uuid[])
    ORDER BY "variant_id", "id"
    FOR UPDATE SKIP LOCKED`);
  await settle(tx, due, "EXPIRED");
}

/** Current availability (on hand minus reserved; 0 if not reservable, SR-14). */
export async function availabilityOf(
  db: Db | Tx,
  variantIds: readonly string[],
): Promise<Map<string, number>> {
  const rows = await db.$queryRaw<{ id: string; available: number }[]>(sql`
    SELECT v."id"::text AS "id",
      CASE WHEN v."is_active" AND p."status" = 'PUBLISHED'
        THEN GREATEST(il."on_hand" - il."reserved", 0) ELSE 0 END AS "available"
    FROM "product_variant" v
    JOIN "product" p ON p."id" = v."product_id"
    JOIN "inventory_level" il ON il."variant_id" = v."id"
    WHERE v."id" = ANY(${[...variantIds]}::uuid[])`);
  return new Map(rows.map((r) => [r.id, Number(r.available)]));
}

/** A line could not be held; the transaction rolls back (SR-4). */
export class OutOfStock extends Error {
  constructor() {
    super("OUT_OF_STOCK");
    this.name = "OutOfStock";
  }
}

/**
 * Reserves every line or none, inside the caller's transaction (SR-3, SR-4,
 * SR-14), so checkout can hold stock and create the order atomically. Throws
 * OutOfStock when a line is short; the caller rolls back and reports with
 * `outOfStock`. `orderId` ties the holds to an order (Phase 15).
 */
export async function reserveIn(
  tx: Tx,
  lines: readonly Line[],
  { ttlMinutes, orderId }: { ttlMinutes: number; orderId?: string },
): Promise<ReservationHeld[]> {
  const merged = mergeLines(lines);
  if (merged.length === 0) return [];
  const ids = merged.map((l) => l.variantId);
  await expireDueFor(tx, ids);
  const reservable = new Set(
    (
      await tx.$queryRaw<{ id: string }[]>(sql`
        SELECT v."id"::text AS "id" FROM "product_variant" v JOIN "product" p ON p."id" = v."product_id"
        WHERE v."id" = ANY(${ids}::uuid[]) AND v."is_active" AND p."status" = 'PUBLISHED'`)
    ).map((r) => r.id),
  );
  for (const line of merged) {
    if (!reservable.has(line.variantId)) throw new OutOfStock();
    // The conditional update (system-design.md §2.2): it takes the row lock
    // and re-checks availability under it, so the last unit goes once.
    const updated = await tx.$executeRaw(sql`
      UPDATE "inventory_level"
      SET "reserved" = "reserved" + ${line.quantity}, "version" = "version" + 1, "updated_at" = now()
      WHERE "variant_id" = ${line.variantId}::uuid AND "on_hand" - "reserved" >= ${line.quantity}`);
    if (updated === 0) throw new OutOfStock();
  }
  const held: ReservationHeld[] = [];
  for (const line of merged) {
    const [row] = await tx.$queryRaw<{ id: string; expires_at: Date }[]>(sql`
      INSERT INTO "stock_reservation" ("variant_id", "quantity", "status", "expires_at", "order_id", "updated_at")
      VALUES (${line.variantId}::uuid, ${line.quantity}, 'ACTIVE', now() + make_interval(mins => ${ttlMinutes}), ${orderId ?? null}::uuid, now())
      RETURNING "id"::text AS "id", "expires_at"`);
    held.push({
      id: row!.id,
      variantId: line.variantId,
      quantity: line.quantity,
      expiresAt: row!.expires_at,
    });
  }
  await tx.stockMovement.createMany({
    data: held.map((h) => ({
      variantId: h.variantId,
      type: "RESERVED" as const,
      onHandDelta: 0,
      reservedDelta: h.quantity,
      referenceType: "RESERVATION" as const,
      referenceId: h.id,
    })),
  });
  return held;
}

/** `409 OUT_OF_STOCK` listing each line's real availability now (after rollback). */
export async function outOfStock(
  db: Db,
  lines: readonly Line[],
): Promise<AppError> {
  const merged = mergeLines(lines);
  const available = await availabilityOf(
    db,
    merged.map((l) => l.variantId),
  );
  return new AppError(
    "OUT_OF_STOCK",
    merged.map((l) => ({
      variantId: l.variantId,
      requested: l.quantity,
      available: available.get(l.variantId) ?? 0,
    })),
  );
}

/**
 * Reserves every line or none in its own transaction (system-design.md
 * §2.2). Returns one held reservation per variant; on failure throws 409
 * OUT_OF_STOCK listing each line's real availability.
 */
export async function reserve(
  db: Db,
  lines: readonly Line[],
  { ttlMinutes }: { ttlMinutes: number },
): Promise<ReservationHeld[]> {
  try {
    return await db.$transaction(
      (tx) => reserveIn(tx, lines, { ttlMinutes }),
      TX,
    );
  } catch (error) {
    if (!(error instanceof OutOfStock)) throw error;
    throw await outOfStock(db, lines);
  }
}

/**
 * An order's holds become allocations (SR-5, SR-6): they stop expiring and
 * `reserved` stays until dispatch or cancellation.
 */
export async function convert(tx: Tx, orderId: string): Promise<number> {
  return tx.$executeRaw(sql`
    UPDATE "stock_reservation" SET "status" = 'CONVERTED', "expires_at" = NULL, "updated_at" = now()
    WHERE "order_id" = ${orderId}::uuid AND "status" = 'ACTIVE'`);
}

/** Cancellation before dispatch (SR-8): every hold and allocation of the order goes back to stock. */
export async function releaseOrder(tx: Tx, orderId: string): Promise<number> {
  const rows = await tx.$queryRaw<Held[]>(sql`
    SELECT "id", "variant_id"::text AS "variant_id", "quantity" FROM "stock_reservation"
    WHERE "order_id" = ${orderId}::uuid AND "status" IN ('ACTIVE', 'CONVERTED')
    ORDER BY "variant_id", "id"
    FOR UPDATE`);
  await settle(tx, rows, "RELEASED");
  return rows.length;
}

/**
 * Dispatch (SR-7): on hand and reserved both fall by each allocation, which
 * is then closed (RELEASED) so a later cancel cannot release it again. One
 * SHIPPED movement per variant records why.
 */
export async function shipOrder(
  tx: Tx,
  orderId: string,
  actorAdminId?: string,
): Promise<number> {
  const rows = await tx.$queryRaw<Held[]>(sql`
    SELECT "id", "variant_id"::text AS "variant_id", "quantity" FROM "stock_reservation"
    WHERE "order_id" = ${orderId}::uuid AND "status" = 'CONVERTED'
    ORDER BY "variant_id", "id"
    FOR UPDATE`);
  for (const r of rows) {
    await tx.$executeRaw(sql`
      UPDATE "inventory_level"
      SET "on_hand" = "on_hand" - ${r.quantity}, "reserved" = "reserved" - ${r.quantity}, "version" = "version" + 1, "updated_at" = now()
      WHERE "variant_id" = ${r.variant_id}::uuid`);
  }
  if (rows.length === 0) return 0;
  await tx.$executeRaw(sql`
    UPDATE "stock_reservation" SET "status" = 'RELEASED', "updated_at" = now()
    WHERE "id" = ANY(${rows.map((r) => r.id)}::uuid[])`);
  await tx.stockMovement.createMany({
    data: rows.map((r) => ({
      variantId: r.variant_id,
      type: "SHIPPED" as const,
      onHandDelta: -r.quantity,
      reservedDelta: -r.quantity,
      referenceType: "ORDER" as const,
      referenceId: orderId,
      actorAdminId: actorAdminId ?? null,
    })),
  });
  return rows.length;
}

/** Releases active reservations (checkout abandoned, order cancelled). Idempotent. */
export async function release(
  db: Db,
  reservationIds: readonly string[],
): Promise<number> {
  if (reservationIds.length === 0) return 0;
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Held[]>(sql`
      SELECT "id", "variant_id"::text AS "variant_id", "quantity" FROM "stock_reservation"
      WHERE "id" = ANY(${[...reservationIds]}::uuid[]) AND "status" = 'ACTIVE'
      ORDER BY "variant_id", "id"
      FOR UPDATE`);
    await settle(tx, rows, "RELEASED");
    return rows.length;
  }, TX);
}

/**
 * The expiry job's work (SR-9): claims due reservations with SKIP LOCKED, so
 * several API processes can run it at once, and expires each exactly once.
 */
export async function expireDue(db: Db, batch = 200): Promise<number> {
  let total = 0;
  for (let round = 0; round < 50; round += 1) {
    const n = await db.$transaction(async (tx) => {
      const due = await tx.$queryRaw<Held[]>(sql`
        SELECT "id", "variant_id"::text AS "variant_id", "quantity" FROM "stock_reservation"
        WHERE "status" = 'ACTIVE' AND "expires_at" <= now()
        ORDER BY "variant_id", "id"
        LIMIT ${batch}
        FOR UPDATE SKIP LOCKED`);
      await settle(tx, due, "EXPIRED");
      return due.length;
    }, TX);
    total += n;
    if (n < batch) break;
  }
  return total;
}

export type AdjustmentType = "RECEIVED" | "ADJUSTMENT" | "CORRECTION";

type Level = { onHand: number; reserved: number; lowStockThreshold: number };

/**
 * An admin stock change (SR-11, SR-12, Q9-2): on hand moves by `delta` but
 * never below what is reserved. One movement and one audit row.
 */
export async function adjust(
  db: Db,
  input: {
    variantId: string;
    type: AdjustmentType;
    delta: number;
    reason: string | null;
    actorAdminId: string;
    ip: string | undefined;
    ipHashKey: string;
  },
): Promise<Level> {
  return db.$transaction(async (tx) => {
    const [after] = await tx.$queryRaw<
      { on_hand: number; reserved: number; low_stock_threshold: number }[]
    >(sql`
      UPDATE "inventory_level"
      SET "on_hand" = "on_hand" + ${input.delta}, "version" = "version" + 1, "updated_at" = now()
      WHERE "variant_id" = ${input.variantId}::uuid AND "on_hand" + ${input.delta} >= "reserved"
      RETURNING "on_hand", "reserved", "low_stock_threshold"`);
    if (!after) {
      const [current] = await tx.$queryRaw<
        { on_hand: number; reserved: number }[]
      >(sql`
        SELECT "on_hand", "reserved" FROM "inventory_level" WHERE "variant_id" = ${input.variantId}::uuid`);
      if (!current) throw new AppError("NOT_FOUND");
      throw new AppError("CONFLICT", [
        {
          path: "body.delta",
          code: "STOCK_BELOW_RESERVED",
          message: `On hand cannot go below the ${current.reserved} units reserved for customers.`,
          onHand: current.on_hand,
          reserved: current.reserved,
        },
      ]);
    }
    await tx.stockMovement.create({
      data: {
        variantId: input.variantId,
        type: input.type,
        onHandDelta: input.delta,
        reservedDelta: 0,
        reason: input.reason,
        referenceType: "ADMIN",
        referenceId: input.actorAdminId,
        actorAdminId: input.actorAdminId,
      },
    });
    // No free-text reason in the audit log (security-design.md §9).
    await recordAudit(tx, input.ipHashKey, {
      actorAdminId: input.actorAdminId,
      action: "inventory.adjusted",
      entityType: "inventory_level",
      entityId: input.variantId,
      before: { onHand: after.on_hand - input.delta },
      after: { onHand: after.on_hand, type: input.type, delta: input.delta },
      ip: input.ip,
    });
    return {
      onHand: after.on_hand,
      reserved: after.reserved,
      lowStockThreshold: after.low_stock_threshold,
    };
  }, TX);
}

/** The low-stock level (Q9-4): audited, no movement (not a stock change). */
export async function setThreshold(
  db: Db,
  input: {
    variantId: string;
    lowStockThreshold: number;
    actorAdminId: string;
    ip: string | undefined;
    ipHashKey: string;
  },
): Promise<Level> {
  return db.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<{ low_stock_threshold: number }[]>(sql`
      SELECT "low_stock_threshold" FROM "inventory_level" WHERE "variant_id" = ${input.variantId}::uuid FOR UPDATE`);
    if (!before) throw new AppError("NOT_FOUND");
    const row = await tx.inventoryLevel.update({
      where: { variantId: input.variantId },
      data: {
        lowStockThreshold: input.lowStockThreshold,
        version: { increment: 1 },
      },
    });
    await recordAudit(tx, input.ipHashKey, {
      actorAdminId: input.actorAdminId,
      action: "inventory.threshold_set",
      entityType: "inventory_level",
      entityId: input.variantId,
      before: { lowStockThreshold: before.low_stock_threshold },
      after: { lowStockThreshold: row.lowStockThreshold },
      ip: input.ip,
    });
    return {
      onHand: row.onHand,
      reserved: row.reserved,
      lowStockThreshold: row.lowStockThreshold,
    };
  }, TX);
}
