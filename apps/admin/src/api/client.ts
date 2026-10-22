// The admin API client (phase-8-ui-plan.md §3.2): a small fetch wrapper, no
// server-state library (U8-2). Same-origin through the dev proxy (D-132), so
// the API's __Host- cookies are sent. State-changing requests carry
// X-CSRF-Token: the session's token once signed in (D-068), otherwise the
// double-submit token from GET /auth/csrf. Errors become ApiError with the
// documented code, message and field errors (api-specification.md §2).
import {
  VALIDATION_CODES,
  validationMessage,
  type ValidationCode,
} from "@sanea/shared";

export const API_BASE = "/api/v1";

export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }

  /** Field errors keyed by field name (the `body.` prefix removed). */
  get fieldErrors(): FieldErrors {
    return fieldErrorsOf(this.details);
  }
}

/** Messages for codes outside the shared validation set. */
const EXTRA_MESSAGES: Record<string, string> = {
  MFA_CODE_INVALID:
    "That code is not correct. Check the time on your phone and enter the current code.",
  MFA_NOT_STARTED: "Set up your authenticator app first.",
  TOO_COMMON: "This password is too common. Choose a less predictable one.",
};

export function messageForCode(code: unknown): string {
  if (typeof code !== "string") return "This value is not valid.";
  if (code in EXTRA_MESSAGES) return EXTRA_MESSAGES[code]!;
  if (Object.hasOwn(VALIDATION_CODES, code))
    return validationMessage(code as ValidationCode);
  return "This value is not valid.";
}

export function fieldErrorsOf(details: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!Array.isArray(details)) return out;
  for (const item of details as {
    path?: unknown;
    code?: unknown;
    message?: unknown;
  }[]) {
    if (typeof item?.path !== "string") continue;
    const key = item.path.replace(/^(body|query|params)(\.|$)/, "");
    if (!key || key in out) continue;
    out[key] =
      typeof item.message === "string" && item.message
        ? item.message
        : messageForCode(item.code);
  }
  return out;
}

export const NETWORK_MESSAGE =
  "The server could not be reached. Check your connection and try again.";

let sessionToken: string | null = null;
let guestToken: Promise<string> | null = null;
let onUnauthenticated: (() => void) | null = null;

/**
 * Set from GET /admin/auth/me or the 2FA step; cleared on sign-out. Any
 * change of session also drops the cached guest token, so the next anonymous
 * request fetches a fresh one.
 */
export function setSessionCsrfToken(token: string | null): void {
  sessionToken = token;
  guestToken = null;
}

/** Called when any request answers 401 UNAUTHENTICATED (session expired). */
export function setUnauthenticatedHandler(fn: (() => void) | null): void {
  onUnauthenticated = fn;
}

export async function errorFrom(response: Response): Promise<ApiError> {
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
      typeof error.requestId === "string" ? error.requestId : undefined,
    );
  return new ApiError(
    response.status,
    response.status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN",
    "Something went wrong. Try again.",
  );
}

function guestCsrf(): Promise<string> {
  guestToken ??= fetch(`${API_BASE}/auth/csrf`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(async (r) => {
      if (!r.ok) throw await errorFrom(r);
      return ((await r.json()) as { csrfToken: string }).csrfToken;
    })
    .catch((error: unknown) => {
      guestToken = null;
      throw error;
    });
  return guestToken;
}

export async function csrfToken(): Promise<string> {
  return sessionToken ?? (await guestCsrf());
}

/** Handles the shared failure rules after a non-2xx response. */
export function noteFailure(error: ApiError): void {
  if (error.status === 401 && error.code === "UNAUTHENTICATED")
    onUnauthenticated?.();
  // A guest token can expire (12 h); fetch a fresh one next time.
  if (error.code === "CSRF_FAILED" && !sessionToken) guestToken = null;
}

type Options = { body?: unknown; signal?: AbortSignal };

export async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
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
    noteFailure(error);
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, options?: Options) => request<T>("GET", path, options),
  post: <T>(path: string, body?: unknown, options?: Options) =>
    request<T>("POST", path, { ...options, body }),
  patch: <T>(path: string, body: unknown, options?: Options) =>
    request<T>("PATCH", path, { ...options, body }),
  put: <T>(path: string, body: unknown, options?: Options) =>
    request<T>("PUT", path, { ...options, body }),
  delete: <T = void>(path: string, options?: Options) =>
    request<T>("DELETE", path, options),
};

/** Any thrown value as an ApiError, for display. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError(0, "UNKNOWN", "Something went wrong. Try again.");
}

/** A query string from defined values only. */
export function query(
  params: Record<string, string | number | undefined>,
): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** A client-side problem shown like an API error (before anything is sent). */
export const localError = (message: string) =>
  new ApiError(400, "VALIDATION_FAILED", message);

/** The same error with a clearer message for this screen. */
export const withMessage = (error: ApiError, message: string) =>
  new ApiError(
    error.status,
    error.code,
    message,
    error.details,
    error.requestId,
  );
