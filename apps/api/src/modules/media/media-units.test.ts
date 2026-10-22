// Unit tests for the upload queue, file-type sniffing, storage paths and
// filename sanitising (phase-8-plan.md §5.4, §5.6, §5.7). No database.
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { declaredFormat, sniffImage } from "./magic.ts";
import { QueueCancelled, QueueWaitTimeout, UploadQueue } from "./queue.ts";
import { LocalDiskStorage, isStorageKey, safeJoin } from "./storage.ts";
import { sanitiseFilename } from "./upload.ts";

describe("UploadQueue (D-088, QP-1 to QP-6, T-3, T-5)", () => {
  let t = 0;
  const now = () => t;
  beforeEach(() => {
    vi.useFakeTimers();
    t = 1_000;
  });
  afterEach(() => vi.useRealTimers());

  it("admits one active job and up to the waiting capacity, then refuses", () => {
    const q = new UploadQueue(2, { waitMs: 30_000, totalMs: 60_000 }, now);
    const a = q.admit();
    const b = q.admit();
    const c = q.admit();
    expect([a?.state, b?.state, c?.state]).toEqual([
      "active",
      "waiting",
      "waiting",
    ]);
    expect(q.admit()).toBeNull();
    expect(q.stats).toMatchObject({
      active: 1,
      queueDepth: 2,
      rejectedFull: 1,
    });
  });

  it("with capacity 0, a second upload during an active one is refused", () => {
    const q = new UploadQueue(0, undefined, now);
    expect(q.admit()?.state).toBe("active");
    expect(q.admit()).toBeNull();
  });

  it.each([-1, 5, 2.5, Number.NaN])(
    "refuses capacity %s (approved range 0 to 4)",
    (n) => {
      expect(() => new UploadQueue(n)).toThrow(RangeError);
    },
  );

  it("serves waiting jobs in arrival order when the active one is released", async () => {
    const q = new UploadQueue(2, undefined, now);
    const a = q.admit()!;
    const b = q.admit()!;
    const c = q.admit()!;
    a.release();
    await expect(b.turn).resolves.toBeUndefined();
    expect([b.state, c.state]).toEqual(["active", "waiting"]);
    b.release();
    await expect(c.turn).resolves.toBeUndefined();
    expect(q.stats).toMatchObject({ active: 1, queueDepth: 0 });
  });

  it("a waiting job times out after the wait deadline and leaves the queue", async () => {
    const q = new UploadQueue(2, { waitMs: 30_000, totalMs: 60_000 }, now);
    q.admit();
    const b = q.admit()!;
    vi.advanceTimersByTime(29_999);
    expect(b.state).toBe("waiting");
    vi.advanceTimersByTime(1);
    await expect(b.turn).rejects.toBeInstanceOf(QueueWaitTimeout);
    expect(b.state).toBe("released");
    expect(q.stats).toMatchObject({ queueDepth: 0, queueTimeouts: 1 });
  });

  it("the total deadline counts from admission, not from activation (T-3)", () => {
    const q = new UploadQueue(2, { waitMs: 30_000, totalMs: 60_000 }, now);
    const a = q.admit()!;
    const b = q.admit()!;
    t += 25_000; // b waits 25 s
    a.release();
    expect(b.state).toBe("active");
    expect(b.deadlineAt).toBe(1_000 + 60_000);
    expect(b.remainingMs(now())).toBe(35_000);
  });

  it("releases exactly once, however often release is called", () => {
    const q = new UploadQueue(1, undefined, now);
    const a = q.admit()!;
    const b = q.admit()!;
    expect(a.release()).toBe(true);
    expect(a.release()).toBe(false);
    expect(b.state).toBe("active");
    expect(q.stats).toMatchObject({ active: 1, queueDepth: 0 });
    // A second release of a must not free b's slot.
    expect(q.admit()?.state).toBe("waiting");
  });

  it("cancelling a waiting job (client disconnect) frees its slot at once", async () => {
    const q = new UploadQueue(1, undefined, now);
    q.admit();
    const b = q.admit()!;
    expect(q.admit()).toBeNull();
    b.release();
    await expect(b.turn).rejects.toBeInstanceOf(QueueCancelled);
    expect(q.admit()?.state).toBe("waiting");
  });

  it("an active job keeps its slot until it is released", () => {
    const q = new UploadQueue(0, { waitMs: 30_000, totalMs: 60_000 }, now);
    const a = q.admit()!;
    vi.advanceTimersByTime(120_000);
    expect(a.state).toBe("active");
    expect(q.admit()).toBeNull();
    a.release();
    expect(q.admit()?.state).toBe("active");
  });
});

