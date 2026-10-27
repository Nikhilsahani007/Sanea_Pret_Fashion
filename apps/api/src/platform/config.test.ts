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
  MEDIA_STORAGE_DIR: "/var/lib/sanea/media",
  MEDIA_PUBLIC_BASE_URL: "http://127.0.0.1:4010/",
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
      mediaStorageDir: "/var/lib/sanea/media",
      mediaPublicBaseUrl: "http://127.0.0.1:4010/",
      mediaUploadQueueWaiting: 2,
      reservationTtlMinutes: 15,
      cartMaxLineQuantity: 10,
      paymentProvider: "mock",
      mockPaymentSecret: null,
      phonePe: null,
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
      "MEDIA_STORAGE_DIR is required",
      "MEDIA_PUBLIC_BASE_URL is required",
    ]);
  });

  it.each<[Record<string, string>, string]>([
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
    [{ MEDIA_STORAGE_DIR: "" }, "MEDIA_STORAGE_DIR"],
    [
      { MEDIA_PUBLIC_BASE_URL: "http://127.0.0.1:4010" },
      "MEDIA_PUBLIC_BASE_URL",
    ],
    [{ MEDIA_PUBLIC_BASE_URL: "ftp://cdn.example/" }, "MEDIA_PUBLIC_BASE_URL"],
    [
      { MEDIA_PUBLIC_BASE_URL: "https://cdn.example/?x=1/" },
      "MEDIA_PUBLIC_BASE_URL",
    ],
    ...["-1", "5", "2.5", "1e0", " 2", "two", "02"].map(
      (v): [Record<string, string>, string] => [
        { MEDIA_UPLOAD_QUEUE_WAITING: v },
        "MEDIA_UPLOAD_QUEUE_WAITING",
      ],
    ),
    ...["4", "61", "0", "15.5", "1e1", " 15", "015", "fifteen"].map(
      (v): [Record<string, string>, string] => [
        { RESERVATION_TTL_MINUTES: v },
        "RESERVATION_TTL_MINUTES",
      ],
    ),
    ...["0", "11", "1.5", " 5", "05", "ten"].map(
      (v): [Record<string, string>, string] => [
        { CART_MAX_LINE_QUANTITY: v },
        "CART_MAX_LINE_QUANTITY",
      ],
    ),
  ])("rejects %j", (override, name) => {
    const found = problems({ ...valid, ...override });
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(name);
  });

  it("accepts MEDIA_UPLOAD_QUEUE_WAITING 0 to 4, default 2 (T-5)", () => {
    for (const v of ["0", "1", "2", "3", "4"])
      expect(
        loadConfig({ ...valid, MEDIA_UPLOAD_QUEUE_WAITING: v })
          .mediaUploadQueueWaiting,
      ).toBe(Number(v));
    // Unset and empty both mean the default.
    expect(loadConfig(valid).mediaUploadQueueWaiting).toBe(2);
    expect(
      loadConfig({ ...valid, MEDIA_UPLOAD_QUEUE_WAITING: "" })
        .mediaUploadQueueWaiting,
    ).toBe(2);
  });

  it("accepts RESERVATION_TTL_MINUTES 5 to 60, default 15 (SR-3, Q9-5)", () => {
    for (const v of ["5", "9", "10", "15", "59", "60"])
      expect(
        loadConfig({ ...valid, RESERVATION_TTL_MINUTES: v })
          .reservationTtlMinutes,
      ).toBe(Number(v));
    expect(loadConfig(valid).reservationTtlMinutes).toBe(15);
    expect(
      loadConfig({ ...valid, RESERVATION_TTL_MINUTES: "" })
        .reservationTtlMinutes,
    ).toBe(15);
  });

  it("accepts CART_MAX_LINE_QUANTITY 1 to 10, default 10 (D-099)", () => {
    for (const v of ["1", "5", "9", "10"])
      expect(
        loadConfig({ ...valid, CART_MAX_LINE_QUANTITY: v }).cartMaxLineQuantity,
      ).toBe(Number(v));
    expect(loadConfig(valid).cartMaxLineQuantity).toBe(10);
    expect(
      loadConfig({ ...valid, CART_MAX_LINE_QUANTITY: "" }).cartMaxLineQuantity,
    ).toBe(10);
  });

  it("refuses the mock payment provider in production and defaults to none there", () => {
    const prod = {
      ...valid,
      NODE_ENV: "production",
      STOREFRONT_ORIGIN: "https://saneapret.example",
      ADMIN_ORIGIN: "https://admin.saneapret.example",
    };
    expect(problems({ ...prod, PAYMENT_PROVIDER: "mock" })).toEqual([
      "PAYMENT_PROVIDER mock is not allowed in production",
    ]);
    expect(loadConfig(prod).paymentProvider).toBe("none");
    expect(problems({ ...valid, PAYMENT_PROVIDER: "razorpay" })).toHaveLength(
      1,
    );
    expect(problems({ ...valid, MOCK_PAYMENT_SECRET: "short" })).toHaveLength(
      1,
    );
  });

  it("needs every PhonePe credential, and live mode only with production and approval (D-195)", () => {
    const phonepe = {
      ...valid,
      PAYMENT_PROVIDER: "phonepe",
      PHONEPE_CLIENT_ID: "client",
      PHONEPE_CLIENT_SECRET: "secret",
      PHONEPE_WEBHOOK_USERNAME: "hook",
      PHONEPE_WEBHOOK_PASSWORD: "hookpass",
    };
    expect(loadConfig(phonepe).phonePe).toEqual({
      env: "sandbox",
      clientId: "client",
      clientSecret: "secret",
      clientVersion: "1",
      webhookUsername: "hook",
      webhookPassword: "hookpass",
    });
    expect(problems({ ...phonepe, PHONEPE_CLIENT_SECRET: "" })).toEqual([
      "PHONEPE_CLIENT_SECRET is required when PAYMENT_PROVIDER is phonepe",
    ]);
    // Live money: never outside production, never without the approval flag.
    expect(problems({ ...phonepe, PHONEPE_ENV: "production" })).toEqual([
      "PHONEPE_ENV production needs NODE_ENV=production",
      "PHONEPE_LIVE_APPROVED must be true for PHONEPE_ENV production (owner approval of the live gateway)",
    ]);
    const prod = {
      ...phonepe,
      NODE_ENV: "production",
      STOREFRONT_ORIGIN: "https://saneapret.example",
      ADMIN_ORIGIN: "https://admin.saneapret.example",
      PHONEPE_ENV: "production",
    };
    expect(problems(prod)).toHaveLength(1);
    expect(
      loadConfig({ ...prod, PHONEPE_LIVE_APPROVED: "true" }).phonePe?.env,
    ).toBe("production");
    // The sandbox may run on a production-mode staging server.
    expect(loadConfig({ ...prod, PHONEPE_ENV: "sandbox" }).phonePe?.env).toBe(
      "sandbox",
    );
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
    const key = Buffer.alloc(16, 9).toString("base64");
    const message = problems({ ...valid, MFA_ENCRYPTION_KEY: key }).join();
    expect(message).not.toContain(key);
  });
});
