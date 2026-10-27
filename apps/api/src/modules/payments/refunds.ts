// Refunds (UF-7; Phase 18). Staff record a refund; how it is paid depends on
// the provider. With the mock, staff pay it outside the system and mark the
// outcome. With a gateway (PhonePe, D-195) the order job sends every pending
// prepaid refund to the gateway and settles it from the gateway's answer, a
// refund webhook or a status check. The refund row ID is the gateway's refund
// ID, so sending it twice is one refund.
import type { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { lockOrder } from "../orders/service.ts";
import type { PaymentProvider } from "./provider.ts";

type Tx = Prisma.TransactionClient;

/**
 * Records a refund's final outcome and the payment status that follows.
 * Returns false when the refund was already settled. Lock the order first.
 */
export async function settleRefund(
  tx: Tx,
  refundId: string,
  outcome: "REFUNDED" | "FAILED",
  reference: string | null,
): Promise<boolean> {
  const r = await tx.refund.findUniqueOrThrow({
    where: { id: refundId },
    include: { payment: { include: { refunds: true } } },
  });
  if (r.status !== "PENDING") return false;
  await tx.refund.update({
    where: { id: r.id },
    data: { status: outcome, providerRefundId: reference },
  });
  const others = r.payment.refunds.filter((x) => x.id !== r.id);
  const pending = others.some((x) => x.status === "PENDING");
  const refunded =
    others
      .filter((x) => x.status === "REFUNDED")
      .reduce((n, x) => n + x.amountPaise, 0) +
    (outcome === "REFUNDED" ? r.amountPaise : 0);
  const status = pending
    ? "REFUND_PENDING"
    : outcome === "FAILED" && refunded === 0
      ? "REFUND_FAILED"
      : refunded >= r.payment.amountPaise
        ? "REFUNDED"
        : r.payment.method === "COD"
          ? "COLLECTED"
          : "CAPTURED";
  await tx.payment.update({ where: { id: r.paymentId }, data: { status } });
  return true;
}

/** True when this refund is paid through the gateway, not by staff. */
export function isGatewayRefund(
  provider: PaymentProvider | null,
  payment: { method: string; provider: string },
): boolean {
  return (
    !!provider?.gatewayRefunds &&
    payment.method === "PREPAID" &&
    payment.provider === provider.name
  );
}

/**
 * The order job's refund step: sends pending gateway refunds and settles
 * those the gateway has finished. Errors leave the refund pending for the
 * next run. Returns the IDs of refunds that settled.
 */
export async function processGatewayRefunds(
  db: Db,
  provider: PaymentProvider,
  logger: { error: (o: object, m: string) => void },
): Promise<string[]> {
  if (!provider.gatewayRefunds) return [];
  const pending = await db.refund.findMany({
    where: {
      status: "PENDING",
      payment: {
        provider: provider.name,
        method: "PREPAID",
        providerPaymentId: { not: null },
      },
    },
    include: { payment: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const settled: string[] = [];
  for (const r of pending) {
    try {
      let status: "PENDING" | "REFUNDED" | "FAILED" | "NOT_FOUND" =
        r.providerRefundId
          ? await provider.fetchRefundStatus(r.id)
          : "NOT_FOUND";
      if (status === "NOT_FOUND") {
        // Marked sent first, so a crash after the request is found by the
        // status check instead of being forgotten.
        await db.refund.update({
          where: { id: r.id },
          data: { providerRefundId: r.id },
        });
        status = (
          await provider.refund({
            providerPaymentId: r.payment.providerPaymentId!,
            refundId: r.id,
            amountPaise: r.amountPaise,
            reason: r.reason,
          })
        ).status;
      }
      if (status === "PENDING") continue;
      const done = await db.$transaction(async (tx) => {
        await lockOrder(tx, r.payment.orderId);
        return settleRefund(tx, r.id, status, r.id);
      });
      if (done) settled.push(r.id);
    } catch (err) {
      logger.error({ err, refundId: r.id }, "gateway refund not processed");
    }
  }
  return settled;
}