describe("sniffImage and declaredFormat (D-078)", () => {
  const jpeg = Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
  ]);
  const webp = Uint8Array.from(
    Buffer.from("RIFF\x00\x00\x00\x00WEBP", "latin1"),
  );

  it("recognises JPEG, PNG and WebP by their first bytes", () => {
    expect([sniffImage(jpeg), sniffImage(png), sniffImage(webp)]).toEqual([
      "jpeg",
      "png",
      "webp",
    ]);
  });

  it.each([
    ["GIF", Buffer.from("GIF89a\0\0\0\0\0\0", "latin1")],
    ["SVG", Buffer.from("<svg xmlns='x'>", "latin1")],
    ["text", Buffer.from("hello, world!", "latin1")],
    ["RIFF but WAVE", Buffer.from("RIFF\0\0\0\0WAVE", "latin1")],
    ["truncated JPEG", Buffer.from([0xff, 0xd8])],
    ["empty", Buffer.alloc(0)],
  ])("rejects %s", (_name, bytes) => {
    expect(sniffImage(bytes)).toBeNull();
  });

  it("reads only allowed declared types, ignoring parameters and case", () => {
    expect(declaredFormat("image/JPEG; charset=binary")).toBe("jpeg");
    expect(declaredFormat("image/webp")).toBe("webp");
    for (const t of [
      "image/gif",
      "image/svg+xml",
      "application/json",
      "",
      undefined,
    ])
      expect(declaredFormat(t)).toBeNull();
  });
});

describe("storage paths (safeguard 1)", () => {
  const key = "0123456789abcdef0123456789abcdef/1440.webp";

  it("accepts only well-formed keys", () => {
    expect(isStorageKey(key)).toBe(true);
    expect(isStorageKey("0123456789abcdef0123456789abcdef/master.jpeg")).toBe(
      true,
    );
    for (const bad of [
      "../etc/passwd",
      "0123456789abcdef0123456789abcdef/../../secret",
      "0123456789abcdef0123456789abcdef/original.jpg",
      "0123456789ABCDEF0123456789ABCDEF/1440.webp",
      "/0123456789abcdef0123456789abcdef/1440.webp",
      "0123456789abcdef0123456789abcdef\\1440.webp",
      "0123456789abcdef0123456789abcdef/1440.webp/..",
      "",
    ])
      expect(isStorageKey(bad), bad).toBe(false);
  });

  it("safeJoin refuses anything outside the root", () => {
    expect(safeJoin("/data/media", key).replaceAll("\\", "/")).toMatch(
      /\/data\/media\/0123/,
    );
    expect(() => safeJoin("/data/media", "../x")).toThrow();
  });

  it("puts originals and derivatives in separate folders and builds public URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "sanea-storage-"));
    try {
      const s = new LocalDiskStorage(root, "http://127.0.0.1:4010/");
      const src1 = join(root, "a");
      const src2 = join(root, "b");
      await writeFile(src1, "x");
      await writeFile(src2, "y");
      await s.putPrivate("0123456789abcdef0123456789abcdef/master.jpeg", src1);
      await s.putPublic(key, src2);
      expect(
        await readdir(join(s.privateDir, "0123456789abcdef0123456789abcdef")),
      ).toEqual(["master.jpeg"]);
      expect(
        await readdir(join(s.publicDir, "0123456789abcdef0123456789abcdef")),
      ).toEqual(["1440.webp"]);
      expect(s.publicUrl(key)).toBe(`http://127.0.0.1:4010/${key}`);
      expect(() => s.publicUrl("../x")).toThrow();
      await s.remove([key, "0123456789abcdef0123456789abcdef/master.jpeg"]);
      expect(
        await readdir(join(s.publicDir, "0123456789abcdef0123456789abcdef")),
      ).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("sanitiseFilename", () => {
  it.each([
    ["Ivory Anarkali.jpg", "Ivory Anarkali.jpg"],
    ["../../etc/passwd", "....etcpasswd"],
    ["<script>.png", "script.png"],
    ["a\u0000b\nc.jpg", "abc.jpg"],
    ["", "upload.jpeg"],
    ["..", "upload.jpeg"],
    [undefined, "upload.jpeg"],
  ])("%j → %j", (raw, expected) => {
    expect(sanitiseFilename(raw, "jpeg")).toBe(expected);
  });

  it("keeps at most 100 characters", () => {
    expect(sanitiseFilename("x".repeat(300), "png")).toHaveLength(100);
  });
});
