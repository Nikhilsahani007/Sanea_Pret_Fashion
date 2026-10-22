// Development image server (Q8-9, Phase 8 safeguard 1): Node's built-in
// node:http, read-only, loopback only, serving public derivatives and nothing
// else. It stands in for the CDN; images are never served from the API.
//
// Run: npm run media:serve   (reads MEDIA_STORAGE_DIR and MEDIA_PUBLIC_BASE_URL)
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Exactly a derivative: `/<32 hex>/<width>.<avif|webp>`. Originals never match. */
const DERIVATIVE_PATH = /^\/([0-9a-f]{32})\/(480|960|1440|2048)\.(avif|webp)$/;
const TYPES = { avif: "image/avif", webp: "image/webp" } as const;

export function createImageServer(publicDir: string): Server {
  const root = resolve(publicDir);
  return createServer((req, res) => {
    const send = (status: number) => {
      res.writeHead(status, {
        "Content-Type": "text/plain",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(status === 404 ? "Not found" : "Method not allowed");
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(405);
    // No decoding: encoded separators (%2f, %5c, %2e) simply fail to match.
    const match = DERIVATIVE_PATH.exec(req.url ?? "");
    if (!match) return send(404);
    const [, prefix, width, format] = match as unknown as [
      string,
      string,
      string,
      "avif" | "webp",
    ];
    const file = join(root, prefix, `${width}.${format}`);
    stat(file)
      .then((info) => {
        if (!info.isFile()) return send(404);
        res.writeHead(200, {
          "Content-Type": TYPES[format],
          "Content-Length": info.size,
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
          "Cross-Origin-Resource-Policy": "cross-origin",
        });
        if (req.method === "HEAD") return res.end();
        createReadStream(file).pipe(res);
      })
      .catch(() => send(404));
  });
}

async function main(): Promise<void> {
  const dir = process.env.MEDIA_STORAGE_DIR;
  const base = process.env.MEDIA_PUBLIC_BASE_URL;
  if (!dir || !base) {
    console.error(
      "Set MEDIA_STORAGE_DIR and MEDIA_PUBLIC_BASE_URL (see .env.example).",
    );
    process.exit(1);
  }
  const url = new URL(base);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    console.error("The development image server runs on loopback only.");
    process.exit(1);
  }
  const port = Number(url.port || 80);
  createImageServer(join(dir, "public")).listen(port, "127.0.0.1", () => {
    console.log(
      `development image server on http://127.0.0.1:${port}/ (derivatives only)`,
    );
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  if (process.env.NODE_ENV === "production") {
    console.error("The development image server is not for production.");
    process.exit(1);
  }
  void main();
}
