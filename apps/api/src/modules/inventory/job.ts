// The reservation expiry job (SR-9, Q9-5): every 60 s in each API process.
// Several processes may run it at once: `expireDue` claims rows with SKIP
// LOCKED, so each reservation expires once. Runs never overlap in one process,
// and `stop()` waits for a run in progress before shutdown closes the pool.
import type { Logger } from "pino";

import type { Db } from "../../platform/db.ts";
import { expireDue } from "./service.ts";

export const EXPIRY_INTERVAL_MS = 60_000;

export type ExpiryJob = { stop: () => Promise<void> };

export function startExpiryJob(
  db: Db,
  logger: Logger,
  {
    intervalMs = EXPIRY_INTERVAL_MS,
    run = expireDue,
  }: { intervalMs?: number; run?: typeof expireDue } = {},
): ExpiryJob {
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> | undefined;
  let stopped = false;

  const tick = () => {
    current = run(db)
      .then((expired) => {
        if (expired > 0) logger.info({ expired }, "stock reservations expired");
      })
      .catch((error: unknown) => {
        // Counts and codes only; the next tick retries.
        logger.error(
          { code: (error as { code?: string }).code ?? "unknown" },
          "reservation expiry failed",
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
