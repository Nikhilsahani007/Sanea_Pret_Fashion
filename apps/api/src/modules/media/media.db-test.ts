// The image upload through the real API, database and child-process worker
// (D-077 to D-080, D-088, QP-1 to QP-7, T-1 to T-7, safeguard 1, P8-AC5 and
// P8-AC12). Short queue timings are a test seam; production uses 30 s / 60 s.
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AdminRole } from "@sanea/shared";
import sharp from "sharp";

// The test reads derivatives with sharp; its file cache would keep them open
// (Windows then refuses to delete the temporary folder).
sharp.cache(false);
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";
import type { MediaService } from "./router.ts";
import { IMAGE_415_MESSAGE, MAX_UPLOAD_BYTES } from "./upload.ts";

const fixture = (name: string) =>
  fileURLToPath(new URL(`./testing/${name}`, import.meta.url));

type Ctx = { h: Harness; owner: Session; root: string; media: MediaService };

async function context(
  options: {
    waiting?: number;
    workerPath?: string;
    waitMs?: number;
    totalMs?: number;
  } = {},
): Promise<Ctx> {
  const root = await mkdtemp(join(tmpdir(), "sanea-media-test-"));
  const h = await adminHarness({
    env: {
      MEDIA_STORAGE_DIR: root,
      MEDIA_UPLOAD_QUEUE_WAITING: String(options.waiting ?? 2),
    },
    media: {
      timings: {
        waitMs: options.waitMs ?? 30_000,
        totalMs: options.totalMs ?? 60_000,
      },
      ...(options.workerPath ? { workerPath: options.workerPath } : {}),
    },
  });
  const owner = await h.signIn(await h.createAdmin(AdminRole.OWNER));
  return { h, owner, root, media: h.app.locals.mediaService as MediaService };
}

