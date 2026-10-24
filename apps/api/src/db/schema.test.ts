// Static checks on the schema and migration SQL; no database needed (D-059).
// Database-level checks of the same objects run in the integration tests.
import { readdirSync, readFileSync } from "node:fs";

import { AdminRole as SharedAdminRole } from "@sanea/shared";
import { describe, expect, it } from "vitest";

import { AdminRole as DbAdminRole } from "../generated/prisma/enums.ts";
import {
  APPEND_ONLY_TABLES,
  APPROVED_SIZES,
  HANDWRITTEN_CHECKS,
  HANDWRITTEN_EXTENSIONS,
  HANDWRITTEN_FUNCTIONS,
  HANDWRITTEN_INDEXES,
  HANDWRITTEN_SEQUENCES,
  HANDWRITTEN_TRIGGERS,
} from "./handwritten.ts";

const migrations = new URL("../../../../prisma/migrations/", import.meta.url);
const dirs = readdirSync(migrations, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const sql = dirs
  .map((d) => readFileSync(new URL(`${d}/migration.sql`, migrations), "utf8"))
  .join("\n");
const schema = readFileSync(
  new URL("../../../../prisma/schema.prisma", import.meta.url),
  "utf8",
);

const tables = [...sql.matchAll(/^CREATE TABLE "([a-z_]+)"/gm)].map(
  (m) => m[1],
);

describe("database roles", () => {
  it("match the shared AdminRole list exactly", () => {
    expect(Object.values(DbAdminRole).sort()).toEqual(
      Object.values(SharedAdminRole).sort(),
    );
  });
});

describe("migration SQL contains every handwritten object", () => {
  it.each(HANDWRITTEN_EXTENSIONS)("extension %s", (name) => {
    expect(sql).toContain(`CREATE EXTENSION IF NOT EXISTS "${name}";`);
  });

  it.each(HANDWRITTEN_FUNCTIONS)("function %s", (name) => {
    expect(sql).toContain(`CREATE FUNCTION "${name}"(`);
  });

  it.each(HANDWRITTEN_INDEXES)("index $name on $table", ({ table, name }) => {
    expect(sql).toContain(`CREATE INDEX "${name}" ON "${table}"`);
  });

  it.each(HANDWRITTEN_CHECKS)("CHECK $name on $table", ({ table, name }) => {
    expect(sql).toMatch(
      new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}"\\s+CHECK`),
    );
  });

  it.each(HANDWRITTEN_SEQUENCES)("sequence %s", (name) => {
    expect(sql).toContain(`CREATE SEQUENCE "${name}"`);
  });

  it.each(HANDWRITTEN_TRIGGERS)(
    "trigger $name on $table",
    ({ table, name }) => {
      expect(sql).toMatch(
        new RegExp(
          `CREATE TRIGGER "${name}"\\s+BEFORE [A-Z ]+ ON "${table}"\\s+FOR EACH (ROW|STATEMENT) EXECUTE FUNCTION "reject_append_only_change"\\(\\)`,
        ),
      );
    },
  );

  it("covers UPDATE, DELETE and TRUNCATE on each append-only table", () => {
    for (const table of APPEND_ONLY_TABLES) {
      expect(sql).toContain(`BEFORE UPDATE OR DELETE ON "${table}"`);
      expect(sql).toContain(`BEFORE TRUNCATE ON "${table}"`);
    }
  });

  it("raises with the default SQLSTATE (no ERRCODE)", () => {
    expect(sql).toContain("RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;");
    expect(sql).not.toMatch(/ERRCODE/);
  });

  it("names no CHECK constraint that the list does not know", () => {
    const named = [...sql.matchAll(/ADD CONSTRAINT "([a-z_]+_check)"/g)].map(
      (m) => m[1],
    );
    expect(named.sort()).toEqual(HANDWRITTEN_CHECKS.map((c) => c.name).sort());
  });
});

