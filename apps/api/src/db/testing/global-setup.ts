// Vitest global setup for `npm run test:integration` (D-059): builds the
// migrated template database once, checks it for drift, and removes it after.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  TEMPLATE_DATABASE,
  dropDatabase,
  testServerUrl,
  urlFor,
  withServer,
} from "./database.ts";

const rootUrl = new URL("../../../../../", import.meta.url);
const root = fileURLToPath(rootUrl);
const prismaCli = fileURLToPath(
  new URL("node_modules/prisma/build/index.js", rootUrl),
);

function prisma(args: string[], databaseUrl: string): string {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export async function setup(): Promise<void> {
  testServerUrl();
  await dropDatabase(TEMPLATE_DATABASE);
  await withServer((db) =>
    db.$executeRawUnsafe(`CREATE DATABASE "${TEMPLATE_DATABASE}"`),
  );
  const url = urlFor(TEMPLATE_DATABASE);
  prisma(["migrate", "deploy"], url);
  // Exit code 2 (a difference) throws, failing the run.
  prisma(
    [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ],
    url,
  );
}

export async function teardown(): Promise<void> {
  await dropDatabase(TEMPLATE_DATABASE);
}
