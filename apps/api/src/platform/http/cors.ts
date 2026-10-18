import type { RequestHandler } from "express";
import cors from "cors";

import type { Config } from "../config.ts";
import { allowedOriginFor } from "./origins.ts";

/**
 * Credentialed CORS for exactly one origin per path. Other origins receive no
 * CORS headers, so browsers block the response.
 */
export function corsPolicy(config: Config): RequestHandler {
  return cors((req, callback) => {
    const origin = req.headers.origin;
    const allowed = allowedOriginFor(req.url ?? "", config);
    callback(null, {
      origin: origin === allowed ? allowed : false,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key"],
      exposedHeaders: ["X-Request-Id"],
      maxAge: 600,
    });
  });
}
