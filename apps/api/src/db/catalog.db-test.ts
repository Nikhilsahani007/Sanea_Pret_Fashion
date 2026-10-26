// The migrated database itself: every handwritten object, foreign key and
// index exists, conventions hold, and only reference data is present.
// Prisma's drift check cannot see CHECKs or triggers, so these queries can.
import { readdirSync, readFileSync } from "node:fs";

import { AdminRole } from "@sanea/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import {
  APPEND_ONLY_TABLES,
  APPROVED_SIZES,
  HANDWRITTEN_CHECKS,
  HANDWRITTEN_EXTENSIONS,
  HANDWRITTEN_FUNCTIONS,
  HANDWRITTEN_SEQUENCES,
  HANDWRITTEN_TRIGGERS,
  HANDWRITTEN_VIEWS,
  SEARCH_TRIGGERS,
} from "./handwritten.ts";
import { createTestDatabase } from "./testing/database.ts";

const migrations = new URL("../../../../prisma/migrations/", import.meta.url);
const dirs = readdirSync(migrations, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const sql = dirs
  .map((d) => readFileSync(new URL(`${d}/migration.sql`, migrations), "utf8"))
  .join("\n");

/** Only these foreign keys may cascade (database-design.md, D-055). */
const CASCADES = new Set([
  "admin_invite.admin_user_id",
  "admin_recovery_code.admin_user_id",
  "admin_session.admin_user_id",
  "cart_item.cart_id",
  "collection_product.collection_id",
  "collection_product.product_id",
  "product_image.product_id",
]);

let db: PrismaClient;
let drop: () => Promise<void>;
const q = <T>(text: string) => db.$queryRawUnsafe<T[]>(text);

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
});
afterAll(() => drop());

describe("migration state", () => {
  it("records every migration as applied", async () => {
    const rows = await q<{ migration_name: string; finished: boolean }>(
      `SELECT "migration_name", "finished_at" IS NOT NULL AS "finished" FROM "_prisma_migrations"`,
    );
    // Every migration folder, in order, applied and finished.
    expect(rows.map((r) => r.migration_name).sort()).toEqual(dirs);
    expect(rows.every((r) => r.finished)).toBe(true);
  });

  it("runs on PostgreSQL 18", async () => {
    const [row] = await q<{ v: number }>(
      `SELECT current_setting('server_version_num')::int AS v`,
    );
    expect(row?.v).toBeGreaterThanOrEqual(180000);
  });
});

describe("tables and scope", () => {
  it("has exactly the approved tables (plus Prisma's own)", async () => {
    const rows = await q<{ t: string }>(
      `SELECT table_name AS t FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1`,
    );
    const names = rows
      .map((r) => r.t)
      .filter((t) => t !== "_prisma_migrations");
    expect(names).toEqual([
      "admin_invite",
      "admin_recovery_code",
      "admin_session",
      "admin_user",
      "audit_log",
      "cart",
      "cart_item",
      "category",
      "collection",
      "collection_product",
      "colour",
      "content_block",
      "enquiry",
      "gst_rule",
      "inventory_level",
      "media_asset",
      "navigation_item",
      "order",
      "order_item",
      "order_status_event",
      "page",
      "payment",
      "payment_event",
      "product",
      "product_image",
      "product_variant",
      "refund",
      "shipment",
      "size",
      "size_chart",
      "stock_movement",
      "stock_reservation",
      "store_setting",
      "whatsapp_click",
    ]);
  });

  it("has GST and order-link columns only on Phase 15 tables, and no customer column", async () => {
    const rows = await q<{ c: string }>(
      `SELECT table_name || '.' || column_name AS c FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name ~ '(gst|tax|order_id|customer)'
       ORDER BY 1`,
    );
    expect(rows.map((r) => r.c)).toEqual([
      "order.tax_paise",
      "order_item.gst_rate_bps",
      "order_item.order_id",
      "order_status_event.order_id",
      "payment.order_id",
      "shipment.order_id",
      "stock_reservation.order_id",
    ]);
  });

  it("has exactly one search column: product.search_vector (D-081)", async () => {
    const rows = await q<{ c: string; type: string; nullable: string }>(
      `SELECT table_name || '.' || column_name AS c, data_type AS type, is_nullable AS nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND (column_name ~ 'search' OR data_type = 'tsvector')`,
    );
    expect(rows).toEqual([
      { c: "product.search_vector", type: "tsvector", nullable: "NO" },
    ]);
  });

  it("inserts exactly the six approved sizes, the Rehma draft, and no other rows", async () => {
    const sizes = await q<{ label: string; position: number }>(
      `SELECT "label", "position" FROM "size" ORDER BY "position"`,
    );
    expect(sizes.map((s) => s.label)).toEqual([...APPROVED_SIZES]);
    expect(sizes.map((s) => s.position)).toEqual([1, 2, 3, 4, 5, 6]);
    const counts = await q<{ t: string; n: number }>(
      `SELECT relname AS t, (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I', relname), false, true, '')))[1]::text::int AS n
       FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
         AND relname NOT IN ('size', 'page', '_prisma_migrations')`,
    );
    expect(counts.filter((c) => c.n !== 0)).toEqual([]);
    // The Rehma Foundation placeholder (Q10-9): a draft, unpublished, unverified.
    expect(
      await q(
        `SELECT "slug", "status"::text AS "status", "requires_verification" AS "rv", "published_body" IS NULL AS "unpublished", "verified_at" IS NULL AS "unverified" FROM "page"`,
      ),
    ).toEqual([
      {
        slug: "rehma-foundation",
        status: "DRAFT",
        rv: true,
        unpublished: true,
        unverified: true,
      },
    ]);
    // 34 tables, less `size` and `page`, which are checked above.
    expect(counts).toHaveLength(32);
  });
});

