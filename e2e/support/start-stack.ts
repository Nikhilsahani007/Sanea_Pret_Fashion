// Starts the end-to-end stack: a fresh migrated `sanea_test_e2e` database on
// the TEST_DATABASE_URL server, one admin per role, the API on port 4100, and
// the admin (5174) and storefront (5173) dev servers proxying to it.
// Run by Playwright's webServer; stops everything on SIGTERM.
//
//   TEST_DATABASE_URL=postgresql://…@127.0.0.1:5433/sanea_test node e2e/support/start-stack.ts
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../apps/api/src/generated/prisma/client.ts";
import { hashPassword } from "../../apps/api/src/modules/auth/password.ts";
import { encryptSecret } from "../../apps/api/src/modules/auth/secrets.ts";
import { ADMINS, API_PORT, MFA_KEY_B64, PASSWORD } from "./env.ts";

const root = join(import.meta.dirname, "..", "..");
const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw new Error("TEST_DATABASE_URL is not set");
const server = new URL(raw);
if (!["127.0.0.1", "localhost"].includes(server.hostname))
  throw new Error("loopback only");
const dbUrl = new URL(raw);
dbUrl.pathname = "/sanea_test_e2e";

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: raw }),
});
await admin.$executeRawUnsafe(
  `DROP DATABASE IF EXISTS "sanea_test_e2e" WITH (FORCE)`,
);
await admin.$executeRawUnsafe(`CREATE DATABASE "sanea_test_e2e"`);
await admin.$disconnect();

execFileSync(
  process.execPath,
  [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"],
  {
    cwd: root,
    env: { ...process.env, DATABASE_URL: dbUrl.toString() },
    stdio: "ignore",
  },
);

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: dbUrl.toString() }),
});
const key = Buffer.from(MFA_KEY_B64, "base64");
const hash = await hashPassword(PASSWORD, {
  memory: 1024,
  passes: 1,
  parallelism: 1,
});
for (const [role, a] of Object.entries(ADMINS))
  await db.adminUser.create({
    data: {
      email: a.email,
      name: a.name,
      role: role as keyof typeof ADMINS,
      passwordHash: hash,
      mfaSecretEncrypted: encryptSecret(key, Buffer.from(a.secret)),
      mfaKeyVersion: 1,
      mfaEnabledAt: new Date(),
    },
  });
const mediaDir = join(tmpdir(), "sanea-e2e-media");
if (existsSync(mediaDir)) rmSync(mediaDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });
// Demo catalogue and published content with placeholder images (TEST only).
const { seedDemo } = await import("../../apps/api/src/db/demo-seed.ts");
await seedDemo(db, mediaDir);
await db.$disconnect();

const children: ChildProcess[] = [];
function run(cmd: string, args: string[], env: Record<string, string>) {
  const child = spawn(cmd, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`${cmd} ${args.join(" ")} exited ${code}\n`);
      process.exit(1);
    }
  });
}

run(process.execPath, ["apps/api/src/main.ts"], {
  NODE_ENV: "development",
  PORT: String(API_PORT),
  LOG_LEVEL: "warn",
  STOREFRONT_ORIGIN: "http://localhost:5173",
  ADMIN_ORIGIN: "http://localhost:5174",
  CSRF_SECRET: "e2e-only-csrf-secret-at-least-32-chars",
  DATABASE_URL: dbUrl.toString(),
  MFA_ENCRYPTION_KEY: MFA_KEY_B64,
  IP_HASH_KEY: "e2e-only-ip-hash-key-at-least-32-chars",
  MEDIA_DIR: mediaDir,
});
const apiUrl = `http://127.0.0.1:${API_PORT}`;
run(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "apps/admin", "--strictPort"],
  { API_URL: apiUrl },
);
if (existsSync(join(root, "apps/storefront/index.html")))
  run(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "apps/storefront", "--strictPort"],
    { API_URL: apiUrl },
  );

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    for (const c of children) c.kill("SIGTERM");
    process.exit(0);
  });
