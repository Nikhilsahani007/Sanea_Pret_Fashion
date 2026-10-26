// The order state machine (system-design.md §5). Every change goes through
// `transition`, which checks the allowed-transitions table, applies the stock
// effect and writes an OrderStatusEvent. Run inside a transaction.
import {
  AdminRole,
  ORDER_TRANSITIONS,
  OrderStatus,
  STAFF_CANCEL_REASONS,
  can,
  canTransition,
  type CancelReason,
} from "@sanea/shared";

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
 * releases every hold and allocation and needs a reason (D-181): staff use
 * the staff codes, `OTHER` with a note; declining an unconfirmed COD order
 * needs `orders.declineCod`, cancelling a confirmed or packed one
 * `orders.cancelRefund` (403 otherwise). SHIPPED needs a shipment and takes
 * the units out of stock. A COD order's payment follows delivery or refusal.
 */
export async function transition(
  tx: Tx,
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  options: {
    note?: string | undefined;
    reason?: CancelReason | undefined;
    shipment?: ShipmentInput;
    now: Date;
  },
) {
  const order = await lockOrder(tx, orderId);
  const move = ORDER_TRANSITIONS.find(
    (t) => t.from === order.status && t.to === to,
  );
  // A listed move this role's permission does not cover is forbidden; a move
  // that does not exist from this status (for example cancelling after
  // dispatch) is an invalid transition for everyone.
  if (
    move?.permission &&
    actor.type === "ADMIN" &&
    !can(actor.role, move.permission)
  )
    throw new AppError("FORBIDDEN");
  const who = actor.type === "ADMIN" ? actor.role : "SYSTEM";
  if (!canTransition(order.status, to, who))
    throw new AppError("INVALID_TRANSITION", { from: order.status, to });
  const adminId = actor.type === "ADMIN" ? actor.adminId : undefined;
  checkReason(to, actor, options.reason, options.note);

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
      reason: options.reason ?? null,
      createdAt: options.now,
    },
  });
  return { from: order.status, to };
}

/** Cancellations need a reason; `OTHER` a note; staff only the staff codes. */
function checkReason(
  to: OrderStatus,
  actor: Actor,
  reason: CancelReason | undefined,
  note: string | undefined,
) {
  const problem = (path: string, code: string, message: string) =>
    new AppError("VALIDATION_FAILED", [{ path, code, message }]);
  if (to !== "CANCELLED") {
    if (reason)
      throw problem(
        "body.reason",
        "INVALID",
        "Only cancellations take a reason.",
      );
    return;
  }
  if (!reason)
    throw problem(
      "body.reason",
      "REQUIRED",
      "Choose why the order is cancelled.",
    );
  if (
    actor.type === "ADMIN" &&
    !(STAFF_CANCEL_REASONS as readonly string[]).includes(reason)
  )
    throw problem(
      "body.reason",
      "INVALID",
      "Choose one of the listed reasons.",
    );
  if (reason === "OTHER" && !note?.trim())
    throw problem("body.note", "REQUIRED", "Describe the reason in the note.");
}

/** Flags an order for staff (system-design.md §5: an exception flag, not a status). */
export function flagOrder(tx: Tx, orderId: string, reason: string) {
  return tx.order.update({
    where: { id: orderId },
    data: { needsAttention: true, attentionReason: reason },
  });
}
