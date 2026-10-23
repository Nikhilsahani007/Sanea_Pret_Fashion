// Public product listing, facets and search (api-specification.md §3,
// system-design.md §8, D-081, D-084). Raw SQL only through Prisma.sql tagged
// templates (security-design.md §3); every value is a bound parameter.
//
// Visible to shoppers: product PUBLISHED, its category PUBLISHED, and at least
// one active variant. Variant filters (size, colour, price, in stock) must all
// hold for the same active variant. Facets are counted over the visible
// products that match the category, collection and search filters, before
// the variant filters, so shoppers can see what other choices exist.
import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";

const { sql, join, empty } = Prisma;

export type ListingFilters = {
  readonly category?: string | undefined;
  readonly collection?: string | undefined;
  readonly sizes?: readonly string[] | undefined;
  readonly colours?: readonly string[] | undefined;
  readonly priceMin?: number | undefined;
  readonly priceMax?: number | undefined;
  readonly inStock?: boolean | undefined;
  /** Search text (2 to 100 characters); `simple` configuration plus trigram typo tolerance. */
  readonly q?: string | undefined;
};

export type ListingSort = "newest" | "price_asc" | "price_desc" | "relevance";

export type ListingCursor =
  | { s: "newest"; t: string; id: string }
  | { s: "price_asc" | "price_desc"; p: number; id: string }
  | { s: "relevance"; o: number };

/** Fixed display bands for the price facet, in paise (₹). */
export const PRICE_BANDS: readonly { min: number; max: number | null }[] = [
  { min: 0, max: 100_000 },
  { min: 100_000, max: 200_000 },
  { min: 200_000, max: 300_000 },
  { min: 300_000, max: 500_000 },
  { min: 500_000, max: null },
];

/** Visible to shoppers (also used by content product rows, Phase 10). */
export function baseConditions(
  f: ListingFilters,
  now: Date,
  withCategory = true,
): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [
    sql`p."status" = 'PUBLISHED'`,
    sql`c."status" = 'PUBLISHED'`,
    sql`EXISTS (SELECT 1 FROM "product_variant" av WHERE av."product_id" = p."id" AND av."is_active")`,
  ];
  if (withCategory && f.category) {
    // A category also lists its published sub-categories' products.
    conds.push(sql`(c."slug" = ${f.category} OR c."parent_id" IN (
      SELECT pc."id" FROM "category" pc WHERE pc."slug" = ${f.category} AND pc."status" = 'PUBLISHED'))`);
  }
  if (f.collection) {
    conds.push(sql`EXISTS (SELECT 1 FROM "collection_product" cp
      JOIN "collection" col ON col."id" = cp."collection_id"
      WHERE cp."product_id" = p."id" AND col."slug" = ${f.collection} AND col."status" = 'PUBLISHED'
        AND (col."starts_at" IS NULL OR col."starts_at" <= ${now})
        AND (col."ends_at" IS NULL OR col."ends_at" > ${now}))`);
  }
  if (f.q) {
    conds.push(
      sql`(p."search_vector" @@ websearch_to_tsquery('simple', ${f.q}) OR ${f.q} <% p."name")`,
    );
  }
  return conds;
}

function variantCondition(f: ListingFilters): Prisma.Sql | null {
  const conds: Prisma.Sql[] = [];
  if (f.sizes?.length) conds.push(sql`s."label" = ANY(${[...f.sizes]})`);
  if (f.colours?.length) conds.push(sql`co."slug" = ANY(${[...f.colours]})`);
  if (f.priceMin !== undefined)
    conds.push(sql`v."price_paise" >= ${f.priceMin}`);
  if (f.priceMax !== undefined)
    conds.push(sql`v."price_paise" <= ${f.priceMax}`);
  if (f.inStock) conds.push(sql`COALESCE(il."on_hand" - il."reserved", 0) > 0`);
  if (conds.length === 0) return null;
  return sql`EXISTS (SELECT 1 FROM "product_variant" v
    JOIN "size" s ON s."id" = v."size_id"
    JOIN "colour" co ON co."id" = v."colour_id"
    LEFT JOIN "inventory_level" il ON il."variant_id" = v."id"
    WHERE v."product_id" = p."id" AND v."is_active" AND ${join(conds, " AND ")})`;
}

const FROM = sql`FROM "product" p JOIN "category" c ON c."id" = p."category_id"`;

/** The product table joined to its category, for `baseConditions`. */
export const PRODUCT_FROM = FROM;

export type ListedProduct = {
  id: string;
  slug: string;
  name: string;
  labels: string[];
  publishedAt: Date;
  fromPricePaise: number;
  rank: number | null;
};

