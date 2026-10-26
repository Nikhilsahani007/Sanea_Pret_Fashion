// What content may show publicly (phase-10-plan.md §3.3, §3.7; D-093). Every
// public read goes through here: a target is linked only while it is public,
// product rows contain only products the catalogue itself would show, and
// images are derivatives only (safeguard 1).
import type { ContentTarget, ProductSource } from "@sanea/shared";

import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { PRODUCT_FROM, baseConditions } from "../catalogue/listing.ts";
import { imageView } from "../catalogue/common.ts";
import type { MediaStorage } from "../media/storage.ts";

const { sql, join } = Prisma;

type EntityKind = "CATEGORY" | "COLLECTION" | "PRODUCT" | "PAGE";
type Target = ContentTarget | { kind: "URL"; url: string };

const keyOf = (kind: string, id: string) => `${kind}:${id.toLowerCase()}`;

/** A page is public only when published and, if it needs it, verified (D-010). */
export const PUBLIC_PAGE = sql`pg."status" = 'PUBLISHED' AND (NOT pg."requires_verification" OR pg."verified_at" IS NOT NULL)`;

/** Public paths of the targets that are public right now; others are absent. */
export async function publicHrefs(
  db: Db,
  targets: readonly Target[],
  now: Date,
): Promise<Map<string, string>> {
  const ids = (kind: EntityKind) => [
    ...new Set(
      targets.flatMap((t) => (t.kind === kind ? [t.id.toLowerCase()] : [])),
    ),
  ];
  const out = new Map<string, string>();
  const add = (
    kind: string,
    rows: { id: string; slug: string }[],
    prefix: string,
  ) => {
    for (const r of rows) out.set(keyOf(kind, r.id), `/${prefix}/${r.slug}`);
  };
  const [categories, collections, products, pages] = await Promise.all([
    ids("CATEGORY").length
      ? db.$queryRaw<{ id: string; slug: string }[]>(sql`
          SELECT "id"::text AS "id", "slug" FROM "category"
          WHERE "id" = ANY(${ids("CATEGORY")}::uuid[]) AND "status" = 'PUBLISHED'`)
      : [],
    ids("COLLECTION").length
      ? db.$queryRaw<{ id: string; slug: string }[]>(sql`
          SELECT "id"::text AS "id", "slug" FROM "collection"
          WHERE "id" = ANY(${ids("COLLECTION")}::uuid[]) AND "status" = 'PUBLISHED'
            AND ("starts_at" IS NULL OR "starts_at" <= ${now}) AND ("ends_at" IS NULL OR "ends_at" > ${now})`)
      : [],
    ids("PRODUCT").length
      ? db.$queryRaw<{ id: string; slug: string }[]>(sql`
          SELECT p."id"::text AS "id", p."slug" ${PRODUCT_FROM}
          WHERE p."id" = ANY(${ids("PRODUCT")}::uuid[]) AND ${join(baseConditions({}, now), " AND ")}`)
      : [],
    ids("PAGE").length
      ? db.$queryRaw<{ id: string; slug: string }[]>(sql`
          SELECT pg."id"::text AS "id", pg."slug" FROM "page" pg
          WHERE pg."id" = ANY(${ids("PAGE")}::uuid[]) AND ${PUBLIC_PAGE}`)
      : [],
  ]);
  add("CATEGORY", categories, "shop"); // D-179
  add("COLLECTION", collections, "collections");
  add("PRODUCT", products, "products");
  add("PAGE", pages, "pages");
  return out;
}

/** The public path for one target, or null while it is not public. */
export function hrefOf(
  hrefs: Map<string, string>,
  target: Target,
): string | null {
  if (target.kind === "PATH") return target.path;
  if (target.kind === "URL") return target.url;
  return hrefs.get(keyOf(target.kind, target.id)) ?? null;
}

/**
 * The referenced rows that do not exist at all (any status): reported on
 * save and publish (§3.1). Whether they are public is decided at read time.
 */
