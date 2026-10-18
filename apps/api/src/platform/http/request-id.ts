import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";

/**
 * Gives every request a fresh server-generated ID and returns it in
 * `X-Request-Id`. Client-supplied IDs are ignored, so they cannot be spoofed
 * into logs.
 */
export const requestId: RequestHandler = (req, res, next) => {
  const id = randomUUID();
  req.id = id;
  res.setHeader("X-Request-Id", id);
  next();
};