describe("reference data", () => {
  it("inserts exactly the approved sizes, in order (D-029, D-058)", () => {
    const insert = sql.match(
      /INSERT INTO "size" \("label", "position"\) VALUES([^;]+);/,
    );
    const rows = [...(insert?.[1] ?? "").matchAll(/\('([^']+)', (\d+)\)/g)];
    expect(rows.map((r) => r[1])).toEqual([...APPROVED_SIZES]);
    expect(rows.map((r) => Number(r[2]))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sql.match(/INSERT INTO/g)).toHaveLength(1);
  });
});

describe("Phase 6 scope and conventions", () => {
  it("creates exactly the approved tables (database-design.md §6)", () => {
    expect(tables.sort()).toEqual(
      [
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
        "inventory_level",
        "media_asset",
        "navigation_item",
        "gst_rule",
        "order",
        "order_item",
        "order_status_event",
        "payment",
        "payment_event",
        "refund",
        "shipment",
        "page",
        "product",
        "product_image",
        "product_variant",
        "size",
        "size_chart",
        "stock_movement",
        "stock_reservation",
        "store_setting",
        "whatsapp_click",
      ].sort(),
    );
  });

  it("stores no GST rate, order link or search field (D-033, D-054)", () => {
    // Phase 6 and 7 migrations only; search arrives in Phase 8.
    const early = dirs
      .filter((d) => d < "20261024")
      .map((d) =>
        readFileSync(new URL(`${d}/migration.sql`, migrations), "utf8"),
      )
      .join("\n");
    expect(early).not.toMatch(/gst|order_id|search_vector|tsvector|pg_trgm/i);
    // Order links and the GST rules table arrive in Phase 15, with no rates (B-14).
    const beforeOrders = dirs
      .filter((d) => d < "20261024180000")
      .map((d) =>
        readFileSync(new URL(`${d}/migration.sql`, migrations), "utf8"),
      )
      .join("\n");
    expect(beforeOrders).not.toMatch(/gst|order_id/i);
    expect(sql).not.toMatch(/INSERT INTO "gst_rule"/);
  });

  it("uses snake_case for every table and column (D-056)", () => {
    const quoted = [...sql.matchAll(/^\s+"([^"]+)" /gm)].map((m) => m[1]);
    expect(quoted.length).toBeGreaterThan(100);
    for (const name of [...tables, ...quoted]) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("generates every uuid primary key with uuidv7() (D-051)", () => {
    const ids = [...sql.matchAll(/^\s+"id" ([^,]+),/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(id).toBe("UUID NOT NULL DEFAULT uuidv7()");
  });

  it("stores every timestamp with time zone", () => {
    expect(sql).toMatch(/TIMESTAMPTZ\(3\)/);
    expect(sql).not.toMatch(/TIMESTAMP\(3\)/);
  });

  it("stores money as 32-bit integer paise", () => {
    const money = [...sql.matchAll(/^\s+"([a-z_]*paise)" ([A-Z]+)/gm)];
    expect(money.map((m) => m[1]).sort()).toEqual([
      "amount_paise", // payment
      "amount_paise", // refund
      "cod_fee_paise",
      "compare_at_price_paise",
      "discount_paise",
      "line_total_paise",
      "price_paise",
      "shipping_paise",
      "subtotal_paise",
      "tax_paise",
      "threshold_paise",
      "total_paise",
      "unit_price_paise",
    ]);
    for (const m of money) expect(m[2]).toBe("INTEGER");
  });

  it("cascades admin sessions on admin deletion and stores only a hash", () => {
    expect(sql).toMatch(
      /"admin_session" ADD CONSTRAINT "[a-z_]+" FOREIGN KEY \("admin_user_id"\) REFERENCES "admin_user"\("id"\) ON DELETE CASCADE/,
    );
    expect(sql).toMatch(/"token_hash" BYTEA NOT NULL/);
    expect(schema).not.toMatch(/^\s+token\s/m);
  });

  it("makes admin email case-insensitive and unique", () => {
    expect(sql).toMatch(/"email" CITEXT NOT NULL/);
    expect(sql).toContain('CREATE UNIQUE INDEX "admin_user_email_key"');
  });
});
