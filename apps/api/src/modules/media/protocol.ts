// Parent/child message protocol for the image worker (T-4, phase-8-plan.md
// §10c). Version 1. Both sides validate every message; anything else is a
// failure. The worker reports only files it wrote into the job folder.
import { z } from "zod";

export const PROTOCOL_VERSION = 1;

export const DERIVATIVE_WIDTHS = [480, 960, 1440, 2048] as const;
export const DERIVATIVE_FORMATS = ["avif", "webp"] as const;
export const MAX_PIXELS = 8000 * 8000;
export const MAX_SIDE = 8000;
/** Fixed settings (Q8-11): never derived from the CPU count. */
export const LIBVIPS_THREADS = 4;
export const AVIF_EFFORT = 3;
export const AVIF_QUALITY = 50;
export const WEBP_QUALITY = 80;

const format = z.enum(["jpeg", "png", "webp"]);

/** File names a worker may produce; nothing else is accepted. */
export const OUTPUT_NAME =
  /^(?:master\.(?:jpeg|png|webp)|(?:480|960|1440|2048)\.(?:avif|webp))$/;

export const jobMessage = z.strictObject({
  v: z.literal(PROTOCOL_VERSION),
  kind: z.literal("process"),
  inputPath: z.string().min(1),
  outDir: z.string().min(1),
  format,
});
export type JobMessage = z.infer<typeof jobMessage>;

const file = z.strictObject({
  name: z.string().regex(OUTPUT_NAME),
  format: z.enum(["jpeg", "png", "webp", "avif"]),
  width: z.number().int().min(1).max(MAX_SIDE),
  height: z.number().int().min(1).max(MAX_SIDE),
  bytes: z.number().int().min(1),
});

export const REJECTION_CODES = [
  "UNSUPPORTED",
  "MULTIPAGE",
  "TOO_LARGE",
  "CORRUPT",
] as const;
export type RejectionCode = (typeof REJECTION_CODES)[number];

export const resultMessage = z.discriminatedUnion("ok", [
  z.strictObject({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal("result"),
    ok: z.literal(true),
    format,
    width: z.number().int().min(1).max(MAX_SIDE),
    height: z.number().int().min(1).max(MAX_SIDE),
    files: z
      .array(file)
      .length(1 + DERIVATIVE_WIDTHS.length * DERIVATIVE_FORMATS.length),
  }),
  z.strictObject({
    v: z.literal(PROTOCOL_VERSION),
    kind: z.literal("result"),
    ok: z.literal(false),
    code: z.enum(REJECTION_CODES),
  }),
]);
export type ResultMessage = z.infer<typeof resultMessage>;
