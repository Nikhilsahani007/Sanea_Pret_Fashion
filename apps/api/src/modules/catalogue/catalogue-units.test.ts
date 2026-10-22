// Unit tests: publishing rules (D-083, Q8-6), cursors and image views.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { LocalDiskStorage } from "../media/storage.ts";
import { decodeCursor, encodeCursor, imageView } from "./common.ts";
import { publishProblems, publishedAtFor, slugLocked } from "./publishing.ts";

describe("publishing rules", () => {
  it("passes a publishable product", () => {
    expect(
      publishProblems({
        categoryStatus: "PUBLISHED",
        activeVariants: 1,
        primaryImages: 1,
      }),
    ).toEqual([]);
  });
  it("lists every unmet rule", () => {
    expect(
      publishProblems({
        categoryStatus: "DRAFT",
        activeVariants: 0,
        primaryImages: 0,
      }),
    ).toEqual([
      "CATEGORY_NOT_PUBLISHED",
      "NO_ACTIVE_VARIANT",
      "NO_PRIMARY_IMAGE",
    ]);
  });
  it("keeps the first publish date and locks the slug once published", () => {
    const first = new Date("2026-10-01T00:00:00Z");
    const now = new Date("2026-10-22T00:00:00Z");
    expect(publishedAtFor(null, now)).toBe(now);
    expect(publishedAtFor(first, now)).toBe(first);
    expect(slugLocked(null)).toBe(false);
    expect(slugLocked(first)).toBe(true);
  });
});

describe("cursors", () => {
  const schema = z.strictObject({ s: z.literal("newest"), id: z.uuid() });
  it("round-trips", () => {
    const value = {
      s: "newest" as const,
      id: "0192f0e2-0000-7000-8000-000000000001",
    };
    expect(decodeCursor(encodeCursor(value), schema)).toEqual(value);
  });
  it.each([
    "not base64!",
    Buffer.from("not json").toString("base64url"),
    encodeCursor({ s: "newest", id: "x" }),
    encodeCursor({
      s: "newest",
      id: "0192f0e2-0000-7000-8000-000000000001",
      extra: 1,
    }),
    "a".repeat(401),
  ])("rejects %j with 400", (raw) => {
    expect(() => decodeCursor(raw, schema)).toThrow(
      expect.objectContaining({ status: 400 }),
    );
  });
});

describe("imageView", () => {
  const storage = new LocalDiskStorage("/unused", "http://img.test/");
  const prefix = "0123456789abcdef0123456789abcdef";
  const variants = (maxWidth: number) =>
    [480, 960, 1440, 2048].flatMap((w) =>
      ["avif", "webp"].map((f) => ({
        key: `${prefix}/${w}.${f}`,
        format: f,
        width: Math.min(w, maxWidth),
        height: 100,
      })),
    );
  const view = (maxWidth: number) =>
    imageView(
      {
        colourId: null,
        alt: "a",
        role: "PRIMARY",
        position: 0,
        mediaAsset: {
          width: maxWidth,
          height: 100,
          variants: variants(maxWidth),
        },
      },
      storage,
    );

  it("uses the 1440 px WebP by default", () => {
    expect(view(4000).url).toBe(`http://img.test/${prefix}/1440.webp`);
    expect(view(4000).sources).toHaveLength(8);
  });
  it("drops identical files from a small original and picks the smallest name", () => {
    const v = view(1200);
    expect(v.url).toBe(`http://img.test/${prefix}/1440.webp`);
    expect(v.sources.map((s) => s.url.split("/").pop())).toEqual([
      "480.avif",
      "480.webp",
      "960.avif",
      "960.webp",
      "1440.avif",
      "1440.webp",
    ]);
  });
  it("never exposes the master", () => {
    expect(JSON.stringify(view(4000))).not.toContain("master");
  });
});
