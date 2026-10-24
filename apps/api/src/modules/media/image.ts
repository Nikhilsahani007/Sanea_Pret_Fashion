// Upload checks and derivatives (system-design.md §10, security-design.md §6):
// JPEG, PNG or WebP by magic bytes, at most 8000 × 8000 pixels, re-encoded by
// sharp (which drops EXIF and other metadata) to AVIF and WebP at the
// approved widths.
import sharp from "sharp";

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_DIMENSION = 8000;
export const DERIVATIVE_WIDTHS = [480, 960, 1440, 2048] as const;
export const DERIVATIVE_FORMATS = ["avif", "webp"] as const;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type DerivativeFormat = (typeof DERIVATIVE_FORMATS)[number];

export type Derivative = {
  readonly format: DerivativeFormat;
  readonly width: number;
  readonly height: number;
  readonly data: Buffer;
};

export class ImageRejected extends Error {
  readonly reason: "UNSUPPORTED_TYPE" | "TOO_LARGE" | "UNREADABLE";
  constructor(reason: ImageRejected["reason"]) {
    super(reason);
    this.name = "ImageRejected";
    this.reason = reason;
  }
}

/** The real file type from its first bytes; the declared type is not trusted. */
export function detectImageType(data: Buffer): ImageMime | undefined {
  if (
    data.length >= 3 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff
  )
    return "image/jpeg";
  if (
    data.length >= 8 &&
    data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "image/png";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  )
    return "image/webp";
  return undefined;
}

/** Widths to produce: the approved widths up to the original, at least one. */
export function widthsFor(originalWidth: number): number[] {
  const widths = DERIVATIVE_WIDTHS.filter((w) => w <= originalWidth);
  return widths.length > 0 ? widths : [originalWidth];
}

export type ProcessedImage = {
  readonly mimeType: ImageMime;
  /** Display size after EXIF orientation is applied. */
  readonly width: number;
  readonly height: number;
  readonly derivatives: readonly Derivative[];
};

export async function processImage(data: Buffer): Promise<ProcessedImage> {
  const mimeType = detectImageType(data);
  if (!mimeType) throw new ImageRejected("UNSUPPORTED_TYPE");
  const options = {
    limitInputPixels: MAX_DIMENSION * MAX_DIMENSION,
    failOn: "error" as const,
  };
  let width: number;
  let height: number;
  try {
    const meta = await sharp(data, options).metadata();
    const rotated = (meta.orientation ?? 1) >= 5;
    width = (rotated ? meta.height : meta.width) ?? 0;
    height = (rotated ? meta.width : meta.height) ?? 0;
  } catch (error) {
    if (/pixel limit/i.test(String(error)))
      throw new ImageRejected("TOO_LARGE");
    throw new ImageRejected("UNREADABLE");
  }
  if (width < 1 || height < 1) throw new ImageRejected("UNREADABLE");
  if (width > MAX_DIMENSION || height > MAX_DIMENSION)
    throw new ImageRejected("TOO_LARGE");

  const derivatives: Derivative[] = [];
  for (const w of widthsFor(width)) {
    const h = Math.max(1, Math.round((height * w) / width));
    const base = sharp(data, options).rotate().resize({ width: w });
    const [avif, webp] = await Promise.all([
      base.clone().avif({ quality: 55, effort: 4 }).toBuffer(),
      base.clone().webp({ quality: 80 }).toBuffer(),
    ]);
    derivatives.push(
      { format: "avif", width: w, height: h, data: avif },
      { format: "webp", width: w, height: h, data: webp },
    );
  }
  return { mimeType, width, height, derivatives };
}
