import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";

/** API error codes used by the platform layer (api-specification.md §2). */
export const API_ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, message: "The request is not valid." },
  MALFORMED_JSON: {
    status: 400,
    message: "The request body is not valid JSON.",
  },
  INVITE_INVALID: {
    status: 400,
    message: "This link is not valid or has expired.",
  },
  PASSWORD_REJECTED: {
    status: 400,
    message: "Choose a different password.",
  },
  UNAUTHENTICATED: { status: 401, message: "Sign in to continue." },
  // One generic answer for every sign-in failure (D-066).
  SIGN_IN_FAILED: {
    status: 401,
    message: "The details are not correct, or the account is locked.",
  },
  FORBIDDEN: {
    status: 403,
    message: "You do not have permission to do this.",
  },
  CSRF_FAILED: {
    status: 403,
    message: "The request could not be verified. Refresh and try again.",
  },
  NOT_FOUND: { status: 404, message: "Not found." },
  OUT_OF_STOCK: {
    status: 409,
    message: "Some items are no longer available in the quantity requested.",
  },
  CONFLICT: {
    status: 409,
    message: "This change conflicts with the current state.",
  },
  PAYLOAD_TOO_LARGE: { status: 413, message: "The request body is too large." },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: "Send the request body as application/json.",
  },
  RATE_LIMITED: { status: 429, message: "Too many requests. Try again later." },
  INTERNAL_ERROR: { status: 500, message: "Something went wrong." },
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_CODES;

/** An error that becomes a documented API error response. */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ApiErrorCode, details?: unknown) {
    super(API_ERROR_CODES[code].message);
    this.name = "AppError";
    this.code = code;
    this.status = API_ERROR_CODES[code].status;
    this.details = details;
  }
}

export type ErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

export function errorBody(
  code: ApiErrorCode,
  requestId: string,
  details?: unknown,
): ErrorBody {
  const body: ErrorBody = {
    error: { code, message: API_ERROR_CODES[code].message, requestId },
  };
  if (details !== undefined) body.error.details = details;
  return body;
}

/** Maps body-parser errors to documented codes. */
function fromBodyParser(err: unknown): AppError | undefined {
  const type = (err as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed") return new AppError("MALFORMED_JSON");
  if (type === "entity.too.large") return new AppError("PAYLOAD_TOO_LARGE");
  if (type === "encoding.unsupported" || type === "charset.unsupported") {
    return new AppError("UNSUPPORTED_MEDIA_TYPE");
  }
  return undefined;
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError("NOT_FOUND"));
};

/** Final error handler: documented shape, no stack traces in responses. */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  // Express recognises error handlers by their four parameters, so `_next` must stay.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err, req, res, _next) => {
    const appError = err instanceof AppError ? err : fromBodyParser(err);
    const requestId = String(req.id ?? "");
    if (appError) {
      res
        .status(appError.status)
        .json(errorBody(appError.code, requestId, appError.details));
      return;
    }
    logger.error({ err, requestId }, "unhandled error");
    res.status(500).json(errorBody("INTERNAL_ERROR", requestId));
  };
}
