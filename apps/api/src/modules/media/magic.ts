// File type from the first bytes, not the extension or the declared type
// (D-078, security-design.md §6). Only JPEG, PNG and WebP are accepted.

export type ImageFormat = "jpeg" | "png" | "webp";

export const ALLOWED_CONTENT_TYPES: Readonly<Record<string, ImageFormat>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Bytes needed to recognise every allowed format. */
export const MAGIC_LENGTH = 12;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImage(head: Uint8Array): ImageFormat | null {
  if (
    head.length >= 3 &&
    head[0] === 0xff &&
    head[1] === 0xd8 &&
    head[2] === 0xff
  )
    return "jpeg";
  if (head.length >= 8 && PNG.every((b, i) => head[i] === b)) return "png";
  if (
    head.length >= 12 &&
    String.fromCharCode(...head.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...head.subarray(8, 12)) === "WEBP"
  )
    return "webp";
  return null;
}

/** The declared format, ignoring parameters such as `; charset=…`. */
export function declaredFormat(
  contentType: string | undefined,
): ImageFormat | null {
  if (!contentType) return null;
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return ALLOWED_CONTENT_TYPES[type] ?? null;
}
