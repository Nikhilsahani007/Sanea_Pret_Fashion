// Turns a media asset's stored variants into what the storefront needs for
// `<picture>`: AVIF and WebP srcsets, a fallback URL and the aspect ratio.
import { mediaUrl, type StoredVariant } from "./storage.ts";

export type ImageSources = {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly avifSrcset: string;
  readonly webpSrcset: string;
};

export function parseVariants(value: unknown): StoredVariant[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is StoredVariant =>
      typeof v === "object" &&
      v !== null &&
      (v.format === "avif" || v.format === "webp") &&
      Number.isInteger(v.width) &&
      Number.isInteger(v.height) &&
      typeof v.path === "string",
  );
}

export function imageSources(
  baseUrl: string,
  asset: { width: number; height: number; variants: unknown },
): ImageSources | null {
  const variants = parseVariants(asset.variants).sort(
    (a, b) => a.width - b.width,
  );
  const webp = variants.filter((v) => v.format === "webp");
  const avif = variants.filter((v) => v.format === "avif");
  if (webp.length === 0) return null;
  const srcset = (list: StoredVariant[]) =>
    list.map((v) => `${mediaUrl(baseUrl, v.path)} ${v.width}w`).join(", ");
  const fallback = webp.find((v) => v.width >= 960) ?? webp.at(-1)!;
  return {
    url: mediaUrl(baseUrl, fallback.path),
    width: asset.width,
    height: asset.height,
    avifSrcset: srcset(avif),
    webpSrcset: srcset(webp),
  };
}
