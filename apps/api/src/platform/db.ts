// One Prisma client per process (compatibility check 4): connect at start-up,
// prove the credentials with SELECT 1, disconnect last on shutdown.
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../generated/prisma/client.ts";

export type Db = PrismaClient;

export function createDb(databaseUrl: string): Db {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
}

/** `$connect` alone may be lazy; SELECT 1 proves the database is reachable. */
export async function checkDb(db: Db): Promise<void> {
  await db.$connect();
  await db.$queryRaw`SELECT 1`;
}
