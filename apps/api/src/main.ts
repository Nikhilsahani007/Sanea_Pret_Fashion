import { ConfigError, loadConfig, type Config } from "./platform/config.ts";
import { checkDb, createDb } from "./platform/db.ts";
import { createApp } from "./platform/http/app.ts";
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
const app = createApp({ config, logger, db, jobs: true });
const server = app.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, "api listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  // Close the server first: a late query would reopen the database pool.
  server.close(() => {
    db.$disconnect().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
