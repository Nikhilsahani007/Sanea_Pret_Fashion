// Integration-test databases (D-059). Not used by production code.
//
// TEST_DATABASE_URL names a disposable server and a database called
// `sanea_test…` on loopback. The global setup migrates a template database;
// each test file clones it, so files never share rows.
import { randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../generated/prisma/client.ts";

export const TEMPLATE_DATABASE = "sanea_test_template";
const TEST_NAME = /^sanea_test[a-z0-9_]*$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Refuses anything but a `sanea_test…` database on loopback. */
export function testServerUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set (.env.example)");
  const url = new URL(raw);
  if (!LOOPBACK.has(url.hostname))
    throw new Error("TEST_DATABASE_URL must point at 127.0.0.1 or localhost");
  if (!TEST_NAME.test(url.pathname.slice(1)))
    throw new Error("TEST_DATABASE_URL must name a sanea_test… database");
  return url;
}

export function urlFor(database: string): string {
  assertTestDatabase(database);
  const url = testServerUrl();
  url.pathname = `/${database}`;
  return url.toString();
}

/** The only guard before CREATE or DROP DATABASE. */
export function assertTestDatabase(name: string): void {
  if (!TEST_NAME.test(name))
    throw new Error(`refusing to touch non-test database "${name}"`);
}

export function connect(url: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}

/** Runs `work` against the server's maintenance (`sanea_test…`) database. */
export async function withServer<T>(
  work: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  const db = connect(testServerUrl().toString());
  try {
    return await work(db);
  } finally {
    await db.$disconnect();
  }
}

export async function dropDatabase(name: string): Promise<void> {
  assertTestDatabase(name);
  await withServer((db) =>
    db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  );
}

/** A fresh clone of the migrated template for one test file. */
export async function createTestDatabase(): Promise<{
  db: PrismaClient;
  name: string;
  drop: () => Promise<void>;
}> {
  const name = `sanea_test_${randomBytes(6).toString("hex")}`;
  assertTestDatabase(name);
  await withServer((db) =>
    db.$executeRawUnsafe(
      `CREATE DATABASE "${name}" TEMPLATE "${TEMPLATE_DATABASE}"`,
    ),
  );
  const db = connect(urlFor(name));
  return {
    db,
    name,
    drop: async () => {
      await db.$disconnect();
      await dropDatabase(name);
    },
  };
}

export type DbError = { code: string; message: string };

/** PostgreSQL's SQLSTATE and message from a Prisma error, if it has one. */
export function dbError(error: unknown): DbError | undefined {
  const meta = (error as { meta?: Record<string, unknown> }).meta;
  const cause = (meta?.driverAdapterError as { cause?: unknown } | undefined)
    ?.cause as { originalCode?: string; originalMessage?: string } | undefined;
  if (cause?.originalCode)
    return { code: cause.originalCode, message: cause.originalMessage ?? "" };
  return undefined;
}

/**
 * Runs one SQL statement in its own transaction and returns PostgreSQL's
 * rejection. The failed statement rolls the transaction back.
 */
export async function rejectionOf(
  db: PrismaClient,
  sql: string,
): Promise<DbError | "accepted"> {
  try {
    await db.$transaction((tx) => tx.$executeRawUnsafe(sql));
    return "accepted";
  } catch (error) {
    const found = dbError(error);
    if (!found) throw error;
    return found;
  }
}
