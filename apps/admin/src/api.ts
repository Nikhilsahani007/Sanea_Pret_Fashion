// Thin client for /api/v1. Same-origin through the dev proxy, cookies only
// (no tokens in storage). State-changing requests send the CSRF token: the
// session-bound one after sign-in, a double-submit one before (D-068).

export type FieldError = { path: string; code: string; message: string };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  constructor(status: number, code: string, message: string, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** Field errors from a 400 VALIDATION_FAILED, keyed by path without `body.`. */
  fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    const out: Record<string, string> = {};
    for (const d of this.details as FieldError[])
      out[d.path.replace(/^body\.?/, "")] ??= d.message;
    return out;
  }
}

let sessionCsrf: string | null = null;
export function setSessionCsrf(token: string | null): void {
  sessionCsrf = token;
}

async function anonymousCsrf(): Promise<string> {
  const res = await fetch("/api/v1/auth/csrf", { credentials: "same-origin" });
  const body = (await res.json()) as { csrfToken: string };
  return body.csrfToken;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string; details?: unknown };
  } | null;
  if (!res.ok) {
    const e = body?.error;
    throw new ApiError(
      res.status,
      e?.code ?? "INTERNAL_ERROR",
      e?.message ?? "Something went wrong.",
      e?.details,
    );
  }
  return body as T;
}

export async function get<T>(
  path: string,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const qs = query
    ? "?" +
      new URLSearchParams(
        Object.entries(query).filter(
          (e): e is [string, string] => e[1] !== undefined && e[1] !== "",
        ),
      ).toString()
    : "";
  return parse<T>(
    await fetch(`/api/v1${path}${qs}`, { credentials: "same-origin" }),
  );
}

export async function send<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options: { contentType?: string; headers?: Record<string, string> } = {},
): Promise<T> {
  const csrf = sessionCsrf ?? (await anonymousCsrf());
  const isJson = options.contentType === undefined;
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      "X-CSRF-Token": csrf,
      ...(body !== undefined
        ? { "Content-Type": options.contentType ?? "application/json" }
        : {}),
      ...options.headers,
    },
    ...(body !== undefined
      ? { body: isJson ? JSON.stringify(body) : (body as BodyInit) }
      : {}),
  });
  return parse<T>(res);
}