async function close(ctx: Ctx) {
  await ctx.h.drop();
  await rm(ctx.root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}

function upload(
  ctx: Ctx,
  body: Buffer,
  type: string,
  session: Session = ctx.owner,
) {
  return request(ctx.h.app)
    .post("/api/v1/admin/media")
    .set("Origin", ADMIN)
    .set("Cookie", session.cookie)
    .set("X-CSRF-Token", session.csrfToken)
    .set("Content-Type", type)
    .set("X-Upload-Filename", "Secret Shoot Ivory.jpg")
    .send(body);
}

/** A raw HTTP request, for chunked bodies, stalls and disconnects. */
function raw(
  port: number,
  session: Session,
  headers: Record<string, string>,
): ReturnType<typeof httpRequest> {
  return httpRequest({
    host: "127.0.0.1",
    port,
    method: "POST",
    path: "/api/v1/admin/media",
    headers: {
      Origin: ADMIN,
      Cookie: session.cookie,
      "X-CSRF-Token": session.csrfToken,
      ...headers,
    },
  });
}

type RawResult = { status?: number; body?: string; error?: string };
function settle(req: ReturnType<typeof httpRequest>): Promise<RawResult> {
  return new Promise((resolve) => {
    req.on("response", (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", (e) =>
      resolve({ error: (e as NodeJS.ErrnoException).code ?? e.message }),
    );
  });
}

const jpeg = (w = 1200, h = 1500) =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#e8c8c8" } })
    .withExif({ IFD0: { Make: "SANEA-TEST-CAM", Copyright: "SANEA-TEST" } })
    .jpeg()
    .toBuffer();

const counts = async (ctx: Ctx) => ({
  rows: await ctx.h.db.mediaAsset.count(),
  tmp: existsSync(join(ctx.root, "tmp"))
    ? (await readdir(join(ctx.root, "tmp"))).length
    : 0,
  public: existsSync(join(ctx.root, "public"))
    ? (await readdir(join(ctx.root, "public"))).length
    : 0,
  private: existsSync(join(ctx.root, "private"))
    ? (await readdir(join(ctx.root, "private"))).length
    : 0,
});

const settledQueue = async (ctx: Ctx) => {
  for (
    let i = 0;
    i < 100 &&
    (ctx.media.queue.stats.active || ctx.media.queue.stats.queueDepth);
    i++
  )
    await new Promise((r) => setTimeout(r, 50));
  return {
    active: ctx.media.queue.stats.active,
    queueDepth: ctx.media.queue.stats.queueDepth,
  };
};

describe("upload with the real worker", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await context();
  });
  afterAll(() => close(ctx));

  it("saves a JPEG: private master, public derivatives, record and audit (P8-AC5)", async () => {
    const res = await upload(ctx, await jpeg(), "image/jpeg");
    expect(res.status).toBe(201);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.derivatives).toHaveLength(8);
    for (const d of res.body.derivatives) {
      expect(d.url).toMatch(
        /^http:\/\/127\.0\.0\.1:4010\/[0-9a-f]{32}\/(480|960|1440|2048)\.(avif|webp)$/,
      );
      expect(d.width).toBeLessThanOrEqual(1200); // never upscaled
    }
    expect(JSON.stringify(res.body)).not.toMatch(/master|private/);

    const row = await ctx.h.db.mediaAsset.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row.originalFilename).toBe("Secret Shoot Ivory.jpg");
    expect(row.mimeType).toBe("image/jpeg");
    const prefix = row.storageKey.split("/")[0]!;
    expect(await readdir(join(ctx.root, "private", prefix))).toEqual([
      "master.jpeg",
    ]);
    const pub = (await readdir(join(ctx.root, "public", prefix))).sort();
    expect(pub).toHaveLength(8);
    expect(pub).not.toContain("master.jpeg");

    // Metadata stripped from every derivative (D-077).
    for (const name of pub) {
      const meta = await sharp(
        join(ctx.root, "public", prefix, name),
      ).metadata();
      expect(meta.exif, name).toBeUndefined();
    }
    const audit = await ctx.h.db.auditLog.findFirstOrThrow({
      where: { action: "media.uploaded" },
    });
    expect(audit.entityId).toBe(row.id);
    // The original filename never reaches the logs.
    expect(ctx.h.lines.join("\n")).not.toContain("Secret Shoot");
    expect((await counts(ctx)).tmp).toBe(0);
  });

  it("accepts PNG and WebP", async () => {
    const png = await sharp({
      create: { width: 640, height: 800, channels: 3, background: "#123456" },
    })
      .png()
      .toBuffer();
    const webp = await sharp({
      create: { width: 640, height: 800, channels: 3, background: "#654321" },
    })
      .webp()
      .toBuffer();
    expect((await upload(ctx, png, "image/png")).status).toBe(201);
    expect((await upload(ctx, webp, "image/webp")).status).toBe(201);
  });

  it("lists media newest first with derivative URLs only", async () => {
    const res = await ctx.h.get("/api/v1/admin/media?limit=2", ctx.owner);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(res.body)).not.toMatch(
      /storageKey|master|originalFilename/,
    );
  });

  it("415 with the image message for a disallowed Content-Type; JSON routes keep theirs", async () => {
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#000" },
    })
      .gif()
      .toBuffer();
    const res = await upload(ctx, gif, "image/gif");
    expect(res.status).toBe(415);
    expect(res.body.error).toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
      message: IMAGE_415_MESSAGE,
    });
    expect(res.body.error.requestId).toEqual(expect.any(String));
    const json = await request(ctx.h.app)
      .post("/api/v1/admin/staff/invites")
      .set("Origin", ADMIN)
      .set("Cookie", ctx.owner.cookie)
      .set("X-CSRF-Token", ctx.owner.csrfToken)
      .set("Content-Type", "text/plain")
      .send("x");
    expect(json.status).toBe(415);
    expect(json.body.error.message).toBe(
      "Send the request body as application/json.",
    );
  });

  it("415 when the bytes do not match the declared type (magic bytes)", async () => {
    const png = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    const res = await upload(ctx, png, "image/jpeg");
    expect(res.status).toBe(415);
    expect(res.body.error.message).toBe(IMAGE_415_MESSAGE);
    const svg = await upload(
      ctx,
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      "image/png",
    );
    expect(svg.status).toBe(415);
  });

  it("400 for images over 8000 px and for corrupt files", async () => {
    const wide = await sharp({
      create: { width: 8001, height: 10, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    const r1 = await upload(ctx, wide, "image/png");
    expect(r1.status).toBe(400);
    expect(r1.body.error.code).toBe("VALIDATION_FAILED");
    const good = await jpeg(400, 400);
    const r2 = await upload(
      ctx,
      good.subarray(0, good.length >> 1),
      "image/jpeg",
    );
    expect(r2.status).toBe(400);
  });

  it("enforces permissions and CSRF", async () => {
    const f = await ctx.h.signIn(await ctx.h.createAdmin(AdminRole.FULFILMENT));
    expect(
      (await upload(ctx, await jpeg(10, 10), "image/jpeg", f)).status,
    ).toBe(403);
    const c = await ctx.h.signIn(
      await ctx.h.createAdmin(AdminRole.CATALOGUE_EDITOR),
    );
    expect(
      (await upload(ctx, await jpeg(20, 20), "image/jpeg", c)).status,
    ).toBe(201);
    const anon = await request(ctx.h.app)
      .post("/api/v1/admin/media")
      .set("Origin", ADMIN)
      .set("Content-Type", "image/jpeg")
      .send(await jpeg(10, 10));
    expect([401, 403]).toContain(anon.status);
    const noCsrf = await request(ctx.h.app)
      .post("/api/v1/admin/media")
      .set("Origin", ADMIN)
      .set("Cookie", ctx.owner.cookie)
      .set("Content-Type", "image/jpeg")
      .send(await jpeg(10, 10));
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe("CSRF_FAILED");
  });

  it("413 for a declared Content-Length over 15 MB, before reading the body (T-7)", async () => {
    const server = ctx.h.app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const req = raw(port, ctx.owner, {
        "Content-Type": "image/jpeg",
        "Content-Length": String(MAX_UPLOAD_BYTES + 1),
      });
      const result = settle(req);
      req.write(Buffer.from([0xff, 0xd8, 0xff]));
      const r = await result;
      req.destroy();
      expect(r.status).toBe(413);
      expect(r.body).toContain("PAYLOAD_TOO_LARGE");
    } finally {
      server.close();
    }
    expect(await settledQueue(ctx)).toEqual({ active: 0, queueDepth: 0 });
  });

  it("413 for a chunked body that passes 15 MB while streaming (T-7)", async () => {
    const server = ctx.h.app.listen(0);
    const before = await counts(ctx);
    try {
      const port = (server.address() as AddressInfo).port;
      const req = raw(port, ctx.owner, {
        "Content-Type": "image/jpeg",
        "Transfer-Encoding": "chunked",
      });
      const result = settle(req);
      const chunk = Buffer.alloc(1024 * 1024, 0xab);
      chunk[0] = 0xff;
      chunk[1] = 0xd8;
      chunk[2] = 0xff;
      for (let i = 0; i < 17 && !req.destroyed; i++) {
        await new Promise<void>((resolve) => req.write(chunk, () => resolve()));
      }
      req.end();
      const r = await result;
      // Expected: a clean 413, or a reset if the server closed mid-upload.
      if (r.status !== undefined) {
        expect(r.status).toBe(413);
      } else {
        expect(["ECONNRESET", "EPIPE"]).toContain(r.error);
      }
    } finally {
      server.close();
    }
    expect(await settledQueue(ctx)).toEqual({ active: 0, queueDepth: 0 });
    expect(await counts(ctx)).toEqual(before);
  });
});

