import express, { type RequestHandler } from "express";

import { AppError } from "./errors.ts";

export const JSON_LIMIT = "100kb";

function hasBody(headers: {
  "content-length"?: string;
  "transfer-encoding"?: string;
}): boolean {
  const length = headers["content-length"];
  return (
    headers["transfer-encoding"] !== undefined ||
    (length !== undefined && length !== "0")
  );
}

/** The one route that takes a raw image body instead of JSON (Phase 8). */
export const IMAGE_UPLOAD_PATH = "/api/v1/admin/media";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

function isImageUpload(req: Parameters<RequestHandler>[0]): boolean {
  return (
    req.method === "POST" &&
    req.path.toLowerCase() === IMAGE_UPLOAD_PATH &&
    typeof req.is(IMAGE_TYPES) === "string"
  );
}

/**
 * Rejects request bodies that are not `application/json` with 415 (D-046),
 * except an image body on the admin media upload route.
 */
export const requireJson: RequestHandler = (req, _res, next) => {
  if (
    hasBody(req.headers) &&
    !req.is("application/json") &&
    !isImageUpload(req)
  ) {
    return next(new AppError("UNSUPPORTED_MEDIA_TYPE"));
  }
  next();
};

/** Payment webhooks: the exact bytes are kept for the signature check (Phase 15). */
export const WEBHOOK_PATH_PREFIX = "/api/v1/webhooks/";

/** JSON parser limited to 100 KB; parse and size errors map to documented codes. */
export const jsonBody: RequestHandler = express.json({
  limit: JSON_LIMIT,
  type: "application/json",
  strict: true,
  verify: (req, _res, buf) => {
    const url = (req as { url?: string }).url ?? "";
    if (url.toLowerCase().startsWith(WEBHOOK_PATH_PREFIX))
      (req as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
  },
});
