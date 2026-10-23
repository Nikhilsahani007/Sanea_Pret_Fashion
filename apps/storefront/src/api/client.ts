// The storefront API client: a small fetch wrapper, no server-state library
// (U8-2, D-098). Same-origin through the dev proxy (D-132), so the API's
// __Host- cookies are sent. State-changing requests carry the guest
// double-submit token from GET /auth/csrf (D-045). Errors become ApiError
// with the documented code and message (api-specification.md §2).
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const NETWORK_MESSAGE =
  "The shop could not be reached. Check your connection and try again.";

async function errorFrom(response: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  const error = (body as { error?: Record<string, unknown> } | undefined)
    ?.error;
  if (error && typeof error.code === "string")
    return new ApiError(
      response.status,
      error.code,
      typeof error.message === "string"
        ? error.message
        : "Something went wrong.",
      error.details,
    );
  return new ApiError(
    response.status,
    response.status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN",
    "Something went wrong. Try again.",
  );
}

let csrf: Promise<string> | null = null;

function csrfToken(): Promise<string> {
  csrf ??= fetch(`${API_BASE}/auth/csrf`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(async (r) => {
      if (!r.ok) throw await errorFrom(r);
      return ((await r.json()) as { csrfToken: string }).csrfToken;
    })
    .catch((error: unknown) => {
      csrf = null;
      throw error;
    });
  return csrf;
}

type Options = { body?: unknown; signal?: AbortSignal | undefined };

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  { body, signal }: Options = {},
): Promise<T> {
  const headers = new Headers({ Accept: "application/json" });
  let response: Response;
  try {
    if (method !== "GET") headers.set("X-CSRF-Token", await csrfToken());
    if (body !== undefined) headers.set("Content-Type", "application/json");
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      credentials: "same-origin",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError(0, "NETWORK_ERROR", NETWORK_MESSAGE);
  }
  if (!response.ok) {
    const error = await errorFrom(response);
    // A guest token lasts 12 hours; fetch a fresh one next time.
    if (error.code === "CSRF_FAILED") csrf = null;
    throw error;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) =>
    request<T>("GET", path, { signal }),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, { body }),
  patch: <T>(path: string, body: unknown) =>
    request<T>("PATCH", path, { body }),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export function toApiError(error: unknown): ApiError {
  return error instanceof ApiError
    ? error
    : new ApiError(0, "UNKNOWN", "Something went wrong. Try again.");
}

/** Test seam: forget the cached CSRF token. */
export function resetCsrf(): void {
  csrf = null;
}
