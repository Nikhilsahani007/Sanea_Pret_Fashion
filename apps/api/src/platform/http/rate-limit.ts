import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

import { errorBody } from "./errors.ts";

export const HEALTH_PATH = "/api/v1/health";

type LimitOptions = { readonly windowMs: number; readonly limit: number };

/**
 * Per-IP rate limiter returning `429 RATE_LIMITED`. In-memory store: valid for
 * a single API instance only (D-047). The client IP comes from Express's
 * `trust proxy` setting, so a spoofed X-Forwarded-For is ignored by default.
 */
export function createRateLimiter(options: LimitOptions): RequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(errorBody("RATE_LIMITED", String(req.id ?? "")));
    },
  });
}

/** Global default: 300 requests per minute per IP, health exempt (D-048). */
export function globalRateLimit(): RequestHandler {
  const limiter = createRateLimiter({ windowMs: 60_000, limit: 300 });
  return (req, res, next) =>
    req.path === HEALTH_PATH ? next() : limiter(req, res, next);
}
