// Safeguard 1: the development image server serves derivatives only, refuses
// traversal and never exposes originals.
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createImageServer } from "./dev-image-server.ts";

const PREFIX = "0123456789abcdef0123456789abcdef";
let root: string;
let server: Server;
let port: number;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sanea-imgsrv-"));
  await mkdir(join(root, "public", PREFIX), { recursive: true });
  await mkdir(join(root, "private", PREFIX), { recursive: true });
  await writeFile(join(root, "public", PREFIX, "1440.webp"), "WEBPDATA");
  await writeFile(
    join(root, "public", PREFIX, "master.jpeg"),
    "SHOULD-NOT-SERVE",
  );
  await writeFile(join(root, "private", PREFIX, "master.jpeg"), "PRIVATE");
  await writeFile(join(root, "secret.txt"), "SECRET");
  server = createImageServer(join(root, "public")).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => {
  server.close();
  await rm(root, { recursive: true, force: true });
});

/** Sends the path exactly as given (no client-side normalisation). */
function get(
  path: string,
  method = "GET",
): Promise<{ status: number; body: string; headers: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body, headers: res.headers }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("development image server (safeguard 1)", () => {
  it("serves a derivative with its type and nosniff", async () => {
    const r = await get(`/${PREFIX}/1440.webp`);
    expect(r.status).toBe(200);
    expect(r.body).toBe("WEBPDATA");
    expect(r.headers["content-type"]).toBe("image/webp");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("answers HEAD without a body and refuses other methods", async () => {
    expect((await get(`/${PREFIX}/1440.webp`, "HEAD")).body).toBe("");
    expect((await get(`/${PREFIX}/1440.webp`, "POST")).status).toBe(405);
    expect((await get(`/${PREFIX}/1440.webp`, "DELETE")).status).toBe(405);
  });

  it.each([
    `/${PREFIX}/master.jpeg`,
    `/${PREFIX}/../../private/${PREFIX}/master.jpeg`,
    `/../secret.txt`,
    `/${PREFIX}/..%2f..%2fsecret.txt`,
    `/${PREFIX}/%2e%2e/secret.txt`,
    `/${PREFIX}%5c1440.webp`,
    `/${PREFIX}\\1440.webp`,
    `/${PREFIX}/1440.webp?x=1`,
    `/${PREFIX}/1440.webp/`,
    `/${PREFIX}/`,
    `/${PREFIX}`,
    `/`,
    `//etc/passwd`,
    `/${PREFIX.toUpperCase()}/1440.webp`,
    `/${PREFIX}/999.webp`,
    `/${PREFIX}/1440.png`,
  ])("refuses %s", async (path) => {
    const r = await get(path);
    expect(r.status).toBe(404);
    expect(r.body).not.toMatch(/PRIVATE|SECRET|SHOULD-NOT-SERVE/);
  });

  it("returns 404 for a well-formed key that does not exist", async () => {
    expect((await get(`/${PREFIX}/480.avif`)).status).toBe(404);
  });
});
