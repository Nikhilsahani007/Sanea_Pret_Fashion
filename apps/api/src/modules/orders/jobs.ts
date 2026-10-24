// In-process order jobs, every minute (one API instance; see inventory/jobs.ts):
// prepaid orders whose hold lapsed are cancelled, unconfirmed COD orders are
// cancelled after the configured window (OD-07), and payments stuck in
// CREATED are reconciled with the provider (system-design.md §6.3).
import { readSettings } from "../checkout/settings.ts";
import type { ModuleDeps } from "../deps.ts";
import { reconcile } from "../payments/service.ts";
import { lockOrder, transition } from "./service.ts";

/** Cancels PENDING_PAYMENT orders with no live hold left. Returns the count. */
export async function expireUnpaidOrders(deps: ModuleDeps): Promise<number> {
  const now = deps.now();
  const candidates = await deps.db.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      reservations: { none: { status: "ACTIVE", expiresAt: { gt: now } } },
    },
    select: { id: true },
    take: 100,
  });
  let n = 0;
  for (const { id } of candidates) {
    const done = await deps.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== "PENDING_PAYMENT") return false;
      const live = await tx.stockReservation.count({
        where: { orderId: id, status: "ACTIVE", expiresAt: { gt: now } },
      });
      if (live > 0) return false;
      await tx.payment.updateMany({
        where: { orderId: id, status: "CREATED" },
        data: { status: "EXPIRED" },
      });
      await transition(
        tx,
        id,
        "CANCELLED",
        { type: "SYSTEM" },
        {
          note: "Payment not completed before the hold expired",
          now,
        },
      );
      return true;
    });
    if (done) n++;
  }
  return n;
}

/** Cancels COD orders not confirmed within the window; their stock returns. */
export async function expireUnconfirmedCod(deps: ModuleDeps): Promise<number> {
  const now = deps.now();
  const { confirmWithinHours } = await readSettings(deps.db, "cod");
  const before = new Date(now.getTime() - confirmWithinHours * 3_600_000);
  const stale = await deps.db.order.findMany({
    where: { status: "PENDING_CONFIRMATION", placedAt: { lte: before } },
    select: { id: true },
    take: 100,
  });
  let n = 0;
  for (const { id } of stale) {
    const done = await deps.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== "PENDING_CONFIRMATION") return false;
      await transition(
        tx,
        id,
        "CANCELLED",
        { type: "SYSTEM" },
        {
          note: `Not confirmed within ${confirmWithinHours} hours`,
          now,
        },
      );
      return true;
    });
    if (done) n++;
  }
  return n;
}

export async function runOrderJobs(deps: ModuleDeps) {
  const unpaid = await expireUnpaidOrders(deps);
  const cod = await expireUnconfirmedCod(deps);
  const reconciled = deps.payments
    ? await reconcile(deps.db, deps.payments, deps.now())
    : 0;
  return { unpaid, cod, reconciled };
}

export function startOrderJobs(deps: ModuleDeps, everyMs = 60_000): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    runOrderJobs(deps)
      .then((r) => {
        if (r.unpaid + r.cod + r.reconciled > 0)
          deps.logger.info(r, "order jobs ran");
      })
      .catch((err: unknown) => deps.logger.error({ err }, "order jobs failed"))
      .finally(() => {
        running = false;
      });
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
