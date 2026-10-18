import type { ErrorRequestHandler, RequestHandler } from "express";
import type { Logger } from "pino";

/** API error codes used by the platform layer (api-specification.md §2). */
export const API_ERROR_CODES = {
  VALIDATION_FAILED: { status: 400, message: "The request is not valid." },
  MALFORMED_JSON: {
    status: 400,
    message: "The request body is not valid JSON.",
  },
  CSRF_FAILED: {
    status: 403,
    message: "The request could not be verified. Refresh and try again.",
  },
  NOT_FOUND: { status: 404, message: "Not found." },
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
