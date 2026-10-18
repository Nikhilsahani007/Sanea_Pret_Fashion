import { z } from "zod";

const ORIGIN = /^https?:\/\/[^/\s?#]+$/;

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
  };
}
