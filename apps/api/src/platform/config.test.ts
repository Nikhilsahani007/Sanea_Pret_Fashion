import { describe, expect, it } from "vitest";

import { ConfigError, loadConfig } from "./config.ts";

const valid = {
  NODE_ENV: "development",
  STOREFRONT_ORIGIN: "http://localhost:5173",
  ADMIN_ORIGIN: "http://localhost:5174",
  CSRF_SECRET: "a".repeat(32),
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
  ])("rejects %j", (override, name) => {
    const found = problems({ ...valid, ...override });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(name);
  });

  it("requires https origins in production", () => {
    expect(problems({ ...valid, NODE_ENV: "production" })).toEqual([
      "STOREFRONT_ORIGIN must use https in production",
      "ADMIN_ORIGIN must use https in production",
    ]);
    expect(
      problems({
        ...valid,
        NODE_ENV: "production",
        STOREFRONT_ORIGIN: "https://saneapret.example",
        ADMIN_ORIGIN: "https://admin.saneapret.example",
      }),
    ).toEqual([]);
  });

  it("never includes secret values in the error message", () => {
    const secret = "do-not-print-me";
    try {
      loadConfig({ ...valid, CSRF_SECRET: secret });
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });
});
