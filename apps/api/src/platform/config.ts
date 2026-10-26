import { z } from "zod";

const ORIGIN = /^https?:\/\/[^/\s?#]+$/;
// A base URL for public images: http(s), host, optional path, ending in "/".
const MEDIA_BASE = /^https?:\/\/[^/\s?#]+(\/[^\s?#]*)?\/$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

function originSchema(name: string) {
  return z.string({ error: `${name} is required` }).regex(ORIGIN, {
    error: `${name} must be an origin such as https://example.com (no path)`,
  });
}

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"], {
      error: "NODE_ENV must be development, test or production",
    }),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    STOREFRONT_ORIGIN: originSchema("STOREFRONT_ORIGIN"),
    ADMIN_ORIGIN: originSchema("ADMIN_ORIGIN"),
    CSRF_SECRET: z
      .string({ error: "CSRF_SECRET is required" })
      .min(32, { error: "CSRF_SECRET must be at least 32 characters" }),
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    DATABASE_URL: z
      .string({ error: "DATABASE_URL is required" })
      .regex(/^postgres(ql)?:\/\/\S+$/, {
        error: "DATABASE_URL must be a postgresql:// URL",
      }),
    // 32 random bytes, base64 (D-065). Checked without echoing the value.
    MFA_ENCRYPTION_KEY: z
      .string({ error: "MFA_ENCRYPTION_KEY is required" })
      .refine((v) => BASE64.test(v) && Buffer.from(v, "base64").length === 32, {
        error: "MFA_ENCRYPTION_KEY must be 32 bytes, base64-encoded",
      }),
    MFA_ENCRYPTION_KEY_VERSION: z.coerce.number().int().min(1).default(1),
    IP_HASH_KEY: z
      .string({ error: "IP_HASH_KEY is required" })
      .min(32, { error: "IP_HASH_KEY must be at least 32 characters" }),
    // Media (D-080, Q8-9, D-088).
    MEDIA_STORAGE_DIR: z
      .string({ error: "MEDIA_STORAGE_DIR is required" })
      .min(1, { error: "MEDIA_STORAGE_DIR is required" }),
    MEDIA_PUBLIC_BASE_URL: z
      .string({ error: "MEDIA_PUBLIC_BASE_URL is required" })
      .regex(MEDIA_BASE, {
        error:
          "MEDIA_PUBLIC_BASE_URL must be an http(s) URL ending in / (no query)",
      }),
    // Whole numbers 0 to 4, default 2, per API process (T-5). Empty means unset.
    MEDIA_UPLOAD_QUEUE_WAITING: z
      .preprocess(
        (v) => (v === "" ? undefined : v),
        z
          .string()
          .regex(/^[0-4]$/, {
            error:
              "MEDIA_UPLOAD_QUEUE_WAITING must be a whole number from 0 to 4",
          })
          .optional(),
      )
      .transform((v) => (v === undefined ? 2 : Number(v))),
    // Stock reservation hold (SR-3, Q9-5): whole minutes 5 to 60, default 15.
    RESERVATION_TTL_MINUTES: z
      .preprocess(
        (v) => (v === "" ? undefined : v),
        z
          .string()
          .regex(/^(?:[5-9]|[1-5][0-9]|60)$/, {
            error:
              "RESERVATION_TTL_MINUTES must be a whole number from 5 to 60",
          })
          .optional(),
      )
      .transform((v) => (v === undefined ? 15 : Number(v))),
    // Guest cart line limit (D-099): whole units 1 to 10, default 10. The
    // database CHECK holds 10, so the setting can only lower it.
    CART_MAX_LINE_QUANTITY: z
      .preprocess(
        (v) => (v === "" ? undefined : v),
        z
          .string()
          .regex(/^(?:[1-9]|10)$/, {
            error: "CART_MAX_LINE_QUANTITY must be a whole number from 1 to 10",
          })
          .optional(),
      )
      .transform((v) => (v === undefined ? 10 : Number(v))),
    // Phase 15 payments (system-design.md §6.1, D-107). `mock` simulates a
    // gateway in development and tests and is refused in production; `none`
    // offers no online payment. Live providers arrive in Phase 18 (OD-06).
    PAYMENT_PROVIDER: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z
        .enum(["none", "mock"], {
          error: "PAYMENT_PROVIDER must be none or mock",
        })
        .optional(),
    ),
    // Signs mock webhooks. Optional: a random per-process secret is used
    // when absent, which is enough because the mock signs and verifies in
    // the same process.
    MOCK_PAYMENT_SECRET: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z
        .string()
        .min(32, {
          error: "MOCK_PAYMENT_SECRET must be at least 32 characters",
        })
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (env.PAYMENT_PROVIDER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_PROVIDER"],
        message: "PAYMENT_PROVIDER mock is not allowed in production",
      });
    }
    for (const key of ["STOREFRONT_ORIGIN", "ADMIN_ORIGIN"] as const) {
      if (!env[key].startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must use https in production`,
        });
      }
    }
  });

export type Config = {
  readonly nodeEnv: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly logLevel: string;
  readonly storefrontOrigin: string;
  readonly adminOrigin: string;
  readonly csrfSecret: string;
  readonly trustProxy: number;
  readonly databaseUrl: string;
  readonly mfaEncryptionKey: Buffer;
  readonly mfaKeyVersion: number;
  readonly ipHashKey: string;
  readonly mediaStorageDir: string;
  readonly mediaPublicBaseUrl: string;
  readonly mediaUploadQueueWaiting: number;
  readonly reservationTtlMinutes: number;
  readonly cartMaxLineQuantity: number;
  readonly paymentProvider: "none" | "mock";
  readonly mockPaymentSecret: string | null;
};

/** Thrown when configuration is invalid. Lists variable names and reasons, never values. */
export class ConfigError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Invalid configuration:\n${problems.map((p) => `  - ${p}`).join("\n")}`,
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

/** Parses and validates configuration from environment variables. Pure: no side effects. */
export function loadConfig(
  env: Readonly<Record<string, string | undefined>>,
): Config {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const name = issue.path.join(".") || "environment";
      return issue.message.startsWith(name)
        ? issue.message
        : `${name}: ${issue.message}`;
    });
    throw new ConfigError(problems);
  }
  const e = result.data;
  return {
    nodeEnv: e.NODE_ENV,
    host: e.HOST,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    storefrontOrigin: e.STOREFRONT_ORIGIN,
    adminOrigin: e.ADMIN_ORIGIN,
    csrfSecret: e.CSRF_SECRET,
    trustProxy: e.TRUST_PROXY,
    databaseUrl: e.DATABASE_URL,
    mfaEncryptionKey: Buffer.from(e.MFA_ENCRYPTION_KEY, "base64"),
    mfaKeyVersion: e.MFA_ENCRYPTION_KEY_VERSION,
    ipHashKey: e.IP_HASH_KEY,
    mediaStorageDir: e.MEDIA_STORAGE_DIR,
    mediaPublicBaseUrl: e.MEDIA_PUBLIC_BASE_URL,
    mediaUploadQueueWaiting: e.MEDIA_UPLOAD_QUEUE_WAITING,
    reservationTtlMinutes: e.RESERVATION_TTL_MINUTES,
    cartMaxLineQuantity: e.CART_MAX_LINE_QUANTITY,
    paymentProvider:
      e.PAYMENT_PROVIDER ?? (e.NODE_ENV === "production" ? "none" : "mock"),
    mockPaymentSecret: e.MOCK_PAYMENT_SECRET ?? null,
  };
}
