// Image worker: runs in its own child process, one job per process (T-4).
// The parent kills it at the job deadline, because sharp's timeout does not
// stop AVIF encoding (phase-8-plan.md §10c). It gets no secrets: the parent
// passes an empty environment. It reads one input file and writes only into
// the job folder it is given.
import { join } from "node:path";
import { stat } from "node:fs/promises";

import sharp from "sharp";

import {
  AVIF_EFFORT,
  AVIF_QUALITY,
  DERIVATIVE_FORMATS,
  DERIVATIVE_WIDTHS,
  LIBVIPS_THREADS,
  MAX_PIXELS,
  MAX_SIDE,
  PROTOCOL_VERSION,
  WEBP_QUALITY,
  jobMessage,
  type JobMessage,
  type RejectionCode,
  type ResultMessage,
} from "./protocol.ts";

sharp.concurrency(LIBVIPS_THREADS);
sharp.cache(false);

function send(message: ResultMessage): Promise<void> {
  return new Promise((resolve) => {
    if (!process.send) return resolve();
    process.send(message, undefined, {}, () => resolve());
  });
}

const reject = (code: RejectionCode) =>
  send({ v: PROTOCOL_VERSION, kind: "result", ok: false, code });

async function run(job: JobMessage): Promise<void> {
  const options = {
    limitInputPixels: MAX_PIXELS,
    failOn: "warning",
    pages: 1,
  } as const;
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    // Header only: no pixels are decoded here.
    meta = await sharp(job.inputPath, options).metadata();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return reject(/pixel limit/i.test(message) ? "TOO_LARGE" : "CORRUPT");
  }
  // sharp also reads SVG, GIF, TIFF and HEIF; only the declared format passes.
  if (meta.format !== job.format) return reject("UNSUPPORTED");
  if ((meta.pages ?? 1) > 1) return reject("MULTIPAGE");
  if (!meta.width || !meta.height) return reject("CORRUPT");
  if (meta.width > MAX_SIDE || meta.height > MAX_SIDE)
    return reject("TOO_LARGE");

  const files: Extract<ResultMessage, { ok: true }>["files"] = [];
  try {
    // Re-encoding strips EXIF, GPS, XMP and other metadata (D-077).
    const base = sharp(job.inputPath, options).autoOrient();
    const masterName = `master.${job.format}`;
    const master = await base
      .clone()
      .toFormat(job.format)
      .toFile(join(job.outDir, masterName));
    files.push({
      name: masterName,
      format: job.format,
      width: master.width,
      height: master.height,
      bytes: (await stat(join(job.outDir, masterName))).size,
    });
    for (const width of DERIVATIVE_WIDTHS) {
      for (const format of DERIVATIVE_FORMATS) {
        const name = `${width}.${format}`;
        const resized = base
          .clone()
          .resize({ width, withoutEnlargement: true });
        const info = await (
          format === "avif"
            ? resized.avif({ quality: AVIF_QUALITY, effort: AVIF_EFFORT })
            : resized.webp({ quality: WEBP_QUALITY })
        ).toFile(join(job.outDir, name));
        files.push({
          name,
          format,
          width: info.width,
          height: info.height,
          bytes: info.size,
        });
      }
    }
    await send({
      v: PROTOCOL_VERSION,
      kind: "result",
      ok: true,
      format: job.format,
      width: master.width,
      height: master.height,
      files,
    });
  } catch {
    await reject("CORRUPT");
  }
}

process.once("message", (raw: unknown) => {
  const parsed = jobMessage.safeParse(raw);
  const done = parsed.success ? run(parsed.data) : reject("CORRUPT");
  // Exit as soon as the result is sent; the parent also kills on deadline.
  void done.finally(() => process.exit(0));
});
