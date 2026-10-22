// POST /api/v1/admin/media: the image upload (D-077 to D-080, D-088, QP-1 to
// QP-7, T-1 to T-7, safeguard 1; phase-8-plan.md §5.4 and §5.7).
//
// Order of work for one request:
//  1. Before admission, using no capacity: permission (route guard), the
//     declared Content-Type and a declared Content-Length over 15 MB.
//  2. Admission: active at once, or waiting, or 429 UPLOAD_QUEUE_FULL. The
//     body is not read while waiting (backpressure). The 60 s deadline starts.
//  3. Active: the body is streamed to a job folder with a strict 15 MB limit,
//     the first bytes are checked, and a child process makes the files.
//  4. Commit only if the deadline has not passed; then the files move into
//     storage and the media record is written. Otherwise nothing is saved.
// Every path removes the job folder and releases the reservation once.
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { Request, RequestHandler, Response } from "express";
import type { Logger } from "pino";

import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError, type ApiErrorCode } from "../../platform/http/errors.ts";
import type { Db } from "../../platform/db.ts";
import { recordAudit } from "../audit/record.ts";
import {
  MAGIC_LENGTH,
  declaredFormat,
  sniffImage,
  type ImageFormat,
} from "./magic.ts";
import type { RejectionCode } from "./protocol.ts";
import { QueueCancelled, QueueWaitTimeout, type UploadQueue } from "./queue.ts";
import { newAssetPrefix, type MediaStorage } from "./storage.ts";
import {
  WorkerAborted,
  WorkerFailed,
  WorkerTimeout,
  runImageWorker,
} from "./worker-runner.ts";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const IMAGE_415_MESSAGE = "Upload a JPEG, PNG or WebP image.";
export const FILENAME_HEADER = "x-upload-filename";

export type UploadDeps = {
  readonly db: Db;
  readonly logger: Logger;
  readonly ipHashKey: string;
  readonly queue: UploadQueue;
  readonly storage: MediaStorage;
  /** Job folders live under the storage root, so moves are same-disk renames. */
  readonly tmpDir: string;
  readonly workerPath?: string;
  readonly now?: () => number;
};

class BodyTooLarge extends Error {}

/** Keeps a short, safe display name; never used in paths or logs. */
export function sanitiseFilename(raw: unknown, format: ImageFormat): string {
  const value = typeof raw === "string" ? raw : "";
  const cleaned = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._ -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return cleaned && !/^\.+$/.test(cleaned) ? cleaned : `upload.${format}`;
}

const REJECTION: Record<RejectionCode, () => AppError> = {
  UNSUPPORTED: () =>
    new AppError("UNSUPPORTED_MEDIA_TYPE", undefined, IMAGE_415_MESSAGE),
  MULTIPAGE: () =>
    new AppError("UNSUPPORTED_MEDIA_TYPE", undefined, IMAGE_415_MESSAGE),
  TOO_LARGE: () =>
    new AppError("VALIDATION_FAILED", [
      {
        path: "body",
        code: "TOO_LONG",
        message: "Images may be at most 8000 × 8000 pixels.",
      },
    ]),
  CORRUPT: () =>
    new AppError("VALIDATION_FAILED", [
      {
        path: "body",
        code: "INVALID",
        message: "The image could not be read.",
      },
    ]),
};

export function uploadHandler(deps: UploadDeps): RequestHandler {
  const now = deps.now ?? Date.now;
  return (req, res, next) => {
    void handleUpload(deps, now, req, res).catch(next);
  };
}

