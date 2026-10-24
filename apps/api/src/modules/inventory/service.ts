// Stock service (system-design.md §2, D-105). The conditional UPDATE is the
// guard against overselling; the CHECK constraints on inventory_level are the
// last line of defence. Every change writes exactly one stock movement (SR-11).
import type { Prisma } from "../../generated/prisma/client.ts";

type Tx = Prisma.TransactionClient;

export type ReservationLine = {
  readonly variantId: string;
  readonly quantity: number;
};

export type Shortfall = {
  variantId: string;
  requested: number;
  available: number;
};

export class OutOfStock extends Error {
  readonly lines: Shortfall[];
  constructor(lines: Shortfall[]) {
    super("OUT_OF_STOCK");
    this.name = "OutOfStock";
    this.lines = lines;
  }
}

export class StockRuleViolation extends Error {
  readonly reason:
    "BELOW_RESERVED" | "NEGATIVE_ON_HAND" | "NOT_FOUND" | "INACTIVE";
  constructor(reason: StockRuleViolation["reason"]) {
    super(reason);
    this.name = "StockRuleViolation";
    this.reason = reason;
  }
}

/** Merges repeated variants and sorts by ID, so locks are taken in one order. */
export function normaliseLines(
  lines: readonly ReservationLine[],
): ReservationLine[] {
  const merged = new Map<string, number>();
  for (const l of lines)
    merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.quantity);
  return [...merged.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([variantId, quantity]) => ({ variantId, quantity }));
}

/**
 * Reserves every line or none (SR-4, SR-14). Lines are taken in variant-ID
 * order to avoid deadlocks; any short line rolls the transaction back and
 * reports each line's real availability. Run inside a transaction.
 */
export async function reserve(
  tx: Tx,
  lines: readonly ReservationLine[],
  options: { expiresAt: Date; now: Date; orderId?: string },
): Promise<{ reservationIds: string[] }> {
  const ordered = normaliseLines(lines);
  await releaseExpired(
    tx,
    options.now,
    ordered.map((l) => l.variantId),
  );
  const short: Shortfall[] = [];
  for (const line of ordered) {
    const updated = await tx.$executeRaw`
      UPDATE "inventory_level" i SET "reserved" = i."reserved" + ${line.quantity}, "version" = i."version" + 1
      FROM "product_variant" v
      WHERE i."variant_id" = ${line.variantId}::uuid AND v."id" = i."variant_id" AND v."is_active"
        AND i."on_hand" - i."reserved" >= ${line.quantity}`;
    if (updated === 0)
      short.push({
        variantId: line.variantId,
        requested: line.quantity,
        available: 0,
      });
  }
  if (short.length > 0) {
    // Report real availability; the caller's transaction is rolled back.
    const levels = await tx.inventoryLevel.findMany({
      where: {
        variantId: { in: short.map((s) => s.variantId) },
        variant: { isActive: true },
      },
    });
    for (const s of short) {
      const level = levels.find((l) => l.variantId === s.variantId);
      s.available = level ? Math.max(0, level.onHand - level.reserved) : 0;
    }
    throw new OutOfStock(short);
  }
  const reservationIds: string[] = [];
  for (const line of ordered) {
    const r = await tx.stockReservation.create({
      data: {
        variantId: line.variantId,
        quantity: line.quantity,
        expiresAt: options.expiresAt,
        createdAt: options.now,
        orderId: options.orderId ?? null,
      },
    });
    await tx.stockMovement.create({
      data: {
        variantId: line.variantId,
        type: "RESERVED",
        onHandDelta: 0,
        reservedDelta: line.quantity,
        referenceType: "RESERVATION",
        referenceId: r.id,
      },
    });
    reservationIds.push(r.id);
  }
  return { reservationIds };
}

/**
 * Returns held units to available stock (SR-8, SR-9): active holds, and with
 * `includeConverted`, order allocations that have not shipped.
 */
async function endReservations(
  tx: Tx,
  where: Prisma.StockReservationWhereInput,
  status: "RELEASED" | "EXPIRED",
  actorAdminId?: string,
  includeConverted = false,
) {
  const statuses: ("ACTIVE" | "CONVERTED")[] = includeConverted
    ? ["ACTIVE", "CONVERTED"]
    : ["ACTIVE"];
  // Lock the rows so a concurrent release cannot count them twice.
  const ids = (
    await tx.stockReservation.findMany({
      where: { ...where, status: { in: statuses } },
      select: { id: true },
      orderBy: { variantId: "asc" },
    })
  ).map((r) => r.id);
  if (ids.length === 0) return 0;
  const locked = await tx.$queryRaw<
    { id: string; variant_id: string; quantity: number }[]
  >`
    SELECT id::text, variant_id::text, quantity FROM "stock_reservation"
    WHERE id = ANY(${ids}::uuid[]) AND status::text = ANY(${statuses}::text[]) ORDER BY variant_id FOR UPDATE`;
  for (const r of locked) {
    await tx.$executeRaw`UPDATE "inventory_level" SET "reserved" = "reserved" - ${r.quantity}, "version" = "version" + 1 WHERE "variant_id" = ${r.variant_id}::uuid`;
    await tx.stockReservation.update({
      where: { id: r.id },
      data: { status, expiresAt: null },
    });
    await tx.stockMovement.create({
      data: {
        variantId: r.variant_id,
        type: "RELEASED",
        onHandDelta: 0,
        reservedDelta: -r.quantity,
        reason:
          status === "EXPIRED" ? "Reservation expired" : "Reservation released",
        referenceType: "RESERVATION",
        referenceId: r.id,
        actorAdminId: actorAdminId ?? null,
      },
    });
  }
  return locked.length;
}

