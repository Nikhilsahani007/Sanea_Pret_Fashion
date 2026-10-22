// /api/v1/admin/media (O M C, `products.editContent`): upload and list.
// The upload router is mounted before the JSON body middleware, so the raw
// image body is never parsed or buffered by it (D-079).
import { join } from "node:path";

import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { requirePermission } from "../auth/middleware.ts";
import { UploadQueue, UPLOAD_TIMINGS, type QueueTimings } from "./queue.ts";
import { LocalDiskStorage, type MediaStorage } from "./storage.ts";
import { mediaView, uploadHandler } from "./upload.ts";

export const MEDIA_PREFIX = "/api/v1/admin/media";

/** Test seams only; production uses the fixed timings and the real worker. */
export type MediaOptions = {
  readonly timings?: QueueTimings;
  readonly workerPath?: string;
};

export type MediaService = {
  readonly queue: UploadQueue;
  readonly storage: MediaStorage;
  readonly tmpDir: string;
  readonly workerPath?: string;
};

export function createMediaService(
  deps: AuthDeps,
  options: MediaOptions = {},
): MediaService {
  return {
    queue: new UploadQueue(
      deps.config.mediaUploadQueueWaiting,
      options.timings ?? UPLOAD_TIMINGS,
    ),
    storage: new LocalDiskStorage(
      deps.config.mediaStorageDir,
      deps.config.mediaPublicBaseUrl,
    ),
    tmpDir: join(deps.config.mediaStorageDir, "tmp"),
    ...(options.workerPath ? { workerPath: options.workerPath } : {}),
  };
}

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

/** POST only; mounted before `requireJson` and `jsonBody`. */
export function mediaUploadRouter(deps: AuthDeps, media: MediaService): Router {
  const router = Router();
  router.post(
    MEDIA_PREFIX,
    noStore,
    requirePermission("products.editContent"),
    uploadHandler({
      db: deps.db,
      logger: deps.logger,
      ipHashKey: deps.config.ipHashKey,
      queue: media.queue,
      storage: media.storage,
      tmpDir: media.tmpDir,
      ...(media.workerPath ? { workerPath: media.workerPath } : {}),
    }),
  );
  return router;
}

const listQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(24),
    cursor: z.uuid().optional(),
  })
  .strict();

export function mediaRouter(deps: AuthDeps, media: MediaService): Router {
  const router = Router();
  router.get(
    MEDIA_PREFIX,
    noStore,
    requirePermission("products.editContent"),
    validate({ query: listQuery }),
    (_req, res, next) => {
      const { limit, cursor } = (
        res.locals.input as { query: z.infer<typeof listQuery> }
      ).query;
      deps.db.mediaAsset
        .findMany({
          // UUID v7 ids sort by creation time; newest first.
          where: cursor ? { id: { lt: cursor } } : {},
          orderBy: { id: "desc" },
          take: limit + 1,
        })
        .then((rows) => {
          const page = rows.slice(0, limit);
          res.json({
            items: page.map((a) => mediaView(a, media.storage)),
            nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
          });
        })
        .catch(next);
    },
  );
  router.all(MEDIA_PREFIX, (_req, _res, next) =>
    next(new AppError("NOT_FOUND")),
  );
  return router;
}
