// Test helpers for the API platform. Not used by production code.
import { Writable } from "node:stream";

import type { Router } from "express";

import { loadConfig, type Config } from "./config.ts";
import type { Db } from "./db.ts";
import { createApp, type AppOptions } from "./http/app.ts";
import { createLogger } from "./logger.ts";

export const STOREFRONT = "http://localhost:5173";
export const ADMIN = "http://localhost:5174";
export const SECRET = "test-secret-that-is-at-least-32-characters";
/** Test-only 2FA key (32 bytes) and IP-hash key; never used outside tests. */
export const MFA_KEY = Buffer.alloc(32, 0x5a).toString("base64");
export const IP_KEY = "test-ip-hash-key-at-least-32-characters";

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    NODE_ENV: "test",
    STOREFRONT_ORIGIN: STOREFRONT,
    ADMIN_ORIGIN: ADMIN,
    CSRF_SECRET: SECRET,
    LOG_LEVEL: "info",
    // Unused unless a test passes a database to testApp().
    DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
    MFA_ENCRYPTION_KEY: MFA_KEY,
    IP_HASH_KEY: IP_KEY,
    ...overrides,
  });
}

/** Builds an app whose log lines are captured in `lines`. */
export function testApp(
  options: {
    config?: Config;
    routers?: Router[];
    db?: Db;
  } & Pick<AppOptions, "now" | "argon2" | "authLimits"> = {},
) {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const config = options.config ?? testConfig();
  const logger = createLogger(config.logLevel, stream);
  const app = createApp({
    config,
    logger,
    routers: options.routers ?? [],
    ...(options.db ? { db: options.db } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.argon2 ? { argon2: options.argon2 } : {}),
    ...(options.authLimits ? { authLimits: options.authLimits } : {}),
  });
  return { app, lines, config };
}

/** Extracts `name=value` from a Set-Cookie header for sending back as Cookie. */
export function cookiePair(
  setCookie: string | string[] | undefined,
  name: string,
): string {
  const all = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const found = all.find((c) => c.startsWith(`${name}=`));
  if (!found) throw new Error(`cookie ${name} not set`);
  return found.split(";")[0] ?? "";
}