export function release(
  tx: Tx,
  reservationIds: readonly string[],
  actorAdminId?: string,
) {
  return endReservations(
    tx,
    { id: { in: [...reservationIds] } },
    "RELEASED",
    actorAdminId,
  );
}

/** Order holds become allocations (SR-5, SR-6): `reserved` stays until dispatch. */
export async function convert(tx: Tx, orderId: string) {
  const { count } = await tx.stockReservation.updateMany({
    where: { orderId, status: "ACTIVE" },
    data: { status: "CONVERTED", expiresAt: null },
  });
  return count;
}

/** Cancellation before dispatch (SR-8): every hold and allocation of the order is released. */
export function releaseOrder(tx: Tx, orderId: string, actorAdminId?: string) {
  return endReservations(tx, { orderId }, "RELEASED", actorAdminId, true);
}

/**
 * Dispatch (SR-7): `onHand` and `reserved` both fall by each allocation. The
 * allocation is then closed (RELEASED) so a later cancel cannot release it
 * again; the SHIPPED movement records why.
 */
export async function shipOrder(
  tx: Tx,
  orderId: string,
  actorAdminId?: string,
) {
  const locked = await tx.$queryRaw<
    { id: string; variant_id: string; quantity: number }[]
  >`
    SELECT id::text, variant_id::text, quantity FROM "stock_reservation"
    WHERE order_id = ${orderId}::uuid AND status = 'CONVERTED' ORDER BY variant_id FOR UPDATE`;
  for (const r of locked) {
    await tx.$executeRaw`UPDATE "inventory_level" SET "on_hand" = "on_hand" - ${r.quantity}, "reserved" = "reserved" - ${r.quantity}, "version" = "version" + 1 WHERE "variant_id" = ${r.variant_id}::uuid`;
    await tx.stockReservation.update({
      where: { id: r.id },
      data: { status: "RELEASED" },
    });
    await tx.stockMovement.create({
      data: {
        variantId: r.variant_id,
        type: "SHIPPED",
        onHandDelta: -r.quantity,
        reservedDelta: -r.quantity,
        referenceType: "ORDER",
        referenceId: orderId,
        actorAdminId: actorAdminId ?? null,
      },
    });
  }
  return locked.length;
}

/** Expired holds go back to stock; with `variantIds`, only those variants (lazy release on read). */
export function releaseExpired(
  tx: Tx,
  now: Date,
  variantIds?: readonly string[],
) {
  return endReservations(
    tx,
    {
      expiresAt: { lte: now },
      ...(variantIds ? { variantId: { in: [...variantIds] } } : {}),
    },
    "EXPIRED",
  );
}

/**
 * Admin stock change (SR-12): `RECEIVED` for deliveries (positive), `ADJUSTMENT`
 * for counts and damage, `CORRECTION` for fixing mistakes; reason required for
 * the last two by CHECK. `onHand` can never go below `reserved`.
 */
export async function adjust(
  tx: Tx,
  input: {
    variantId: string;
    delta: number;
    type: "RECEIVED" | "ADJUSTMENT" | "CORRECTION";
    reason: string;
    actorAdminId: string;
  },
) {
  const [level] = await tx.$queryRaw<{ on_hand: number; reserved: number }[]>`
    SELECT on_hand, reserved FROM "inventory_level" WHERE variant_id = ${input.variantId}::uuid FOR UPDATE`;
  if (!level) throw new StockRuleViolation("NOT_FOUND");
  const onHand = level.on_hand + input.delta;
  if (onHand < 0) throw new StockRuleViolation("NEGATIVE_ON_HAND");
  if (onHand < level.reserved) throw new StockRuleViolation("BELOW_RESERVED");
  await tx.$executeRaw`UPDATE "inventory_level" SET "on_hand" = ${onHand}, "version" = "version" + 1 WHERE "variant_id" = ${input.variantId}::uuid`;
  const movement = await tx.stockMovement.create({
    data: {
      variantId: input.variantId,
      type: input.type,
      onHandDelta: input.delta,
      reason: input.reason,
      actorAdminId: input.actorAdminId,
    },
  });
  return {
    before: { onHand: level.on_hand, reserved: level.reserved },
    after: { onHand, reserved: level.reserved },
    movementId: movement.id,
  };
}
