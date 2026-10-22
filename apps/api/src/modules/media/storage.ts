// Media storage (D-080, Phase 8 safeguard 1). Originals are private and
// derivatives public, in separate folders, under random keys; original
// filenames never appear in paths. The cloud implementation comes with
// Phase 19 infrastructure.
import { randomBytes } from "node:crypto";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Keys look like `<32 hex>/<file>`; nothing else is accepted. */
const KEY =
  /^[0-9a-f]{32}\/(?:master\.(?:jpeg|png|webp)|(?:480|960|1440|2048)\.(?:avif|webp))$/;

export function isStorageKey(key: string): boolean {
  return KEY.test(key);
}

export function newAssetPrefix(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Resolves `key` under `root`, refusing anything that could leave it:
 * only well-formed keys, and the resolved path must stay inside `root`.
 */
export function safeJoin(root: string, key: string): string {
  if (!isStorageKey(key)) throw new Error("invalid storage key");
  const base = resolve(root);
  const full = resolve(base, key);
  const rel = relative(base, full);
  if (
    rel === "" ||
    rel.startsWith("..") ||
    isAbsolute(rel) ||
    rel.split(sep).includes("..")
  )
    throw new Error("storage key leaves the storage folder");
  return full;
}

export interface MediaStorage {
  /** Moves a processed file into private storage (originals). */
  putPrivate(key: string, sourcePath: string): Promise<void>;
  /** Moves a processed file into public storage (derivatives). */
  putPublic(key: string, sourcePath: string): Promise<void>;
  /** Removes stored files; ignores missing ones. */
  remove(keys: readonly string[]): Promise<void>;
  /** The public URL of a derivative. Never the API origin. */
  publicUrl(key: string): string;
}

export class LocalDiskStorage implements MediaStorage {
  readonly privateDir: string;
  readonly publicDir: string;
  readonly #baseUrl: string;

  constructor(root: string, publicBaseUrl: string) {
    this.privateDir = join(resolve(root), "private");
    this.publicDir = join(resolve(root), "public");
    this.#baseUrl = publicBaseUrl;
  }

  async putPrivate(key: string, sourcePath: string): Promise<void> {
    await this.#move(this.privateDir, key, sourcePath);
  }

  async putPublic(key: string, sourcePath: string): Promise<void> {
    await this.#move(this.publicDir, key, sourcePath);
  }

  async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      for (const dir of [this.privateDir, this.publicDir]) {
        await rm(safeJoin(dir, key), { force: true });
      }
    }
  }

  publicUrl(key: string): string {
    if (!isStorageKey(key)) throw new Error("invalid storage key");
    return `${this.#baseUrl}${key}`;
  }

  async #move(dir: string, key: string, sourcePath: string): Promise<void> {
    const target = safeJoin(dir, key);
    await mkdir(dirname(target), { recursive: true });
    await rename(sourcePath, target);
  }
}
