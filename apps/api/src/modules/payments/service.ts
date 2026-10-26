// The webhook pipeline (system-design.md §6.3): verify, store the raw event
// once per provider event ID, then apply it in one transaction with the order
// row locked. A browser redirect never confirms an order; only this does.
import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { OutOfStock, convert, reserveIn } from "../inventory/service.ts";
import { flagOrder, lockOrder, transition } from "../orders/service.ts";
import type { PaymentProvider, WebhookEvent } from "./provider.ts";

const { sql } = Prisma;
type Tx = Prisma.TransactionClient;

export type Outcome =
  | "CONFIRMED"
  | "FAILED"
  | "ALREADY_APPLIED"
  | "AMOUNT_MISMATCH"
  | "UNKNOWN_PAYMENT"
  | "PAID_AFTER_CANCEL"
  | "PAID_NO_STOCK";

/** How long a re-made hold lasts (SR-3, SR-10); from RESERVATION_TTL_MINUTES. */
export type HoldOptions = { readonly ttlMinutes: number };

/** Stores the event; returns null when this provider event was already received. */
export async function storeEvent(
  db: Db,
  provider: string,
  event: WebhookEvent,
  now: Date,
): Promise<string | null> {
  try {
    const row = await db.paymentEvent.create({
      data: {
        provider,
        providerEventId: event.providerEventId,
        type: event.type,
        rawPayload: event.payload as Prisma.InputJsonValue,
        receivedAt: now,
      },
    });
    return row.id;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return null;
    throw error;
  }
}

/** Applies a stored event exactly once and records the outcome on it. */
export async function processEvent(
  db: Db,
  provider: PaymentProvider,
  eventRowId: string,
  event: WebhookEvent,
  now: Date,
  hold: HoldOptions,
): Promise<Outcome> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: {
        provider_providerPaymentId: {
          provider: provider.name,
          providerPaymentId: event.providerPaymentId,
        },
      },
    });
    const outcome = payment
      ? await apply(tx, payment, event, now, hold)
      : ("UNKNOWN_PAYMENT" as const);
    await tx.paymentEvent.update({
      where: { id: eventRowId },
      data: { paymentId: payment?.id ?? null, processedAt: now, outcome },
    });
    return outcome;
  });
}

