// Admin inventory reads (phase-9-plan.md §3.4): the stock list, with the
// low-stock filter read through the `low_stock_variant` view (Q9-1), and the
// movement history. Keyset paging; every value a bound parameter.
import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";

const { sql, join } = Prisma;

export type StockRow = {
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productStatus: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  colour: string;
  size: string;
  isActive: boolean;
  onHand: number;
  reserved: number;
  available: number;
  lowStockThreshold: number;
  lowStock: boolean;
};

/** `%` and `_` are literal in a SKU search. */
const likePrefix = (text: string) =>
  `${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listStock(
  db: Db,
  q: {
    lowStock?: boolean | undefined;
    sku?: string | undefined;
    productId?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
): Promise<{ items: StockRow[]; nextCursor: string | null }> {
  const conds = [sql`TRUE`];
  if (q.lowStock)
    conds.push(
      sql`il."variant_id" IN (SELECT "variant_id" FROM "low_stock_variant")`,
    );
  if (q.sku) conds.push(sql`v."sku" LIKE ${likePrefix(q.sku.toUpperCase())}`);
  if (q.productId) conds.push(sql`v."product_id" = ${q.productId}::uuid`);
  // SKUs are unique, so they are the paging key.
  if (q.cursor) conds.push(sql`v."sku" > ${q.cursor}`);
  const rows = await db.$queryRaw<StockRow[]>(sql`
    SELECT v."id"::text AS "variantId", v."sku", p."id"::text AS "productId", p."name" AS "productName",
      p."status"::text AS "productStatus", c."name" AS "colour", s."label" AS "size", v."is_active" AS "isActive",
      il."on_hand" AS "onHand", il."reserved", il."on_hand" - il."reserved" AS "available",
      il."low_stock_threshold" AS "lowStockThreshold",
      (v."is_active" AND il."on_hand" - il."reserved" <= il."low_stock_threshold") AS "lowStock"
    FROM "inventory_level" il
    JOIN "product_variant" v ON v."id" = il."variant_id"
    JOIN "product" p ON p."id" = v."product_id"
    JOIN "colour" c ON c."id" = v."colour_id"
    JOIN "size" s ON s."id" = v."size_id"
    WHERE ${join(conds, " AND ")}
    ORDER BY v."sku"
    LIMIT ${q.limit + 1}`);
  const items = rows.slice(0, q.limit).map((r) => ({
    ...r,
    onHand: Number(r.onHand),
    reserved: Number(r.reserved),
    available: Number(r.available),
    lowStockThreshold: Number(r.lowStockThreshold),
  }));
  return {
    items,
    nextCursor: rows.length > q.limit ? (items.at(-1)?.sku ?? null) : null,
  };
}

export type MovementRow = {
  id: string;
  variantId: string;
  sku: string;
  type: string;
  onHandDelta: number;
  reservedDelta: number;
  reason: string | null;
  referenceType: string | null;
  actorName: string | null;
  createdAt: Date;
};

export async function listMovements(
  db: Db,
  q: {
    variantId?: string | undefined;
    type?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    limit: number;
    cursor?: string | undefined;
  },
): Promise<{ items: MovementRow[]; nextCursor: string | null }> {
  const conds = [sql`TRUE`];
  if (q.variantId) conds.push(sql`m."variant_id" = ${q.variantId}::uuid`);
  if (q.type) conds.push(sql`m."type" = ${q.type}::"stock_movement_type"`);
  if (q.from) conds.push(sql`m."created_at" >= ${q.from}::timestamptz`);
  if (q.to) conds.push(sql`m."created_at" < ${q.to}::timestamptz`);
  // UUID v7 ids sort by creation time: newest first, keyset on the id.
  if (q.cursor) conds.push(sql`m."id" < ${q.cursor}::uuid`);
  const rows = await db.$queryRaw<MovementRow[]>(sql`
    SELECT m."id"::text AS "id", m."variant_id"::text AS "variantId", v."sku", m."type"::text AS "type",
      m."on_hand_delta" AS "onHandDelta", m."reserved_delta" AS "reservedDelta", m."reason",
      m."reference_type"::text AS "referenceType", a."name" AS "actorName", m."created_at" AS "createdAt"
    FROM "stock_movement" m
    JOIN "product_variant" v ON v."id" = m."variant_id"
    LEFT JOIN "admin_user" a ON a."id" = m."actor_admin_id"
    WHERE ${join(conds, " AND ")}
    ORDER BY m."id" DESC
    LIMIT ${q.limit + 1}`);
  const items = rows.slice(0, q.limit);
  return {
    items,
    nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null,
  };
}
