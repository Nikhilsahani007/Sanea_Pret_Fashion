// In-process order jobs, every minute (one API instance; see inventory/job.ts):
// prepaid orders whose hold lapsed are cancelled, unconfirmed COD orders are
// cancelled after the configured window (OD-07), payments stuck in CREATED
// are reconciled with the provider (system-design.md §6.3), and pending
// gateway refunds are sent and settled (Phase 18).
import type { Logger } from "pino";

import { Prisma } from "../../generated/prisma/client.ts";
import type { CheckoutDeps } from "../checkout/deps.ts";
import { readSettings } from "../checkout/settings.ts";
import { emailForOutcome, notify } from "../notifications/service.ts";
import { processGatewayRefunds } from "../payments/refunds.ts";
import { reconcile } from "../payments/service.ts";
import { lockOrder, transition } from "./service.ts";

const { sql } = Prisma;

/** What the jobs need: no media, no request context. */
export type OrderJobDeps = Pick<
  CheckoutDeps,
  "db" | "config" | "logger" | "now" | "payments" | "email"
>;

/** A live hold, by the database clock like the reservation expiry job. */
const liveHolds = (orderId: string) => sql`
  SELECT 1 FROM "stock_reservation" r
  WHERE r."order_id" = ${orderId}::uuid AND r."status" = 'ACTIVE' AND r."expires_at" > now()`;

/** Cancels PENDING_PAYMENT orders with no live hold left. Returns the count. */
export async function expireUnpaidOrders(deps: OrderJobDeps): Promise<number> {
  const now = deps.now();
  const candidates = await deps.db.$queryRaw<{ id: string }[]>(sql`
    SELECT o."id"::text AS "id" FROM "order" o
    WHERE o."status" = 'PENDING_PAYMENT' AND NOT EXISTS (
      SELECT 1 FROM "stock_reservation" r
      WHERE r."order_id" = o."id" AND r."status" = 'ACTIVE' AND r."expires_at" > now())
    LIMIT 100`);
  let n = 0;
  for (const { id } of candidates) {
    const done = await deps.db.$transaction(async (tx) => {
      const order = await lockOrder(tx, id);
      if (order.status !== "PENDING_PAYMENT") return false;
      const live = await tx.$queryRaw<unknown[]>(liveHolds(id));
      if (live.length > 0) return false;
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
          reason: "PAYMENT_NOT_COMPLETED",
          now,
        },
      );
      return true;
    });
    if (done) {
      n++;
      await notify(deps, id, "order.cancelled");
    }
  }
  return n;
}

/** Cancels COD orders not confirmed within the window; their stock returns. */
export async function expireUnconfirmedCod(
  deps: OrderJobDeps,
): Promise<number> {
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
          reason: "NOT_CONFIRMED_IN_WINDOW",
          now,
        },
      );
      return true;
    });
    if (done) {
      n++;
      await notify(deps, id, "order.cancelled");
    }
  }
  return n;
}

export async function runOrderJobs(deps: OrderJobDeps) {
  const unpaid = await expireUnpaidOrders(deps);
  const cod = await expireUnconfirmedCod(deps);
  const changed = deps.payments
    ? await reconcile(deps.db, deps.payments, deps.now(), {
        ttlMinutes: deps.config.reservationTtlMinutes,
      })
    : [];
  for (const c of changed)
    await notify(deps, c.orderId, emailForOutcome(c.outcome));
  const refunds = deps.payments
    ? (await processGatewayRefunds(deps.db, deps.payments, deps.logger)).length
    : 0;
  return { unpaid, cod, reconciled: changed.length, refunds };
}

export type OrderJobs = { stop: () => Promise<void> };

/**
 * Runs the order jobs every minute. Runs never overlap in one process, and
 * `stop()` waits for a run in progress before shutdown closes the pool.
 */
export function startOrderJobs(
  deps: OrderJobDeps,
  logger: Logger,
  { intervalMs = 60_000 }: { intervalMs?: number } = {},
): OrderJobs {
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> | undefined;
  let stopped = false;

  const tick = () => {
    current = runOrderJobs(deps)
      .then((r) => {
        if (r.unpaid + r.cod + r.reconciled + r.refunds > 0)
          logger.info(r, "order jobs ran");
      })
      .catch((error: unknown) => {
        // Codes only; the next tick retries.
        logger.error(
          { code: (error as { code?: string }).code ?? "unknown" },
          "order jobs failed",
        );
      })
      .finally(() => {
        current = undefined;
        if (!stopped) timer = setTimeout(tick, intervalMs);
      });
  };
  timer = setTimeout(tick, intervalMs);

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await current;
    },
  };
}
