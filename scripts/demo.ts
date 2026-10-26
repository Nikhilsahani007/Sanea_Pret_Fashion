// One command for the local demo store (development only, D-187):
//
//   npm run demo
//
// 1. Reads .env if present. DATABASE_URL, or POSTGRES_PASSWORD for the
//    compose.yaml database, must point at a database on this computer.
// 2. Starts the compose.yaml database with Docker when it is not reachable.
// 3. Applies the migrations and loads the fictional demo catalogue (once;
//    a second run changes nothing).
// 4. Starts the API, the development image server and the storefront, and
//    prints the address. Ctrl+C stops everything.
//
// Refuses NODE_ENV=production and any database host that is not loopback.
// Secrets missing from .env are generated for this run, kept in memory and
// never printed or written.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const node = process.execPath;
const API_PORT = 4000;
const IMAGE_PORT = 4001;
const SHOP = "http://localhost:5173";

function fail(message: string): never {
  process.stderr.write(`\nDemo not started: ${message}\n`);
  process.exit(1);
}

if (existsSync(join(root, ".env"))) process.loadEnvFile(join(root, ".env"));
if (process.env.NODE_ENV === "production")
  fail("NODE_ENV is production. The demo store is for development only.");

let databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  const password = process.env.POSTGRES_PASSWORD;
  if (!password)
    fail(
      "set DATABASE_URL, or POSTGRES_PASSWORD for the compose.yaml database, in .env (see .env.example).",
    );
  const url = new URL("postgresql://localhost");
  url.username = "sanea";
  url.password = password;
  url.hostname = "127.0.0.1";
  url.port = process.env.POSTGRES_PORT || "5433";
  url.pathname = `/${process.env.POSTGRES_DB || "sanea_dev"}`;
  databaseUrl = url.toString();
}
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname))
  fail(`the database host ${db.hostname} is not this computer.`);

function reachable(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection(
      Number(db.port || 5432),
      db.hostname.replace(/[[\]]/g, ""),
    );
    socket.setTimeout(1500);
    socket.once("connect", () => (socket.end(), resolve(true)));
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => (socket.destroy(), resolve(false)));
  });
}

function step(label: string, cmd: string, args: string[], env = process.env) {
  process.stdout.write(`• ${label}\n`);
  const r = spawnSync(cmd, args, { cwd: root, env, stdio: "inherit" });
  if (r.error || r.status !== 0) fail(`${label} failed.`);
}

if (!(await reachable())) {
  if (spawnSync("docker", ["--version"], { stdio: "ignore" }).status !== 0)
    fail(
      `no database at ${db.hostname}:${db.port || 5432} and Docker is not installed. Start PostgreSQL, or install Docker.`,
    );
  step("Starting the database (docker compose)", "docker", [
    "compose",
    "up",
    "-d",
    "--wait",
    "db",
  ]);
}

const media =
  process.env.MEDIA_STORAGE_DIR || join(tmpdir(), "sanea-pret-demo-media");
mkdirSync(media, { recursive: true });
const env: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: "development",
  LOG_LEVEL: process.env.LOG_LEVEL || "warn",
  HOST: "127.0.0.1",
  PORT: String(API_PORT),
  STOREFRONT_ORIGIN: SHOP,
  ADMIN_ORIGIN: process.env.ADMIN_ORIGIN || "http://localhost:5174",
  DATABASE_URL: databaseUrl,
  CSRF_SECRET: process.env.CSRF_SECRET || randomBytes(32).toString("base64url"),
  MFA_ENCRYPTION_KEY:
    process.env.MFA_ENCRYPTION_KEY || randomBytes(32).toString("base64"),
  MFA_ENCRYPTION_KEY_VERSION: process.env.MFA_ENCRYPTION_KEY_VERSION || "1",
  IP_HASH_KEY: process.env.IP_HASH_KEY || randomBytes(32).toString("base64url"),
  MEDIA_STORAGE_DIR: media,
  MEDIA_PUBLIC_BASE_URL: `http://127.0.0.1:${IMAGE_PORT}/`,
  PAYMENT_PROVIDER: "mock",
  MOCK_PAYMENT_SECRET:
    process.env.MOCK_PAYMENT_SECRET || randomBytes(32).toString("base64url"),
  STOREFRONT_API_URL: `http://127.0.0.1:${API_PORT}`,
};

step(
  "Applying the database migrations",
  node,
  [
    join(root, "node_modules", "prisma", "build", "index.js"),
    "migrate",
    "deploy",
  ],
  env,
);
step("Loading the demo catalogue", node, ["apps/api/src/db/demo-seed.ts"], env);

const children: ChildProcess[] = [];
function start(name: string, args: string[], cwd = root) {
  const child = spawn(node, args, { cwd, env, stdio: "inherit" });
  child.on("exit", (code) => {
    if (!stopping && code) fail(`${name} stopped (exit ${code}).`);
  });
  children.push(child);
}
let stopping = false;
function stop() {
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

async function waitFor(url: string, name: string) {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`${name} did not start at ${url}.`);
}

process.stdout.write("• Starting the API, image server and storefront\n");
start("API", ["apps/api/src/main.ts"]);
start("image server", ["apps/api/src/modules/media/dev-image-server.ts"]);
await waitFor(`http://127.0.0.1:${API_PORT}/api/v1/health`, "The API");
start(
  "storefront",
  [join(root, "node_modules", "vite", "bin", "vite.js")],
  join(root, "apps", "storefront"),
);
await waitFor(SHOP, "The storefront");
process.stdout.write(
  `\nSanéa Pret demo store: ${SHOP}\n` +
    "Fictional products and DEMO IMAGE placeholders. Card payment is a test page; no real payment is taken.\n" +
    "Press Ctrl+C to stop.\n",
);
