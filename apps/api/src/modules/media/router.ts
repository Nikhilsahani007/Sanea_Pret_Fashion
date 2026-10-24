// /api/v1/admin/media (O M C): upload one image as the raw request body
// (Content-Type image/jpeg, image/png or image/webp, at most 15 MB), and list
// uploaded assets. A raw body instead of multipart avoids a parser
// dependency; the documented contract is otherwise unchanged (phase-8-plan.md).
import express, { Router } from "express";
import { z } from "zod";

import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle, input, noStore } from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import { requirePermission } from "../auth/middleware.ts";
import type { ModuleDeps } from "../deps.ts";
import { ImageRejected, MAX_UPLOAD_BYTES, processImage } from "./image.ts";
import { mediaUrl, type StoredVariant } from "./storage.ts";
import { parseVariants } from "./urls.ts";

export const MEDIA_PATH = "/api/v1/admin/media";
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp"];

const EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const listQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(48),
    before: z.uuid().optional(),
  })
  .strict();

/** Keeps a display name only: no path, no control characters, 200 chars. */
export function cleanFilename(raw: unknown): string {
  if (typeof raw !== "string") return "upload";
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // keep the raw header value
  }
  name = name.split(/[\\/]/).pop() ?? "";
  name = name
    // eslint-disable-next-line no-control-regex -- strips control characters
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 200);
  return name || "upload";
}

type AssetRow = {
  id: string;
  originalFilename: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  variants: unknown;
  createdAt: Date;
};

export function assetView(baseUrl: string, a: AssetRow) {
  return {
    id: a.id,
    originalFilename: a.originalFilename,
    mimeType: a.mimeType,
    width: a.width,
    height: a.height,
    bytes: a.bytes,
    createdAt: a.createdAt,
    variants: parseVariants(a.variants).map((v) => ({
      format: v.format,
      width: v.width,
      height: v.height,
      url: mediaUrl(baseUrl, v.path),
    })),
  };
}

export function mediaRouter(deps: ModuleDeps): Router {
  const router = Router();
  const base = deps.config.mediaPublicBaseUrl;
  router.use(MEDIA_PATH, noStore);

  router.post(
    MEDIA_PATH,
    requirePermission("products.editContent"),
    express.raw({ type: UPLOAD_TYPES, limit: MAX_UPLOAD_BYTES }),
    handle(async (req, res) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0)
        throw new AppError("UNSUPPORTED_MEDIA_TYPE");
      const data: Buffer = req.body;
      let processed;
      try {
        processed = await processImage(data);
      } catch (error) {
        if (error instanceof ImageRejected)
          throw new AppError("VALIDATION_FAILED", [
            {
              path: "body",
              code: "INVALID",
              message: imageMessage(error.reason),
            },
          ]);
        throw error;
      }
      const key = deps.media.newKey();
      await deps.media.putOriginal(key, EXTENSION[processed.mimeType], data);
      const variants: StoredVariant[] = [];
      for (const d of processed.derivatives) {
        const path = `${key}/${d.width}.${d.format}`;
        await deps.media.putPublic(path, d.data);
        variants.push({
          format: d.format,
          width: d.width,
          height: d.height,
          path,
        });
      }
      const admin = adminContext(res)!.admin;
      const asset = await deps.db.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            storageKey: key,
            originalFilename: cleanFilename(req.get("x-filename")),
            mimeType: processed.mimeType,
            width: processed.width,
            height: processed.height,
            bytes: data.length,
            variants,
            uploadedByAdminId: admin.id,
          },
        });
        await recordAudit(tx, deps.config.ipHashKey, {
          actorAdminId: admin.id,
          action: "media.uploaded",
          entityType: "media_asset",
          entityId: created.id,
          after: {
            mimeType: created.mimeType,
            width: created.width,
            height: created.height,
            bytes: created.bytes,
          },
          ip: req.ip,
        });
        return created;
      });
      res.status(201).json({ asset: assetView(base, asset) });
    }),
  );

  router.get(
    MEDIA_PATH,
    requirePermission("products.editContent"),
    validate({ query: listQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof listQuery>>(res);
      const rows = await deps.db.mediaAsset.findMany({
        where: query.before ? { id: { lt: query.before } } : {},
        orderBy: { id: "desc" },
        take: query.limit,
      });
      res.json({
        assets: rows.map((a) => assetView(base, a)),
        nextBefore: rows.length === query.limit ? rows.at(-1)!.id : null,
      });
    }),
  );
  return router;
}

function imageMessage(reason: ImageRejected["reason"]): string {
  switch (reason) {
    case "UNSUPPORTED_TYPE":
      return "Upload a JPEG, PNG or WebP image.";
    case "TOO_LARGE":
      return "Images can be at most 8000 × 8000 pixels.";
    case "UNREADABLE":
      return "This image could not be read.";
  }
}
