import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { Router, type CookieOptions, type RequestHandler } from "express";

import type { Config } from "../config.ts";
import { AppError } from "./errors.ts";
import { allowedOriginFor } from "./origins.ts";

/** Cookie name. The `__Host-` prefix forbids `Domain` and requires `Secure` and `Path=/`. */
export const CSRF_COOKIE = "__Host-sp_csrf";
export const CSRF_HEADER = "x-csrf-token";
export const CSRF_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** Identical in every environment (D-132): never relaxed for local HTTP. */
export const CSRF_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: CSRF_MAX_AGE_MS,
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const TOKEN = /^([A-Za-z0-9_-]{43})\.([0-9]{1,15})\.([A-Za-z0-9_-]{43})$/;

function sign(secret: string, nonce: string, issuedAt: number): string {
  return createHmac("sha256", secret)
    .update(`csrf-v1:${nonce}:${issuedAt}`)
    .digest("base64url");
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Creates a token `nonce.issuedAt.signature`. */
export function issueCsrfToken(
  secret: string,
  now: number = Date.now(),
): string {
  const nonce = randomBytes(32).toString("base64url");
  return `${nonce}.${now}.${sign(secret, nonce, now)}`;
}

/** True when the token is well formed, correctly signed and not expired. */
export function isValidCsrfToken(
  secret: string,
  token: string,
  now: number = Date.now(),
): boolean {
  const match = TOKEN.exec(token);
  if (!match) return false;
  const [, nonce = "", issued = "", signature = ""] = match;
  const issuedAt = Number(issued);
  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt > now ||
    now - issuedAt > CSRF_MAX_AGE_MS
  ) {
    return false;
  }
  return equal(signature, sign(secret, nonce, issuedAt));
}

/** `GET /api/v1/auth/csrf`: sets the cookie and returns the same token. */
export function csrfRouter(config: Config): Router {
  const router = Router();
  router.get("/api/v1/auth/csrf", (_req, res) => {
    const token = issueCsrfToken(config.csrfSecret);
    res.cookie(CSRF_COOKIE, token, CSRF_COOKIE_OPTIONS);
    res.setHeader("Cache-Control", "no-store");
    res.json({ csrfToken: token });
  });
  return router;
}

/**
 * Verifies state-changing requests: the Origin must be the allowed origin for
 * the path, the header must equal the cookie, and the token must verify.
 */
export function csrfProtection(config: Config): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const origin = req.get("origin");
    const header = req.get(CSRF_HEADER);
    const cookie: unknown = req.cookies?.[CSRF_COOKIE];
    const ok =
      origin === allowedOriginFor(req.path, config) &&
      typeof header === "string" &&
      typeof cookie === "string" &&
      equal(header, cookie) &&
      isValidCsrfToken(config.csrfSecret, header);
    if (!ok) return next(new AppError("CSRF_FAILED"));
    next();
  };
}
