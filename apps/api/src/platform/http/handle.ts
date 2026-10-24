// Shared route helpers for the business modules (Phase 8 on).
import type { RequestHandler, Response } from "express";

import { AppError } from "./errors.ts";

/** Passes async errors to the error handler. */
export const handle =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** The values parsed by `validate()`. */
export function input<B = unknown, P = unknown, Q = unknown>(
  res: Response,
): { body: B; params: P; query: Q } {
  return res.locals.input as { body: B; params: P; query: Q };
}

/** Admin responses are never cached. */
export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

/**
 * Maps Prisma's known request errors to API errors: a unique-constraint
 * clash or a restricted foreign key becomes 409 CONFLICT (with the fields,
 * never values), a missing row 404. Anything else is rethrown.
 */
export function mapDbError(error: unknown): never {
  const e = error as { code?: unknown; meta?: { target?: unknown } } | null;
  if (e?.code === "P2002") {
    const target = e.meta?.target;
    throw new AppError(
      "CONFLICT",
      Array.isArray(target) ? { fields: target } : { reason: "DUPLICATE" },
    );
  }
  if (e?.code === "P2003" || e?.code === "P2014")
    throw new AppError("CONFLICT", { reason: "IN_USE" });
  if (e?.code === "P2025") throw new AppError("NOT_FOUND");
  throw error;
}
