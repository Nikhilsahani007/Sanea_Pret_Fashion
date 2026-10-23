// The cart token (D-099; phase-11-plan.md §5.2): 256 random bits in the
// `__Host-sp_cart` cookie; only its SHA-256 is stored. An unknown, malformed
// or expired token is treated exactly like no cookie.
import type { CookieOptions } from "express";

import { newToken, sha256, type Bytes } from "../auth/secrets.ts";

export const CART_COOKIE = "__Host-sp_cart";
export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** `__Host-`: Secure, Path=/ and no Domain are required by the browser. */
export const CART_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: CART_TTL_MS,
};

/** 32 random bytes in base64url, as issued by `newToken`. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The stored hash for a cookie value, or null when it cannot be a token. */
export function cartTokenHash(value: unknown): Bytes | null {
  return typeof value === "string" && TOKEN.test(value) ? sha256(value) : null;
}

export const newCartToken = newToken;
