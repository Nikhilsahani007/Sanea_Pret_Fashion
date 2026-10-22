// Creates the end-to-end database fresh and migrates it, or drops it.
//   node e2e/support/reset-db.ts create|drop
// Only a `sanea_test…` database on loopback (TEST_DATABASE_URL, D-059).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  dropDatabase,
  urlFor,
  withServer,
} from "../../apps/api/src/db/testing/database.ts";

export const E2E_DATABASE = "sanea_test_e2e";

const action = process.argv[2];
await dropDatabase(E2E_DATABASE);
if (action === "create") {
  await withServer((db) =>
    db.$executeRawUnsafe(`CREATE DATABASE "${E2E_DATABASE}"`),
  );
  const root = fileURLToPath(new URL("../../", import.meta.url));
  execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL(
          "node_modules/prisma/build/index.js",
          new URL("../../", import.meta.url),
        ),
      ),
      "migrate",
      "deploy",
    ],
    {
      cwd: root,
      env: { ...process.env, DATABASE_URL: urlFor(E2E_DATABASE) },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
}
