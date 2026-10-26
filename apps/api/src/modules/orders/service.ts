// The order state machine (system-design.md §5). Every change goes through
// `transition`, which checks the allowed-transitions table, applies the stock
// effect and writes an OrderStatusEvent. Run inside a transaction.
import { AdminRole, OrderStatus, canTransition } from "@sanea/shared";

import { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../platform/http/errors.ts";
import { releaseOrder, shipOrder } from "../inventory/service.ts";

const { sql } = Prisma;
type Tx = Prisma.TransactionClient;

export type Actor =
  | { type: "SYSTEM" }
  | { type: "CUSTOMER" }
  | { type: "PROVIDER" }
  | { type: "ADMIN"; adminId: string; role: AdminRole };

export type ShipmentInput = {
  courierName: string;
  trackingNumber: string;
  trackingUrl?: string | undefined;
};

type LockedOrder = {
  id: string;
  status: OrderStatus;
  payment_method: "PREPAID" | "COD";
};

/** Locks the order row for the rest of the transaction. */
export async function lockOrder(tx: Tx, orderId: string) {
  const [row] = await tx.$queryRaw<LockedOrder[]>(sql`
    SELECT "id"::text AS "id", "status"::text AS "status", "payment_method"::text AS "payment_method"
    FROM "order" WHERE "id" = ${orderId}::uuid FOR UPDATE`);
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/**
 * Moves an order to `to`. Staff need the role the table gives; the system,
 * customer and provider actors are the system for the table. CANCELLED
 * releases every hold and allocation; SHIPPED needs a shipment and takes the
 * units out of stock. A COD order's payment follows delivery or refusal.
 */
export async function transition(
  tx: Tx,
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  options: { note?: string | undefined; shipment?: ShipmentInput; now: Date },
) {
  const order = await lockOrder(tx, orderId);
  const who = actor.type === "ADMIN" ? actor.role : "SYSTEM";
  if (!canTransition(order.status, to, who))
    throw new AppError("INVALID_TRANSITION", { from: order.status, to });
  const adminId = actor.type === "ADMIN" ? actor.adminId : undefined;

  if (to === "SHIPPED") {
    if (!options.shipment)
      throw new AppError("VALIDATION_FAILED", [
        { path: "body.shipment", code: "REQUIRED", message: "Required." },
      ]);
    await shipOrder(tx, orderId, adminId);
    await tx.shipment.create({
      data: { orderId, ...options.shipment, shippedAt: options.now },
    });
  }
  if (to === "CANCELLED") await releaseOrder(tx, orderId);
  if (to === "DELIVERED")
    await tx.shipment.updateMany({
      where: { orderId, deliveredAt: null },
      data: { deliveredAt: options.now },
    });
  if (order.payment_method === "COD") {
    const next =
      to === "DELIVERED"
        ? "COLLECTED"
        : to === "RETURN_TO_ORIGIN" || to === "CANCELLED"
          ? "NOT_COLLECTED"
          : null;
    if (next)
      await tx.payment.updateMany({
        where: { orderId, status: "PENDING" },
        data: { status: next },
      });
  }

  await tx.order.update({
    where: { id: orderId },
    data: {
      status: to,
      ...(to === "CONFIRMED" ? { confirmedAt: options.now } : {}),
      ...(to === "CANCELLED" ? { cancelledAt: options.now } : {}),
    },
  });
  await tx.orderStatusEvent.create({
    data: {
      orderId,
      fromStatus: order.status,
      toStatus: to,
      actorType: actor.type,
      actorId: adminId ?? null,
      note: options.note ?? null,
      createdAt: options.now,
    },
  });
  return { from: order.status, to };
}

/** Flags an order for staff (system-design.md §5: an exception flag, not a status). */
export function flagOrder(tx: Tx, orderId: string, reason: string) {
  return tx.order.update({
    where: { id: orderId },
    data: { needsAttention: true, attentionReason: reason },
  });
}