describe("handwritten objects exist in the live catalogue", () => {
  it.each(HANDWRITTEN_EXTENSIONS)("extension %s", async (name) => {
    expect(
      await q(`SELECT 1 FROM pg_extension WHERE extname = '${name}'`),
    ).toHaveLength(1);
  });

  it.each(HANDWRITTEN_SEQUENCES)("sequence %s", async (name) => {
    expect(
      await q(
        `SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = '${name}' AND relnamespace = 'public'::regnamespace`,
      ),
    ).toHaveLength(1);
  });

  it.each(HANDWRITTEN_FUNCTIONS)("function %s", async (name) => {
    expect(
      await q(
        `SELECT 1 FROM pg_proc WHERE proname = '${name}' AND pronamespace = 'public'::regnamespace`,
      ),
    ).toHaveLength(1);
  });

  it("every view is listed, with its columns in order, and no unlisted ones", async () => {
    const views = await q<{ name: string }>(
      `SELECT viewname AS name FROM pg_views WHERE schemaname = 'public'`,
    );
    expect(views.map((v) => v.name).sort()).toEqual(
      HANDWRITTEN_VIEWS.map((v) => v.name).sort(),
    );
    for (const view of HANDWRITTEN_VIEWS) {
      const cols = await q<{ c: string }>(
        `SELECT column_name AS c FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = '${view.name}' ORDER BY ordinal_position`,
      );
      expect(
        cols.map((c) => c.c),
        view.name,
      ).toEqual([...view.columns]);
    }
  });

  it("every CHECK constraint, validated, and no unlisted ones", async () => {
    const rows = await q<{ t: string; name: string; valid: boolean }>(
      `SELECT conrelid::regclass::text AS t, conname AS name, convalidated AS valid
       FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
    );
    const live = rows.map((r) => `${r.t.replaceAll('"', "")}.${r.name}`).sort();
    expect(live).toEqual(
      HANDWRITTEN_CHECKS.map((c) => `${c.table}.${c.name}`).sort(),
    );
    expect(rows.every((r) => r.valid)).toBe(true);
  });

  it("every trigger is listed, enabled and on the right table and function", async () => {
    const rows = await q<{
      t: string;
      name: string;
      enabled: string;
      fn: string;
      truncate: boolean;
      row_level: boolean;
    }>(
      `SELECT tgrelid::regclass::text AS t, tgname AS name, tgenabled::text AS enabled,
              tgfoid::regproc::text AS fn, (tgtype & 32) <> 0 AS truncate, (tgtype & 1) <> 0 AS row_level
       FROM pg_trigger WHERE NOT tgisinternal`,
    );
    expect(rows.map((r) => `${r.t}.${r.name}`).sort()).toEqual(
      [...HANDWRITTEN_TRIGGERS, ...SEARCH_TRIGGERS]
        .map((t) => `${t.table}.${t.name}`)
        .sort(),
    );
    for (const r of rows) expect(r.enabled, r.name).toBe("O");
    for (const t of HANDWRITTEN_TRIGGERS) {
      const r = rows.find((x) => x.t === t.table && x.name === t.name);
      expect(r?.fn, t.name).toBe("reject_append_only_change");
    }
    // Search triggers: AFTER, row-level, never on TRUNCATE (D-081).
    for (const t of SEARCH_TRIGGERS) {
      const r = rows.find((x) => x.t === t.table && x.name === t.name);
      expect(r?.fn, t.name).toBe(t.fn);
      expect(r?.row_level, t.name).toBe(true);
      expect(r?.truncate, t.name).toBe(false);
    }
    for (const table of APPEND_ONLY_TABLES) {
      expect(
        rows.some((r) => r.t === table && r.row_level && !r.truncate),
      ).toBe(true);
      expect(
        rows.some((r) => r.t === table && r.truncate && !r.row_level),
      ).toBe(true);
    }
  });

  it("every foreign key in the migration, with the approved delete rule", async () => {
    const expected = [
      ...sql.matchAll(
        /ALTER TABLE "([a-z_]+)" ADD CONSTRAINT "([a-z_]+)" FOREIGN KEY \("([a-z_]+)"\)/g,
      ),
    ].map((m) => ({ table: m[1], name: m[2], column: m[3] }));
    // 27 up to Phase 11; Phase 13 adds 3 for enquiries and 2 for clicks;
    // Phase 15 adds 10 for orders, payments, refunds and GST rules.
    expect(expected).toHaveLength(42);
    const rows = await q<{ name: string; t: string; del: string }>(
      `SELECT conname AS name, conrelid::regclass::text AS t, confdeltype::text AS del
       FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace`,
    );
    expect(rows.map((r) => r.name).sort()).toEqual(
      expected.map((e) => e.name).sort(),
    );
    for (const e of expected) {
      const live = rows.find((r) => r.name === e.name);
      // 'c' cascade, 'r' restrict
      expect(live?.del, e.name).toBe(
        CASCADES.has(`${e.table}.${e.column}`) ? "c" : "r",
      );
    }
  });

  it("every index in the migration", async () => {
    const expected = [
      ...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([a-z_]+)"/g),
    ].map((m) => m[1]);
    const rows = await q<{ name: string }>(
      `SELECT indexname AS name FROM pg_indexes WHERE schemaname = 'public' AND indexname NOT LIKE '%_pkey'`,
    );
    expect(rows.map((r) => r.name).sort()).toEqual([...expected].sort());
    expect(expected.length).toBeGreaterThan(30);
  });
});

describe("conventions", () => {
  it("every uuid primary key defaults to uuidv7()", async () => {
    const rows = await q<{ t: string; d: string | null }>(
      `SELECT table_name AS t, column_default AS d FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name = 'id' AND data_type = 'uuid'`,
    );
    expect(rows).toHaveLength(30);
    for (const r of rows) expect(r.d, r.t).toBe("uuidv7()");
  });

  it("generates version-7 ids that sort by creation", async () => {
    await q(
      `INSERT INTO "colour" ("name", "slug", "swatch_hex") VALUES ('TEST A', 'test-a', '#000000'), ('TEST B', 'test-b', '#FFFFFF')`,
    );
    const rows = await q<{ id: string; v: number }>(
      `SELECT "id"::text AS id, uuid_extract_version("id") AS v FROM "colour" ORDER BY "slug"`,
    );
    expect(rows.map((r) => r.v)).toEqual([7, 7]);
    expect(rows[0]!.id < rows[1]!.id).toBe(true);
    await q(`DELETE FROM "colour" WHERE "slug" IN ('test-a', 'test-b')`);
  });

  it("every timestamp column is timestamptz", async () => {
    const rows = await q<{ c: string; type: string }>(
      `SELECT table_name || '.' || column_name AS c, data_type AS type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name <> '_prisma_migrations' AND data_type LIKE 'timestamp%'`,
    );
    expect(rows.length).toBeGreaterThan(30);
    expect(rows.filter((r) => r.type !== "timestamp with time zone")).toEqual(
      [],
    );
  });

  it("stores money as 32-bit integers", async () => {
    const rows = await q<{ c: string; type: string }>(
      `SELECT column_name AS c, data_type AS type FROM information_schema.columns
       WHERE table_schema = 'public' AND column_name LIKE '%paise'`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.filter((r) => r.type !== "integer")).toEqual([]);
  });

  it("admin_role enum values match the shared role list", async () => {
    const rows = await q<{ v: string }>(
      `SELECT enumlabel AS v FROM pg_enum WHERE enumtypid = 'admin_role'::regtype ORDER BY enumsortorder`,
    );
    expect(rows.map((r) => r.v).sort()).toEqual(
      Object.values(AdminRole).sort(),
    );
  });

  it("content_block_type has the seven approved block types", async () => {
    const rows = await q<{ v: string }>(
      `SELECT enumlabel AS v FROM pg_enum WHERE enumtypid = 'content_block_type'::regtype`,
    );
    expect(rows).toHaveLength(7);
  });
});
