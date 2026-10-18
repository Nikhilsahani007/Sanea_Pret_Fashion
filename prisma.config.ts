import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Node 24 reads .env itself, so no dotenv dependency (D-052).
if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.DATABASE_URL;
// Only for drift checks that replay the migrations folder (CI, validation).
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // Development data only (apps/api/src/db/seed.ts).
    seed: "node apps/api/src/db/seed.ts",
  },
  // Optional so `prisma generate` runs in CI without a database; commands
  // that need one fail until DATABASE_URL is set.
  ...(url
    ? {
        datasource: {
          url,
          ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
        },
      }
    : {}),
});
