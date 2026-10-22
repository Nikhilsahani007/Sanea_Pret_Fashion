// End-to-end test API (never used in production). Same app and middleware as
// apps/api/src/main.ts, with the auth rate limits raised through the existing
// test seam: one run signs in every role from one IP, which the production
// limits (10 per 15 minutes, D-074) would refuse part-way.
import { loadConfig } from "../../apps/api/src/platform/config.ts";
import { checkDb, createDb } from "../../apps/api/src/platform/db.ts";
import { createApp } from "../../apps/api/src/platform/http/app.ts";
import { createLogger } from "../../apps/api/src/platform/logger.ts";

if (process.env.NODE_ENV === "production") {
  process.stderr.write("The end-to-end API is not for production.\n");
  process.exit(1);
}

const config = loadConfig(process.env);
const logger = createLogger("warn");
const db = createDb(config.databaseUrl);
await checkDb(db);

const limit = { windowMs: 15 * 60 * 1000, limit: 1000 };
const app = createApp({
  config,
  logger,
  db,
  authLimits: { signIn: limit, invite: limit },
});
const server = app.listen(config.port, config.host, () => {
  process.stdout.write(`e2e api on ${config.host}:${config.port}\n`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    server.close(() => void db.$disconnect().then(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  });