async function apply(
  tx: Tx,
  payment: { id: string; orderId: string; amountPaise: number },
  event: Pick<
    WebhookEvent,
    "type" | "amountPaise" | "currency" | "failureCode" | "failureMessage"
  >,
  now: Date,
  hold: HoldOptions,
): Promise<Outcome> {
  const order = await lockOrder(tx, payment.orderId);
  // Re-read under the order lock: a concurrent event may have applied first.
  const current = await tx.payment.findUniqueOrThrow({
    where: { id: payment.id },
  });
  if (["CAPTURED", "REFUND_PENDING", "REFUNDED"].includes(current.status))
    return "ALREADY_APPLIED";

  if (event.type === "payment.failed") {
    if (current.status !== "CREATED" && current.status !== "AUTHORISED")
      return "ALREADY_APPLIED";
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        failureCode: event.failureCode ?? "FAILED",
        failureMessage: event.failureMessage ?? null,
      },
    });
    // The order waits for a retry until its hold expires (E2E-3).
    return "FAILED";
  }

  // Amount and currency must match the stored payment (§6.3).
  if (event.amountPaise !== payment.amountPaise || event.currency !== "INR") {
    await flagOrder(tx, payment.orderId, "AMOUNT_MISMATCH");
    return "AMOUNT_MISMATCH";
  }

  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "CAPTURED", failureCode: null, failureMessage: null },
  });

  if (order.status !== "PENDING_PAYMENT") {
    // Paid after the order was cancelled (hold expired): never confirm it.
    await refundAutomatically(
      tx,
      payment,
      "Paid after the order was cancelled",
    );
    await flagOrder(tx, payment.orderId, "PAID_AFTER_CANCEL");
    return "PAID_AFTER_CANCEL";
  }

  // Live holds by the database clock, like the expiry job (Phase 9).
  const [live] = await tx.$queryRaw<{ held: number }[]>(sql`
    SELECT COALESCE(sum("quantity"), 0)::int AS "held" FROM "stock_reservation"
    WHERE "order_id" = ${payment.orderId}::uuid AND "status" = 'ACTIVE' AND "expires_at" > now()`);
  const items = await tx.orderItem.findMany({
    where: { orderId: payment.orderId },
  });
  const held = live?.held ?? 0;
  const wanted = items.reduce((n, i) => n + i.quantity, 0);
  if (held !== wanted) {
    // SR-10: the hold lapsed. Try again; if stock is gone, refund and flag.
    try {
      // The lapsed holds go back to stock first, then the order is held again.
      await tx.$executeRaw`SAVEPOINT rereserve`;
      await tx.$executeRaw(sql`
        UPDATE "stock_reservation" SET "expires_at" = least("expires_at", now()), "updated_at" = now()
        WHERE "order_id" = ${payment.orderId}::uuid AND "status" = 'ACTIVE'`);
      await reserveIn(
        tx,
        items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        { ttlMinutes: hold.ttlMinutes, orderId: payment.orderId },
      );
      await tx.$executeRaw`RELEASE SAVEPOINT rereserve`;
    } catch (error) {
      if (!(error instanceof OutOfStock)) throw error;
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT rereserve`;
      await refundAutomatically(
        tx,
        payment,
        "Paid after the stock hold expired; stock no longer available",
      );
      await flagOrder(tx, payment.orderId, "PAID_NO_STOCK");
      await transition(
        tx,
        payment.orderId,
        "CANCELLED",
        { type: "SYSTEM" },
        {
          note: "Paid after the hold expired and stock was gone; refund recorded",
          now,
        },
      );
      return "PAID_NO_STOCK";
    }
  }
  await convert(tx, payment.orderId);
  await transition(
    tx,
    payment.orderId,
    "CONFIRMED",
    { type: "PROVIDER" },
    {
      note: "Payment captured",
      now,
    },
  );
  return "CONFIRMED";
}

/** SR-10: a refund record the system creates itself; staff complete it (Phase 16). */
async function refundAutomatically(
  tx: Tx,
  payment: { id: string; amountPaise: number },
  reason: string,
) {
  await tx.payment.update({
    where: { id: payment.id },
    data: { status: "REFUND_PENDING" },
  });
  await tx.refund.create({
    data: {
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      reason,
      status: "PENDING",
    },
  });
}

/**
 * Reconciliation (§6.3): asks the provider about prepaid payments stuck in
 * CREATED for over 30 minutes and applies what it reports, as if an event had
 * arrived. Returns how many payments changed.
 */
export async function reconcile(
  db: Db,
  provider: PaymentProvider,
  now: Date,
  hold: HoldOptions,
): Promise<number> {
  const stuck = await db.payment.findMany({
    where: {
      provider: provider.name,
      status: "CREATED",
      providerPaymentId: { not: null },
      createdAt: { lte: new Date(now.getTime() - 30 * 60 * 1000) },
    },
    take: 100,
  });
  let changed = 0;
  for (const p of stuck) {
    const status = await provider.fetchStatus(p.providerPaymentId!);
    if (status !== "CAPTURED" && status !== "FAILED") continue;
    const outcome = await db.$transaction((tx) =>
      apply(
        tx,
        p,
        {
          type: status === "CAPTURED" ? "payment.captured" : "payment.failed",
          amountPaise: p.amountPaise,
          currency: "INR",
          failureCode: "RECONCILED_FAILED",
        },
        now,
        hold,
      ),
    );
    if (outcome !== "ALREADY_APPLIED") changed++;
  }
  return changed;
}
