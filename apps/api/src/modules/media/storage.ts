// Media storage. Originals are private; derivatives are public and served by
// a CDN in production (never by the API, security-design.md §6). Locally the
// files live under MEDIA_DIR and the API serves `public/` in development only.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { DerivativeFormat } from "./image.ts";

export type StoredVariant = {
  readonly format: DerivativeFormat;
  readonly width: number;
  readonly height: number;
  /** Relative to the public base URL, for example `9f…/960.webp`. */
  readonly path: string;
};

export interface MediaStorage {
  /** Random key; never derived from the file name. */
  newKey(): string;
  putOriginal(key: string, extension: string, data: Buffer): Promise<void>;
  putPublic(path: string, data: Buffer): Promise<void>;
  /** Folder served at the public base URL in development, if local. */
  readonly localPublicDir?: string;
}

const KEY = /^[a-f0-9]{32}$/;

export function localMediaStorage(root: string): MediaStorage {
  const base = resolve(root);
  const publicDir = join(base, "public");
  const privateDir = join(base, "private");
  async function write(dir: string, relative: string, data: Buffer) {
    const target = resolve(dir, relative);
    // Paths are built from random keys, but refuse anything that escapes.
    if (!target.startsWith(`${dir}/`))
      throw new Error("path escapes media dir");
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, data, { flag: "wx" });
  }
  return {
    newKey: () => randomBytes(16).toString("hex"),
    async putOriginal(key, extension, data) {
      if (!KEY.test(key)) throw new Error("invalid media key");
      await write(privateDir, `${key}/original.${extension}`, data);
    },
    async putPublic(path, data) {
      await write(publicDir, path, data);
    },
    localPublicDir: publicDir,
  };
}

/** Public URL for a stored variant path. */
export function mediaUrl(baseUrl: string, path: string): string {
  return `${baseUrl}/${path}`;
}
