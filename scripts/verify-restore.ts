// Restore test (index Phase 19 verification; phase-19-plan.md §5). Compares a
// restored database with its source, read-only: the applied migrations, and
// the row count of every table. Exit 0 when they match.
//
//   SOURCE_DATABASE_URL=… RESTORED_DATABASE_URL=… npm run verify:restore
//
// For a point-in-time restore, the source keeps changing: run it against the
// snapshot's own source copy, or pass --allow-newer to accept a source with
// more rows than the restore (never fewer).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg") as typeof import("pg");

const source = process.env.SOURCE_DATABASE_URL;
const restored = process.env.RESTORED_DATABASE_URL;
const allowNewer = process.argv.includes("--allow-newer");
if (!source || !restored) {
  process.stderr.write("Set SOURCE_DATABASE_URL and RESTORED_DATABASE_URL.\n");
  process.exit(2);
}

async function inventory(url: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("SET default_transaction_read_only = on");
    const tables = await c.query<{ name: string }>(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
    );
    const counts = new Map<string, number>();
    for (const { name } of tables.rows) {
      const r = await c.query<{ n: string }>(
        `SELECT count(*)::text AS n FROM "public"."${name.replaceAll('"', '""')}"`,
      );
      counts.set(name, Number(r.rows[0]!.n));
    }
    const migrations = await c.query<{ name: string }>(
      `SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1`,
    );
    return { counts, migrations: migrations.rows.map((r) => r.name) };
  } finally {
    await c.end();
  }
}

const [a, b] = await Promise.all([inventory(source), inventory(restored)]);
const problems: string[] = [];
if (a.migrations.join() !== b.migrations.join())
  problems.push(
    `migrations differ: source ${a.migrations.length}, restored ${b.migrations.length}`,
  );
for (const [table, n] of a.counts) {
  const m = b.counts.get(table);
  if (m === undefined) problems.push(`${table}: missing in the restore`);
  else if (m !== n && !(allowNewer && n > m))
    problems.push(`${table}: source ${n} rows, restored ${m}`);
}
for (const table of b.counts.keys())
  if (!a.counts.has(table)) problems.push(`${table}: only in the restore`);

const rows = [...b.counts.values()].reduce((s, n) => s + n, 0);
process.stdout.write(
  `${b.counts.size} tables, ${rows} rows, ${b.migrations.length} migrations in the restore.\n`,
);
if (problems.length) {
  process.stdout.write(
    `Restore check FAILED:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`,
  );
  process.exit(1);
}
process.stdout.write("Restore check passed.\n");
