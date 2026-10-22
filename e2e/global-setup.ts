// End-to-end stack for the admin (phase-8-ui-plan.md §4): a fresh disposable
// database, the API, the development image server, and the admin production
// build served by `vite preview` on http://localhost:5174 (U8-6).
//
// Needs TEST_DATABASE_URL: a disposable PostgreSQL on loopback whose database
// name starts with sanea_test (D-059). Secrets are generated here, kept in
// memory, passed to the child processes and never printed or written.
// Returns the teardown: stops every process, drops the database, deletes the
// media folder.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const API_PORT = 4100;
export const IMAGE_PORT = 4101;
export const ADMIN_URL = "http://localhost:5174";

const root = fileURLToPath(new URL("../", import.meta.url));
const node = process.execPath;
const children: ChildProcess[] = [];

function start(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  cwd = root,
) {
  const child = spawn(node, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout?.on("data", (d) => (log += d));
  child.stderr?.on("data", (d) => (log += d));
  child.on("exit", (code) => {
    if (code && code !== 0 && !stopping)
      process.stderr.write(`[${name}] exited ${code}\n${log.slice(-2000)}\n`);
  });
  children.push(child);
  return child;
}

let stopping = false;

async function waitFor(url: string, name: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} did not start at ${url}`);
}

export default async function globalSetup() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw)
    throw new Error(
      "Set TEST_DATABASE_URL to a disposable sanea_test… database (see .env.example).",
    );
  const dbUrl = new URL(raw);
  dbUrl.pathname = "/sanea_test_e2e";

  const media = mkdtempSync(join(tmpdir(), "sanea-e2e-media-"));
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    TEST_DATABASE_URL: raw,
    NODE_ENV: "test",
    LOG_LEVEL: "warn",
    HOST: "127.0.0.1",
    PORT: String(API_PORT),
    STOREFRONT_ORIGIN: "http://localhost:5173",
    ADMIN_ORIGIN: ADMIN_URL,
    CSRF_SECRET: randomBytes(32).toString("base64url"),
    DATABASE_URL: dbUrl.toString(),
    MFA_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    MFA_ENCRYPTION_KEY_VERSION: "1",
    IP_HASH_KEY: randomBytes(32).toString("base64url"),
    MEDIA_STORAGE_DIR: media,
    MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${IMAGE_PORT}/`,
    MEDIA_UPLOAD_QUEUE_WAITING: "2",
  };

  execFileSync(node, ["e2e/support/reset-db.ts", "create"], {
    cwd: root,
    env,
    stdio: "pipe",
  });
  // The production build of the admin, then `vite preview` with the /api proxy.
  const vite = join(root, "node_modules", "vite", "bin", "vite.js");
  execFileSync(node, [vite, "build", "--logLevel", "warn"], {
    cwd: join(root, "apps", "admin"),
    env,
    stdio: "pipe",
  });

  start("api", ["e2e/support/api-server.ts"], env);
  start("images", ["apps/api/src/modules/media/dev-image-server.ts"], env);
  start(
    "admin",
    [vite, "preview"],
    { ...env, ADMIN_API_URL: `http://127.0.0.1:${API_PORT}` },
    join(root, "apps", "admin"),
  );
  await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health`, "API");
  await waitFor(`http://127.0.0.1:${IMAGE_PORT}/`, "image server");
  await waitFor(`${ADMIN_URL}/sign-in`, "admin preview");

  // The first Owner's one-time set-up link (D-069), exactly as an operator gets it.
  const out = execFileSync(
    node,
    [
      "apps/api/src/modules/auth/create-owner.ts",
      "--email",
      "owner@e2e.example.test",
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
    },
  );
  const link = out
    .split(/\s+/)
    .find((w) => w.includes("/accept-invite#token="));
  if (!link) throw new Error("create-owner did not print a link");
  process.env.E2E_OWNER_INVITE_URL = link;
  process.env.E2E_API_URL = `http://127.0.0.1:${API_PORT}`;

  return async () => {
    stopping = true;
    for (const child of children) child.kill();
    await new Promise((r) => setTimeout(r, 500));
    execFileSync(node, ["e2e/support/reset-db.ts", "drop"], {
      cwd: root,
      env,
      stdio: "pipe",
    });
    rmSync(media, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  };
}
