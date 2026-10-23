// The expired-cart cleanup (D-099; phase-11-plan.md §5.3): every hour in each
// API process. Concurrent runs are safe: `deleteExpiredCarts` claims rows with
// SKIP LOCKED. Runs never overlap in one process, and `stop()` waits for a run
// in progress before shutdown closes the pool.
import type { Logger } from "pino";

import type { Db } from "../../platform/db.ts";
import { deleteExpiredCarts } from "./service.ts";

export const CART_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export type CartCleanupJob = { stop: () => Promise<void> };

export function startCartCleanupJob(
  db: Db,
  logger: Logger,
  {
    intervalMs = CART_CLEANUP_INTERVAL_MS,
    run = deleteExpiredCarts,
  }: { intervalMs?: number; run?: typeof deleteExpiredCarts } = {},
): CartCleanupJob {
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> | undefined;
  let stopped = false;

  const tick = () => {
    current = run(db)
      .then((deleted) => {
        if (deleted > 0) logger.info({ deleted }, "expired carts deleted");
      })
      .catch((error: unknown) => {
        // Codes only; the next tick retries.
        logger.error(
          { code: (error as { code?: string }).code ?? "unknown" },
          "cart cleanup failed",
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
