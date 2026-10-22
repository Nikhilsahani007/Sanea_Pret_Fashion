// AVIF retest in CI on Linux (P8-AC11, Q8-11): the whole upload through the
// real API and child-process worker, at the production settings and deadlines,
// for the §10b cases. Limits set before measuring (phase-8-plan.md §10b): a
// representative upload at most 15 s, the worst case at most 60 s. Times are
// printed so the CI log records them. Synthetic images only.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AdminRole } from "@sanea/shared";
import sharp from "sharp";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";
import { MAX_UPLOAD_BYTES } from "./upload.ts";

sharp.cache(false);

let h: Harness;
let owner: Session;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sanea-avif-timing-"));
  h = await adminHarness({
    env: { MEDIA_STORAGE_DIR: root, MEDIA_UPLOAD_QUEUE_WAITING: "2" },
    // Production deadlines (QP-4, QP-5): 30 s wait, 60 s from admission.
    media: { timings: { waitMs: 30_000, totalMs: 60_000 } },
  });
  owner = await h.signIn(await h.createAdmin(AdminRole.OWNER));
}, 120_000);

afterAll(async () => {
  await h.drop();
  await rm(root, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
});

/** Random bytes for noise images, deterministic per seed. */
function noise(width: number, height: number, seed: number): Buffer {
  const data = Buffer.alloc(width * height * 3);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < data.length; i += 1) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    data[i] = x & 255;
  }
  return data;
}

const exif = { IFD0: { Make: "SANEA-TEST-CAM", Copyright: "SANEA-TEST" } };

/** Photo-like: smooth noise (blurred), compresses like a photograph. */
async function photoLike(width: number, height: number): Promise<Buffer> {
  const small = await sharp(noise(width / 50, height / 50, 7), {
    raw: { width: width / 50, height: height / 50, channels: 3 },
  })
    .resize(width, height, { kernel: "cubic" })
    .blur(3)
    .raw()
    .toBuffer();
  return sharp(small, { raw: { width, height, channels: 3 } })
    .withExif(exif)
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function pureNoise(width: number, height: number): Promise<Buffer> {
  return sharp(noise(width, height, 11), {
    raw: { width, height, channels: 3 },
  })
    .withExif(exif)
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function timedUpload(body: Buffer) {
  const started = performance.now();
  const r = await request(h.app)
    .post("/api/v1/admin/media")
    .set("Origin", ADMIN)
    .set("Cookie", owner.cookie)
    .set("X-CSRF-Token", owner.csrfToken)
    .set("Content-Type", "image/jpeg")
    .set("X-Upload-Filename", "timing.jpg")
    .send(body);
  return {
    status: r.status,
    body: r.body,
    seconds: (performance.now() - started) / 1000,
  };
}

const CASES = [
  {
    name: "representative: photo-like 4000 x 5000",
    make: () => photoLike(4000, 5000),
    limit: 15,
  },
  {
    name: "representative: photo-like 3000 x 4000",
    make: () => photoLike(3000, 4000),
    limit: 15,
  },
  {
    name: "worst case: pure noise 2048 x 8000",
    make: () => pureNoise(2048, 8000),
    limit: 60,
  },
] as const;

describe("AVIF retest at the production settings (P8-AC11)", () => {
  for (const c of CASES)
    it(`${c.name}: whole upload within ${c.limit} s`, async () => {
      const body = await c.make();
      expect(
        body.length,
        "input must fit the 15 MB upload limit",
      ).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
      const { status, body: asset, seconds } = await timedUpload(body);
      // Written to stdout so the CI log records it (phase-8-plan.md §10f);
      // Vitest hides console output of passing tests.
      process.stdout.write(
        `[P8-AC11] ${c.name}: ${seconds.toFixed(2)} s, input ${(body.length / 1024 / 1024).toFixed(1)} MB, status ${status}, node ${process.version}, ${process.platform}/${process.arch}\n`,
      );
      expect(status).toBe(201);
      const formats = new Set(
        (asset as { derivatives: { format: string }[] }).derivatives.map(
          (d) => d.format,
        ),
      );
      expect([...formats].sort()).toEqual(["avif", "webp"]);
      expect(seconds).toBeLessThanOrEqual(c.limit);
    }, 120_000);
});
