// In-process job: releases expired reservations every minute (SR-9). Valid
// for one API instance; a shared job runner is decided before multi-instance
// deployment (Phase 19, like the rate-limit store, D-047).
import type { ModuleDeps } from "../deps.ts";
import { releaseExpired } from "./service.ts";

export function startReservationExpiry(
  deps: ModuleDeps,
  everyMs = 60_000,
): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    running = true;
    deps.db
      .$transaction((tx) => releaseExpired(tx, deps.now()))
      .then((count) => {
        if (count > 0)
          deps.logger.info({ count }, "expired reservations released");
      })
      .catch((err: unknown) =>
        deps.logger.error({ err }, "reservation expiry failed"),
      )
      .finally(() => {
        running = false;
      });
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
