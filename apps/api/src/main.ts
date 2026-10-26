import { rm } from "node:fs/promises";
import { join } from "node:path";

import { ConfigError, loadConfig, type Config } from "./platform/config.ts";
import { checkDb, createDb } from "./platform/db.ts";
import { createApp } from "./platform/http/app.ts";
import { startCartCleanupJob } from "./modules/cart/job.ts";
import { startExpiryJob } from "./modules/inventory/job.ts";
import { startOrderJobs } from "./modules/orders/jobs.ts";
import { paymentProviderFor } from "./modules/payments/mock.ts";
import { createLogger } from "./platform/logger.ts";

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger(config.logLevel);
const db = createDb(config.databaseUrl);
try {
  await checkDb(db);
} catch (error) {
  // Code only: the driver message can include the host and user.
  const code = (error as { code?: string }).code ?? "unknown";
  process.stderr.write(`Database unavailable (${code})
`);
  process.exit(1);
}
// Remove upload job folders left by a crash (phase-8-plan.md §5.7.2).
await rm(join(config.mediaStorageDir, "tmp"), { recursive: true, force: true });
// One provider instance for the routes and the order jobs (the mock keeps
// its payments in memory).
const payments = paymentProviderFor(config);
const app = createApp({ config, logger, db, payments });
const server = app.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, "api listening");
});
// Releases expired stock reservations every minute (SR-9).
const expiryJob = startExpiryJob(db, logger);
// Deletes carts 30 days after their last write, every hour (D-099).
const cartJob = startCartCleanupJob(db, logger);
// Cancels unpaid and unconfirmed orders and reconciles payments, every minute (Phase 15).
const orderJobs = startOrderJobs(
  { db, config, logger, now: () => new Date(), payments },
  logger,
);

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  // Close the server first: a late query would reopen the database pool.
  server.close(() => {
    Promise.all([expiryJob.stop(), cartJob.stop(), orderJobs.stop()])
      .then(() => db.$disconnect())
      .then(
        () => process.exit(0),
        () => process.exit(1),
      );
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