export async function missingRefs(
  db: Db,
  refs: { kind: EntityKind | "MEDIA"; id: string; path: string }[],
): Promise<{ path: string; kind: string }[]> {
  const table: Record<EntityKind | "MEDIA", string> = {
    CATEGORY: "category",
    COLLECTION: "collection",
    PRODUCT: "product",
    PAGE: "page",
    MEDIA: "media_asset",
  };
  const missing: { path: string; kind: string }[] = [];
  for (const kind of Object.keys(table) as (keyof typeof table)[]) {
    const wanted = refs.filter((r) => r.kind === kind);
    if (!wanted.length) continue;
    const found = new Set(
      (
        await db.$queryRaw<{ id: string }[]>(
          sql`SELECT "id"::text AS "id" FROM ${Prisma.raw(`"${table[kind]}"`)} WHERE "id" = ANY(${wanted.map((w) => w.id.toLowerCase())}::uuid[])`,
        )
      ).map((r) => r.id),
    );
    for (const w of wanted)
      if (!found.has(w.id.toLowerCase())) missing.push({ path: w.path, kind });
  }
  return missing;
}

export type RowProduct = {
  id: string;
  slug: string;
  name: string;
  labels: string[];
  fromPricePaise: number;
};

/** Visible products for a row or tab, in the source's order. */
export async function productsFor(
  db: Db,
  source: ProductSource,
  limit: number,
  now: Date,
): Promise<RowProduct[]> {
  const conds = baseConditions({}, now);
  let extraJoin = sql``;
  let order = sql`p."published_at" DESC, p."id" DESC`;
  switch (source.kind) {
    case "NEWEST":
      break;
    case "CATEGORY":
      // The category and its published sub-categories, while the category is published.
      conds.push(
        sql`EXISTS (SELECT 1 FROM "category" sc WHERE sc."id" = ${source.id}::uuid AND sc."status" = 'PUBLISHED')`,
      );
      conds.push(
        sql`(c."id" = ${source.id}::uuid OR c."parent_id" = ${source.id}::uuid)`,
      );
      break;
    case "COLLECTION":
      extraJoin = sql`JOIN "collection_product" cp ON cp."product_id" = p."id" AND cp."collection_id" = ${source.id}::uuid
        JOIN "collection" col ON col."id" = cp."collection_id"`;
      conds.push(
        sql`col."status" = 'PUBLISHED' AND (col."starts_at" IS NULL OR col."starts_at" <= ${now}) AND (col."ends_at" IS NULL OR col."ends_at" > ${now})`,
      );
      order = sql`cp."position", p."id"`;
      break;
    case "MANUAL":
      conds.push(sql`p."id" = ANY(${source.productIds}::uuid[])`);
      order = sql`array_position(${source.productIds}::uuid[], p."id")`;
      break;
  }
  return db.$queryRaw<RowProduct[]>(sql`
    SELECT p."id"::text AS "id", p."slug", p."name", p."labels",
      (SELECT min(pv."price_paise") FROM "product_variant" pv WHERE pv."product_id" = p."id" AND pv."is_active") AS "fromPricePaise"
    ${PRODUCT_FROM} ${extraJoin}
    WHERE ${join(conds, " AND ")}
    ORDER BY ${order}
    LIMIT ${limit}`);
}

/** Public image views (derivatives only) for media assets, by id. */
export async function assetViews(
  db: Db,
  ids: readonly string[],
): Promise<Map<string, { width: number; height: number; variants: unknown }>> {
  if (ids.length === 0) return new Map();
  const assets = await db.mediaAsset.findMany({
    where: { id: { in: [...new Set(ids)] } },
  });
  return new Map(
    assets.map((a) => [
      a.id,
      { width: a.width, height: a.height, variants: a.variants },
    ]),
  );
}

/** One public image: url, size and sources; never the original. */
export function imageOf(
  storage: MediaStorage,
  asset: { width: number; height: number; variants: unknown } | undefined,
  alt: string,
) {
  if (!asset) return null;
  const { url, width, height, sources } = imageView(
    { colourId: null, alt, role: "CONTENT", position: 0, mediaAsset: asset },
    storage,
  );
  return url ? { url, width, height, alt, sources } : null;
}
