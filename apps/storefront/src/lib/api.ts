// Storefront API client: same-origin through the dev proxy, cookies only.
// Writes send the double-submit CSRF token (D-045), fetched once and reused.

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
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as {
    error?: { code: string; message: string; details?: unknown };
  } | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      body?.error?.code ?? "INTERNAL_ERROR",
      body?.error?.message ?? "Something went wrong.",
      body?.error?.details,
    );
  return body as T;
}

export async function get<T>(
  path: string,
  query?: URLSearchParams | Record<string, string | undefined>,
  headers: Record<string, string> = {},
): Promise<T> {
  const params =
    query instanceof URLSearchParams
      ? query
      : new URLSearchParams(
          Object.entries(query ?? {}).filter((e): e is [string, string] =>
            Boolean(e[1]),
          ),
        );
  const qs = params.toString();
  return parse<T>(
    await fetch(`/api/v1${path}${qs ? `?${qs}` : ""}`, {
      credentials: "same-origin",
      headers,
    }),
  );
}

let csrf: Promise<string> | null = null;
function csrfToken(): Promise<string> {
  csrf ??= fetch("/api/v1/auth/csrf", { credentials: "same-origin" })
    .then((r) => r.json() as Promise<{ csrfToken: string }>)
    .then((b) => b.csrfToken);
  return csrf;
}

export async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const attempt = async () =>
    fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        ...headers,
        "X-CSRF-Token": await csrfToken(),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  let res = await attempt();
  if (res.status === 403) {
    // The token expires after 12 hours; fetch a fresh one once.
    csrf = null;
    res = await attempt();
  }
  return parse<T>(res);
}
