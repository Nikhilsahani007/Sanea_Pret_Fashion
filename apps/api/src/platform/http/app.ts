import cookieParser from "cookie-parser";
import express, { type Express, type Router } from "express";
import { pinoHttp } from "pino-http";
import type { Logger } from "pino";

import { healthRouter } from "../../modules/health/router.ts";
import type { Config } from "../config.ts";
import { jsonBody, requireJson } from "./body.ts";
import { corsPolicy } from "./cors.ts";
import { csrfProtection, csrfRouter } from "./csrf.ts";
import { errorHandler, notFound } from "./errors.ts";
import { globalRateLimit } from "./rate-limit.ts";
import { requestId } from "./request-id.ts";
import { securityHeaders } from "./security-headers.ts";

export type AppOptions = {
  readonly config: Config;
  readonly logger: Logger;
  /** Extra routers mounted after the platform routes (tests; later phases). */
  readonly routers?: readonly Router[];
};

/** Builds the Express app. Middleware order matters; see each step. */
export function createApp({
  config,
  logger,
  routers = [],
}: AppOptions): Express {
  const app = express();
  app.set("trust proxy", config.trustProxy);
  app.disable("x-powered-by");

  app.use(requestId); // 1. server-generated request ID
  app.use(pinoHttp({ logger, genReqId: (req) => req.id })); // 2. request logs
  app.use(securityHeaders(config.nodeEnv === "production")); // 3. headers on every response
  app.use(corsPolicy(config)); // 4. CORS, including preflight
  app.use(globalRateLimit()); // 5. 300/min per IP, health exempt
  app.use(cookieParser()); // 6. cookies for CSRF
  app.use(csrfProtection(config)); // 7. Origin + token on state-changing methods
  app.use(requireJson); // 8. 415 for non-JSON bodies
  app.use(jsonBody); // 9. 100 KB JSON

  app.use(healthRouter());
  app.use(csrfRouter(config));
  for (const router of routers) app.use(router);

  app.use(notFound);
  app.use(errorHandler(logger));
  return app;
}
