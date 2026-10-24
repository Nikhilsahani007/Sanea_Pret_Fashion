import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config.ts";

const valid = {
  NODE_ENV: "development",
  STOREFRONT_ORIGIN: "http://localhost:5173",
  ADMIN_ORIGIN: "http://localhost:5174",
  CSRF_SECRET: "a".repeat(32),
  DATABASE_URL: "postgresql://u:p@127.0.0.1:5433/sanea_dev",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  IP_HASH_KEY: "i".repeat(32),
};

function problems(env: Record<string, string | undefined>): readonly string[] {
  try {
    loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe("loadConfig()", () => {
  it("applies defaults", () => {
    expect(loadConfig(valid)).toEqual({
      nodeEnv: "development",
      host: "127.0.0.1",
      port: 4000,
      logLevel: "info",
      storefrontOrigin: "http://localhost:5173",
      adminOrigin: "http://localhost:5174",
      csrfSecret: "a".repeat(32),
      trustProxy: 0,
      databaseUrl: "postgresql://u:p@127.0.0.1:5433/sanea_dev",
      mfaEncryptionKey: Buffer.alloc(32, 7),
      mfaKeyVersion: 1,
      ipHashKey: "i".repeat(32),
      mediaDir: "var/media",
      mediaPublicBaseUrl: "/media",
    });
  });

  it("reads explicit values", () => {
    const config = loadConfig({
      ...valid,
      PORT: "8080",
      TRUST_PROXY: "1",
      LOG_LEVEL: "warn",
    });
    expect([config.port, config.trustProxy, config.logLevel]).toEqual([
      8080,
      1,
      "warn",
    ]);
  });

  it("reports every missing required variable", () => {
    expect(problems({})).toEqual([
      "NODE_ENV must be development, test or production",
      "STOREFRONT_ORIGIN is required",
      "ADMIN_ORIGIN is required",
      "CSRF_SECRET is required",
      "DATABASE_URL is required",
      "MFA_ENCRYPTION_KEY is required",
      "IP_HASH_KEY is required",
    ]);
  });

  it.each([
    [{ NODE_ENV: "staging" }, "NODE_ENV"],
    [{ PORT: "0" }, "PORT"],
    [{ PORT: "abc" }, "PORT"],
    [{ TRUST_PROXY: "-1" }, "TRUST_PROXY"],
    [{ LOG_LEVEL: "verbose" }, "LOG_LEVEL"],
    [{ STOREFRONT_ORIGIN: "http://localhost:5173/shop" }, "STOREFRONT_ORIGIN"],
    [{ ADMIN_ORIGIN: "localhost:5174" }, "ADMIN_ORIGIN"],
    [{ CSRF_SECRET: "short" }, "CSRF_SECRET"],
    [{ DATABASE_URL: "mysql://x" }, "DATABASE_URL"],
    [
      { MFA_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") },
      "MFA_ENCRYPTION_KEY",
    ],
    [{ MFA_ENCRYPTION_KEY: "not base64!" }, "MFA_ENCRYPTION_KEY"],
    [{ MFA_ENCRYPTION_KEY_VERSION: "0" }, "MFA_ENCRYPTION_KEY_VERSION"],
    [{ IP_HASH_KEY: "short" }, "IP_HASH_KEY"],
  ])("rejects %j", (override, name) => {
    const found = problems({ ...valid, ...override });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(name);
  });

  it("requires https origins in production", () => {
    expect(problems({ ...valid, NODE_ENV: "production" })).toEqual([
      "STOREFRONT_ORIGIN must use https in production",
      "ADMIN_ORIGIN must use https in production",
      "MEDIA_PUBLIC_BASE_URL must be an https URL in production",
    ]);
    expect(
      problems({
        ...valid,
        NODE_ENV: "production",
        STOREFRONT_ORIGIN: "https://saneapret.example",
        ADMIN_ORIGIN: "https://admin.saneapret.example",
        MEDIA_PUBLIC_BASE_URL: "https://media.saneapret.example",
      }),
    ).toEqual([]);
  });

  it("validates the media URL prefix", () => {
    expect(
      problems({ ...valid, MEDIA_PUBLIC_BASE_URL: "/media/" }),
    ).toHaveLength(1);
    expect(
      problems({ ...valid, MEDIA_PUBLIC_BASE_URL: "javascript:x" }),
    ).toHaveLength(1);
  });

  it("never includes secret values in the error message", () => {
    const secret = "do-not-print-me";
    try {
      loadConfig({ ...valid, CSRF_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
    const key = Buffer.alloc(16, 9).toString("base64");
    const message = problems({ ...valid, MFA_ENCRYPTION_KEY: key }).join();
    expect(message).not.toContain(key);
  });
});