export async function listProducts(
  db: Db,
  f: ListingFilters,
  sort: ListingSort,
  limit: number,
  cursor: ListingCursor | undefined,
  now: Date,
): Promise<{ items: ListedProduct[]; next: ListingCursor | null }> {
  const conds = baseConditions(f, now);
  const variant = variantCondition(f);
  if (variant) conds.push(variant);
  const rank = f.q
    ? sql`(ts_rank(p."search_vector", websearch_to_tsquery('simple', ${f.q})) + word_similarity(${f.q}, p."name"))::float8`
    : sql`NULL::float8`;

  let after: Prisma.Sql = empty;
  let order: Prisma.Sql;
  let offset = 0;
  switch (sort) {
    case "newest":
      order = sql`"publishedAt" DESC, "id" DESC`;
      if (cursor?.s === "newest")
        after = sql`WHERE ("publishedAt", "id") < (${cursor.t}::timestamptz, ${cursor.id}::uuid)`;
      break;
    case "price_asc":
      order = sql`"fromPricePaise" ASC, "id" ASC`;
      if (cursor?.s === "price_asc")
        after = sql`WHERE ("fromPricePaise", "id") > (${cursor.p}, ${cursor.id}::uuid)`;
      break;
    case "price_desc":
      order = sql`"fromPricePaise" DESC, "id" DESC`;
      if (cursor?.s === "price_desc")
        after = sql`WHERE ("fromPricePaise", "id") < (${cursor.p}, ${cursor.id}::uuid)`;
      break;
    case "relevance":
      order = sql`"rank" DESC, "id" DESC`;
      if (cursor?.s === "relevance") offset = cursor.o;
      break;
  }

  const rows = await db.$queryRaw<ListedProduct[]>(sql`
    WITH page AS (
      SELECT p."id", p."slug", p."name", p."labels", p."published_at" AS "publishedAt",
        (SELECT min(pv."price_paise") FROM "product_variant" pv
          WHERE pv."product_id" = p."id" AND pv."is_active") AS "fromPricePaise",
        ${rank} AS "rank"
      ${FROM}
      WHERE ${join(conds, " AND ")}
    )
    SELECT * FROM page ${after}
    ORDER BY ${order}
    LIMIT ${limit + 1} OFFSET ${offset}`);

  const items = rows.slice(0, limit);
  const last = items.at(-1);
  let next: ListingCursor | null = null;
  if (rows.length > limit && last) {
    if (sort === "newest")
      next = { s: "newest", t: last.publishedAt.toISOString(), id: last.id };
    else if (sort === "relevance") next = { s: "relevance", o: offset + limit };
    else next = { s: sort, p: last.fromPricePaise, id: last.id };
  }
  return { items, next };
}

export type Facets = {
  sizes: { label: string; count: number }[];
  colours: { slug: string; name: string; swatchHex: string; count: number }[];
  categories: { slug: string; name: string; count: number }[];
  priceBands: { minPaise: number; maxPaise: number | null; count: number }[];
};

export async function listingFacets(
  db: Db,
  f: ListingFilters,
  now: Date,
): Promise<Facets> {
  const where = join(baseConditions(f, now), " AND ");
  const whereNoCategory = join(baseConditions(f, now, false), " AND ");
  const activeVariant = sql`JOIN "product_variant" v ON v."product_id" = p."id" AND v."is_active"`;
  const [sizes, colours, categories, prices] = await Promise.all([
    db.$queryRaw<Facets["sizes"]>(sql`
      SELECT s."label", count(DISTINCT p."id")::int AS "count" ${FROM} ${activeVariant}
      JOIN "size" s ON s."id" = v."size_id" WHERE ${where}
      GROUP BY s."label", s."position" ORDER BY s."position"`),
    db.$queryRaw<Facets["colours"]>(sql`
      SELECT co."slug", co."name", co."swatch_hex" AS "swatchHex", count(DISTINCT p."id")::int AS "count" ${FROM} ${activeVariant}
      JOIN "colour" co ON co."id" = v."colour_id" WHERE ${where}
      GROUP BY co."slug", co."name", co."swatch_hex", co."position" ORDER BY co."position", co."name"`),
    db.$queryRaw<Facets["categories"]>(sql`
      SELECT c."slug", c."name", count(DISTINCT p."id")::int AS "count" ${FROM} WHERE ${whereNoCategory}
      GROUP BY c."slug", c."name", c."position" ORDER BY c."position", c."name"`),
    db.$queryRaw<{ fromPricePaise: number }[]>(sql`
      SELECT (SELECT min(pv."price_paise") FROM "product_variant" pv
        WHERE pv."product_id" = p."id" AND pv."is_active") AS "fromPricePaise"
      ${FROM} WHERE ${where}`),
  ]);
  const priceBands = PRICE_BANDS.map((b) => ({
    minPaise: b.min,
    maxPaise: b.max,
    count: prices.filter(
      (r) =>
        r.fromPricePaise >= b.min &&
        (b.max === null || r.fromPricePaise < b.max),
    ).length,
  }));
  return { sizes, colours, categories, priceBands };
}

/** Up to 6 suggestions: up to 2 categories, then products (api-specification.md §3). */
export async function suggest(db: Db, q: string, now: Date) {
  const categories = await db.$queryRaw<{ slug: string; name: string }[]>(sql`
    SELECT c."slug", c."name" FROM "category" c
    WHERE c."status" = 'PUBLISHED' AND (c."name" % ${q} OR starts_with(lower(c."name"), lower(${q})))
    ORDER BY similarity(c."name", ${q}) DESC, c."name" LIMIT 2`);
  const conds = baseConditions({}, now);
  conds.push(sql`(${q} <% p."name" OR starts_with(lower(p."name"), lower(${q}))
    OR p."search_vector" @@ websearch_to_tsquery('simple', ${q}))`);
  const products = await db.$queryRaw<{ slug: string; name: string }[]>(sql`
    SELECT p."slug", p."name" ${FROM} WHERE ${join(conds, " AND ")}
    ORDER BY word_similarity(${q}, p."name") DESC, p."name" LIMIT ${6 - categories.length}`);
  return { categories, products };
}