async function handleUpload(
  deps: UploadDeps,
  now: () => number,
  req: Request,
  res: Response,
): Promise<void> {
  const started = now();
  const log = (outcome: string, extra: Record<string, unknown> = {}) =>
    deps.logger.info(
      {
        event: "media.upload",
        outcome,
        ms: now() - started,
        queue: { ...deps.queue.stats },
        ...extra,
      },
      "media upload",
    );
  const closeAfter = () => res.setHeader("Connection", "close");

  // 1. Before admission.
  const format = declaredFormat(req.headers["content-type"]);
  if (!format) {
    closeAfter();
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", undefined, IMAGE_415_MESSAGE);
  }
  const declared = req.headers["content-length"];
  if (declared !== undefined && Number(declared) > MAX_UPLOAD_BYTES) {
    closeAfter();
    throw new AppError("PAYLOAD_TOO_LARGE");
  }

  // 2. Admission.
  const job = deps.queue.admit();
  if (!job) {
    closeAfter();
    // This 429 comes from the queue, not the rate limiter: no Retry-After or
    // RateLimit headers (the global limiter adds them to every response).
    for (const h of ["RateLimit", "RateLimit-Policy", "Retry-After"])
      res.removeHeader(h);
    log("queue_full");
    throw new AppError("UPLOAD_QUEUE_FULL");
  }

  const abort = new AbortController();
  let clientGone = false;
  let deadlinePassed = false;
  let committing = false;
  const onClose = () => {
    if (res.writableFinished) return;
    clientGone = true;
    abort.abort();
    // A waiting job leaves the queue at once (QP-6).
    if (job.state === "waiting") job.release();
  };
  res.on("close", onClose);
  const deadline = setTimeout(() => {
    if (committing) return;
    deadlinePassed = true;
    abort.abort();
    if (job.state === "waiting") job.release();
  }, job.remainingMs(now()));

  const canRespond = () => !clientGone && !res.headersSent && !res.destroyed;
  const fail = (code: ApiErrorCode, outcome: string): never => {
    closeAfter();
    log(outcome);
    throw new AppError(code);
  };

  let jobDir: string | undefined;
  try {
    try {
      await Promise.race([
        job.turn,
        new Promise<never>((_, reject) =>
          abort.signal.addEventListener(
            "abort",
            () => reject(new QueueCancelled()),
            { once: true },
          ),
        ),
      ]);
    } catch (error) {
      if (clientGone) return log("client_gone_waiting");
      if (error instanceof QueueWaitTimeout || deadlinePassed)
        return fail("UPLOAD_QUEUE_TIMEOUT", "queue_timeout");
      throw error;
    }
    const waitedMs = now() - job.admittedAt;

    // 3. Active: stream the body to the job folder (no full buffering).
    await mkdir(deps.tmpDir, { recursive: true });
    jobDir = await mkdtemp(join(deps.tmpDir, "job-"));
    const inputPath = join(jobDir, "input");
    const outDir = join(jobDir, "out");
    await mkdir(outDir);
    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        if (received > MAX_UPLOAD_BYTES) return callback(new BodyTooLarge());
        callback(null, chunk);
      },
    });
    try {
      await pipeline(req, limit, createWriteStream(inputPath), {
        signal: abort.signal,
      });
    } catch (error) {
      if (clientGone) return log("client_gone_body");
      if (deadlinePassed) {
        deps.queue.stats.processingTimeouts++;
        return fail("UPLOAD_PROCESSING_TIMEOUT", "deadline_during_body");
      }
      if (error instanceof BodyTooLarge)
        return fail("PAYLOAD_TOO_LARGE", "too_large");
      throw error;
    }

    const head = Buffer.alloc(MAGIC_LENGTH);
    const fh = await open(inputPath, "r");
    try {
      await fh.read(head, 0, MAGIC_LENGTH, 0);
    } finally {
      await fh.close();
    }
    if (
      sniffImage(head.subarray(0, Math.min(received, MAGIC_LENGTH))) !== format
    ) {
      log("type_mismatch");
      throw new AppError(
        "UNSUPPORTED_MEDIA_TYPE",
        undefined,
        IMAGE_415_MESSAGE,
      );
    }

    const processStarted = now();
    let result;
    try {
      result = await runImageWorker({
        inputPath,
        outDir,
        format,
        timeoutMs: job.remainingMs(now()),
        signal: abort.signal,
        ...(deps.workerPath ? { workerPath: deps.workerPath } : {}),
        onSlowExit: () =>
          deps.logger.error(
            { event: "media.worker_slow_exit" },
            "image worker did not exit",
          ),
      });
    } catch (error) {
      if (clientGone) return log("client_gone_processing");
      if (error instanceof WorkerTimeout || deadlinePassed) {
        deps.queue.stats.processingTimeouts++;
        return fail("UPLOAD_PROCESSING_TIMEOUT", "deadline_during_processing");
      }
      if (error instanceof WorkerAborted) return log("aborted");
      if (error instanceof WorkerFailed) {
        deps.queue.stats.failures++;
        deps.logger.error(
          { event: "media.worker_failed", reason: error.message },
          "image worker failed",
        );
        throw new AppError("INTERNAL_ERROR");
      }
      throw error;
    }
    if (!result.ok) {
      log("rejected", { reason: result.code });
      throw REJECTION[result.code]();
    }

    // 4. Commit, only before the deadline and while the client is connected.
    if (deadlinePassed || clientGone || now() >= job.deadlineAt) {
      if (clientGone) return log("client_gone_commit");
      deps.queue.stats.processingTimeouts++;
      return fail("UPLOAD_PROCESSING_TIMEOUT", "deadline_before_commit");
    }
    committing = true;
    clearTimeout(deadline);
    const admin = adminContext(res)!.admin;
    const prefix = newAssetPrefix();
    const masterName = `master.${result.format}`;
    const keys: string[] = [];
    const variants: {
      key: string;
      format: string;
      width: number;
      height: number;
      bytes: number;
    }[] = [];
    try {
      for (const f of result.files) {
        const key = `${prefix}/${f.name}`;
        keys.push(key);
        if (f.name === masterName)
          await deps.storage.putPrivate(key, join(outDir, f.name));
        else {
          await deps.storage.putPublic(key, join(outDir, f.name));
          variants.push({
            key,
            format: f.format,
            width: f.width,
            height: f.height,
            bytes: f.bytes,
          });
        }
      }
      variants.sort(
        (a, b) => a.width - b.width || a.format.localeCompare(b.format),
      );
      const asset = await deps.db.$transaction(async (tx) => {
        const created = await tx.mediaAsset.create({
          data: {
            storageKey: `${prefix}/${masterName}`,
            originalFilename: sanitiseFilename(
              req.headers[FILENAME_HEADER],
              result.format,
            ),
            mimeType: `image/${result.format}`,
            width: result.width,
            height: result.height,
            bytes: received,
            variants,
            uploadedByAdminId: admin.id,
          },
        });
        await recordAudit(tx, deps.ipHashKey, {
          actorAdminId: admin.id,
          action: "media.uploaded",
          entityType: "media_asset",
          entityId: created.id,
          after: {
            mimeType: created.mimeType,
            width: created.width,
            height: created.height,
            bytes: received,
          },
          ip: req.ip,
        });
        return created;
      });
      deps.queue.stats.completed++;
      log("saved", {
        bytes: received,
        width: result.width,
        height: result.height,
        format: result.format,
        waitedMs,
        processMs: now() - processStarted,
      });
      if (canRespond()) res.status(201).json(mediaView(asset, deps.storage));
    } catch (error) {
      await deps.storage.remove(keys);
      throw error;
    }
  } finally {
    clearTimeout(deadline);
    res.off("close", onClose);
    if (jobDir) await rm(jobDir, { recursive: true, force: true });
    job.release();
  }
}

type AssetRow = {
  id: string;
  mimeType: string;
  width: number;
  height: number;
  bytes: number;
  variants: unknown;
  createdAt: Date;
};

/** The admin view of a media asset: derivative URLs only, never the original. */
export function mediaView(asset: AssetRow, storage: MediaStorage) {
  const variants = Array.isArray(asset.variants)
    ? (asset.variants as {
        key: string;
        format: string;
        width: number;
        height: number;
      }[])
    : [];
  return {
    id: asset.id,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    bytes: asset.bytes,
    createdAt: asset.createdAt,
    derivatives: variants.map((v) => ({
      format: v.format,
      width: v.width,
      height: v.height,
      url: storage.publicUrl(v.key),
    })),
  };
}