describe("queue limits, deadlines and failures (fake workers)", () => {
  it("429 UPLOAD_QUEUE_FULL without Retry-After or RateLimit when one is active and the waiting slots are full", async () => {
    const ctx = await context({
      waiting: 1,
      workerPath: fixture("hang-worker.ts"),
      waitMs: 5_000,
      totalMs: 6_000,
    });
    try {
      const body = await jpeg(10, 10);
      const a = upload(ctx, body, "image/jpeg").then((r) => r);
      while (ctx.media.queue.stats.active === 0)
        await new Promise((r) => setTimeout(r, 20));
      const b = upload(ctx, body, "image/jpeg").then((r) => r);
      while (ctx.media.queue.stats.queueDepth === 0)
        await new Promise((r) => setTimeout(r, 20));
      const c = await upload(ctx, body, "image/jpeg");
      expect(c.status).toBe(429);
      expect(c.body.error.code).toBe("UPLOAD_QUEUE_FULL");
      expect(c.headers["retry-after"]).toBeUndefined();
      expect(c.headers["ratelimit"]).toBeUndefined();
      expect(c.headers["connection"]).toBe("close");
      // a times out in processing; b waited and then ran out of the absolute deadline.
      const [ra, rb] = await Promise.all([a, b]);
      expect(ra.status).toBe(503);
      expect(ra.body.error.code).toBe("UPLOAD_PROCESSING_TIMEOUT");
      expect(rb.status).toBe(503);
      expect(await counts(ctx)).toMatchObject({ rows: 0, tmp: 0 });
      expect(await settledQueue(ctx)).toEqual({ active: 0, queueDepth: 0 });
    } finally {
      await close(ctx);
    }
  });

  it("with MEDIA_UPLOAD_QUEUE_WAITING=0, a second upload during an active one gets 429", async () => {
    const ctx = await context({
      waiting: 0,
      workerPath: fixture("hang-worker.ts"),
      totalMs: 2_000,
    });
    try {
      const body = await jpeg(10, 10);
      const a = upload(ctx, body, "image/jpeg").then((r) => r);
      while (ctx.media.queue.stats.active === 0)
        await new Promise((r) => setTimeout(r, 20));
      expect((await upload(ctx, body, "image/jpeg")).status).toBe(429);
      expect((await a).status).toBe(503);
    } finally {
      await close(ctx);
    }
  });

  it("503 UPLOAD_QUEUE_TIMEOUT after the queue-wait deadline (T-1)", async () => {
    const ctx = await context({
      waiting: 2,
      workerPath: fixture("hang-worker.ts"),
      waitMs: 600,
      totalMs: 4_000,
    });
    try {
      const body = await jpeg(10, 10);
      const a = upload(ctx, body, "image/jpeg").then((r) => r);
      while (ctx.media.queue.stats.active === 0)
        await new Promise((r) => setTimeout(r, 20));
      const b = await upload(ctx, body, "image/jpeg");
      expect(b.status).toBe(503);
      expect(b.body.error.code).toBe("UPLOAD_QUEUE_TIMEOUT");
      expect(ctx.media.queue.stats.queueTimeouts).toBe(1);
      expect((await a).body.error.code).toBe("UPLOAD_PROCESSING_TIMEOUT");
    } finally {
      await close(ctx);
    }
  });

  it("503 UPLOAD_PROCESSING_TIMEOUT when processing passes the deadline: nothing saved, slot held until the child exits (T-2, T-4)", async () => {
    const ctx = await context({
      workerPath: fixture("hang-worker.ts"),
      totalMs: 1_500,
    });
    try {
      const started = Date.now();
      const res = await upload(ctx, await jpeg(10, 10), "image/jpeg");
      expect(res.status).toBe(503);
      expect(res.body.error).toMatchObject({
        code: "UPLOAD_PROCESSING_TIMEOUT",
      });
      expect(Date.now() - started).toBeGreaterThanOrEqual(1_400);
      expect(await counts(ctx)).toMatchObject({
        rows: 0,
        tmp: 0,
        public: 0,
        private: 0,
      });
      expect(ctx.media.queue.stats).toMatchObject({
        active: 0,
        processingTimeouts: 1,
      });
    } finally {
      await close(ctx);
    }
  });

  it("the 60 s deadline is absolute: a job that waited gets only the time left (T-3)", async () => {
    // a holds the slot for most of the deadline; b is admitted at the same time.
    const ctx = await context({
      waiting: 1,
      workerPath: fixture("hang-worker.ts"),
      waitMs: 5_000,
      totalMs: 2_000,
    });
    try {
      const body = await jpeg(10, 10);
      const started = Date.now();
      const a = upload(ctx, body, "image/jpeg").then((r) => r);
      while (ctx.media.queue.stats.active === 0)
        await new Promise((r) => setTimeout(r, 20));
      const b = await upload(ctx, body, "image/jpeg");
      // b could not get a fresh 2 s after a ended; it ends near 2 s from admission.
      expect(b.status).toBe(503);
      expect(Date.now() - started).toBeLessThan(3_500);
      await a;
    } finally {
      await close(ctx);
    }
  });

  it("deadline during body reception: 503 or reset, nothing saved, slot released", async () => {
    const ctx = await context({ totalMs: 1_200 });
    const server = ctx.h.app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const req = raw(port, ctx.owner, {
        "Content-Type": "image/jpeg",
        "Content-Length": "100000",
      });
      const result = settle(req);
      req.write(Buffer.from([0xff, 0xd8, 0xff, 0xe0])); // then stall
      const r = await result;
      if (r.status !== undefined) {
        expect(r.status).toBe(503);
        expect(r.body).toContain("UPLOAD_PROCESSING_TIMEOUT");
      } else {
        expect(["ECONNRESET", "EPIPE"]).toContain(r.error);
      }
      req.destroy();
      expect(await settledQueue(ctx)).toEqual({ active: 0, queueDepth: 0 });
      expect(await counts(ctx)).toMatchObject({ rows: 0, tmp: 0 });
    } finally {
      server.close();
      await close(ctx);
    }
  });

  it.each([
    ["crash-worker.ts", "a crash"],
    ["malformed-worker.ts", "a malformed message"],
  ])("500 INTERNAL_ERROR on %s (%s); nothing saved", async (worker) => {
    const ctx = await context({ workerPath: fixture(worker) });
    try {
      const res = await upload(ctx, await jpeg(10, 10), "image/jpeg");
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("INTERNAL_ERROR");
      expect(await counts(ctx)).toMatchObject({ rows: 0, tmp: 0 });
      expect(ctx.media.queue.stats).toMatchObject({ active: 0, failures: 1 });
    } finally {
      await close(ctx);
    }
  });

  it("late output after the deadline is discarded", async () => {
    const ctx = await context({
      workerPath: fixture("late-worker.ts"),
      totalMs: 1_000,
    });
    try {
      const res = await upload(ctx, await jpeg(10, 10), "image/jpeg");
      expect(res.status).toBe(503);
      await new Promise((r) => setTimeout(r, 3_500)); // past the late write
      expect(await counts(ctx)).toMatchObject({
        rows: 0,
        tmp: 0,
        public: 0,
        private: 0,
      });
    } finally {
      await close(ctx);
    }
  });

  it("a client that disconnects while waiting frees its slot at once (QP-6)", async () => {
    const ctx = await context({
      waiting: 1,
      workerPath: fixture("hang-worker.ts"),
      waitMs: 10_000,
      totalMs: 3_000,
    });
    const server = ctx.h.app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const body = await jpeg(10, 10);
      const a = upload(ctx, body, "image/jpeg").then((r) => r);
      while (ctx.media.queue.stats.active === 0)
        await new Promise((r) => setTimeout(r, 20));
      const waiting = raw(port, ctx.owner, {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.length),
      });
      void settle(waiting);
      waiting.write(body.subarray(0, 10));
      while (ctx.media.queue.stats.queueDepth === 0)
        await new Promise((r) => setTimeout(r, 20));
      waiting.destroy();
      for (let i = 0; i < 50 && ctx.media.queue.stats.queueDepth > 0; i++)
        await new Promise((r) => setTimeout(r, 20));
      expect(ctx.media.queue.stats.queueDepth).toBe(0);
      // The freed slot accepts a new waiting upload instead of 429.
      const next = upload(ctx, body, "image/jpeg").then((r) => r.status);
      await new Promise((r) => setTimeout(r, 200));
      expect(ctx.media.queue.stats.queueDepth).toBe(1);
      await a;
      await next;
    } finally {
      server.close();
      await close(ctx);
    }
  });

  it("a client that disconnects during processing: child killed, nothing saved, slot released", async () => {
    const ctx = await context({
      workerPath: fixture("hang-worker.ts"),
      totalMs: 20_000,
    });
    const server = ctx.h.app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const body = await jpeg(10, 10);
      const req = raw(port, ctx.owner, {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.length),
      });
      void settle(req);
      req.end(body);
      while (ctx.media.queue.stats.active === 0)
        await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => setTimeout(r, 300)); // worker running
      const started = Date.now();
      req.destroy();
      expect(await settledQueue(ctx)).toEqual({ active: 0, queueDepth: 0 });
      expect(Date.now() - started).toBeLessThan(3_000); // not the 20 s deadline
      expect(await counts(ctx)).toMatchObject({ rows: 0, tmp: 0 });
    } finally {
      server.close();
      await close(ctx);
    }
  });
});
