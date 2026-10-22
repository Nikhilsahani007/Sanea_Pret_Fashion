// Helpers shared by the catalogue and search routers.
import type { RequestHandler, Response } from "express";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../platform/http/errors.ts";
import type { MediaStorage } from "../media/storage.ts";

export const handle =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export type Input<B = unknown, P = unknown, Q = unknown> = {
  body: B;
  params: P;
  query: Q;
};
export const input = <B = unknown, P = unknown, Q = unknown>(res: Response) =>
  res.locals.input as Input<B, P, Q>;

export const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

/** Public catalogue responses: 60 s HTTP caching only, no server cache (Q8-5). */
export const publicCache: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  next();
};

/**
 * Maps database errors to documented codes: unique or foreign-key conflicts
 * are `409 CONFLICT`, a missing row `404 NOT_FOUND`. Other errors pass on.
 */
export function mapDbError(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2003")
      return new AppError("CONFLICT");
    if (error.code === "P2025") return new AppError("NOT_FOUND");
  }
  return error;
}

export async function db<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapDbError(error);
  }
}

// ── Cursors: opaque to clients, strictly validated (phase-8-plan.md §5.3) ──

export function encodeCursor(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeCursor<T>(
  raw: string | undefined,
  schema: z.ZodType<T>,
): T | undefined {
  if (raw === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]{1,400}$/.test(raw)) throw new Error("format");
    const parsed = schema.safeParse(
      JSON.parse(Buffer.from(raw, "base64url").toString("utf8")),
    );
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  throw new AppError("VALIDATION_FAILED", [
    {
      path: "query.cursor",
      code: "INVALID",
      message: "This value is not valid.",
    },
  ]);
}

// ── Image views: derivative URLs only, never the original (safeguard 1) ──

type Derivative = {
  key: string;
  format: string;
  width: number;
  height: number;
};

export function derivativesOf(variants: unknown): Derivative[] {
  if (!Array.isArray(variants)) return [];
  return variants.filter(
    (v): v is Derivative =>
      typeof v === "object" &&
      v !== null &&
      typeof (v as Derivative).key === "string" &&
      typeof (v as Derivative).width === "number",
  );
}

export function imageView(
  image: {
    colourId: string | null;
    alt: string;
    role: string;
    position: number;
    mediaAsset: { width: number; height: number; variants: unknown };
  },
  storage: MediaStorage,
) {
  // A small original gives identical files at the larger nominal widths
  // (never upscaled); keep one per format and actual width, the smallest name.
  const nominal = (key: string) => Number(/\/(\d+)\.\w+$/.exec(key)?.[1] ?? 0);
  const unique = new Map<string, Derivative>();
  for (const d of [...derivativesOf(image.mediaAsset.variants)].sort(
    (a, b) => nominal(a.key) - nominal(b.key),
  )) {
    const id = `${d.format}:${d.width}`;
    if (!unique.has(id)) unique.set(id, d);
  }
  const sources = [...unique.values()].map((d) => ({
    format: d.format,
    width: d.width,
    height: d.height,
    url: storage.publicUrl(d.key),
  }));
  // Default: the 1440 px WebP (or the widest WebP when the original is smaller).
  const webp = sources
    .filter((s) => s.format === "webp")
    .sort((a, b) => a.width - b.width);
  const main =
    webp.find((s) => s.width >= 1440) ?? webp.at(-1) ?? sources.at(-1);
  return {
    colourId: image.colourId,
    alt: image.alt,
    role: image.role,
    position: image.position,
    url: main?.url ?? null,
    width: main?.width ?? image.mediaAsset.width,
    height: main?.height ?? image.mediaAsset.height,
    sources,
  };
}
