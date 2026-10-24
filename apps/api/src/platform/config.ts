import { z } from "zod";

const ORIGIN = /^https?:\/\/[^/\s?#]+$/;
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
    // Requests per minute per IP across the API (D-048). Leave at the default
    // in production; the end-to-end stack raises it (D-173).
    GLOBAL_RATE_LIMIT_PER_MINUTE: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.coerce.number().int().min(60).max(100_000).default(300),
    ),
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
    // Phase 8 media (system-design.md §10). Local folder for originals and
    // derivatives; public URL prefix for derivatives (a CDN in production).
    MEDIA_DIR: z.string().min(1).default("var/media"),
    MEDIA_PUBLIC_BASE_URL: z
      .string()
      .regex(/^(\/[A-Za-z0-9_-]+|https:\/\/[^\s?#]+)$/, {
        error:
          "MEDIA_PUBLIC_BASE_URL must be a path such as /media or an https URL without a trailing slash",
      })
      .default("/media"),
    // Phase 15 payments (system-design.md §6.1, D-107). `mock` simulates a
    // gateway in development and tests and is refused in production; `none`
    // offers no online payment. Live providers arrive in Phase 18 (OD-06).
    PAYMENT_PROVIDER: z
      .enum(["none", "mock"], {
        error: "PAYMENT_PROVIDER must be none or mock",
      })
      .optional(),
    // Signs mock webhooks. Optional: a random per-process secret is used
    // when absent, which is enough because the mock signs and verifies in
    // the same process.
    MOCK_PAYMENT_SECRET: z
      .string()
      .min(32, { error: "MOCK_PAYMENT_SECRET must be at least 32 characters" })
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    for (const key of ["STOREFRONT_ORIGIN", "ADMIN_ORIGIN"] as const) {
      if (!env[key].startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must use https in production`,
        });
      }
    }
    if (env.PAYMENT_PROVIDER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_PROVIDER"],
        message: "PAYMENT_PROVIDER mock is not allowed in production",
      });
    }
    // The API never serves media in production (security-design.md §6).
    if (!env.MEDIA_PUBLIC_BASE_URL.startsWith("https://")) {
      ctx.addIssue({
        code: "custom",
        path: ["MEDIA_PUBLIC_BASE_URL"],
        message: "MEDIA_PUBLIC_BASE_URL must be an https URL in production",
      });
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
  readonly globalRateLimitPerMinute: number;
  readonly databaseUrl: string;
  readonly mfaEncryptionKey: Buffer;
  readonly mfaKeyVersion: number;
  readonly ipHashKey: string;
  readonly mediaDir: string;
  readonly mediaPublicBaseUrl: string;
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
    globalRateLimitPerMinute: e.GLOBAL_RATE_LIMIT_PER_MINUTE,
    databaseUrl: e.DATABASE_URL,
    mfaEncryptionKey: Buffer.from(e.MFA_ENCRYPTION_KEY, "base64"),
    mfaKeyVersion: e.MFA_ENCRYPTION_KEY_VERSION,
    ipHashKey: e.IP_HASH_KEY,
    mediaDir: e.MEDIA_DIR,
    mediaPublicBaseUrl: e.MEDIA_PUBLIC_BASE_URL,
    paymentProvider:
      e.PAYMENT_PROVIDER ?? (e.NODE_ENV === "production" ? "none" : "mock"),
    mockPaymentSecret: e.MOCK_PAYMENT_SECRET ?? null,
  };
}
