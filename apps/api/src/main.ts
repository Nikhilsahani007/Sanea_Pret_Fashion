import { ConfigError, loadConfig, type Config } from "./platform/config.ts";
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
const app = createApp({ config, logger });
const server = app.listen(config.port, config.host, () => {
  logger.info({ host: config.host, port: config.port }, "api listening");
});

function shutdown(signal: string): void {
  logger.info({ signal }, "shutting down");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
