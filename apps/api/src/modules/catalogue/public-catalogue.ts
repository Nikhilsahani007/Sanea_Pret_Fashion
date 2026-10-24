// Published catalogue as the storefront sees it: only published products in
// published categories, active variants, collections inside their schedule.
// Filtering and facets run in memory over the published set, which suits the
// release-one catalogue size (system-design.md §8: a search engine is
// deferred until a few thousand products); text matching runs in PostgreSQL.
import { availabilityOf, type VariantAvailability } from "@sanea/shared";

import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { imageSources, type ImageSources } from "../media/urls.ts";

export type PublishedVariant = {
  id: string;
  sku: string;
  colourId: string;
  sizeId: string;
  pricePaise: number;
  compareAtPricePaise: number | null;
  stock: VariantAvailability;
  available: boolean;
};

export type CardImage = (ImageSources & { alt: string }) | null;

export type PublishedProduct = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  collectionIds: string[];
  labels: string[];
  publishedAt: Date;
  variants: PublishedVariant[];
  colourIds: string[];
  primary: CardImage;
  hover: CardImage;
};

export type Catalogue = {
  products: PublishedProduct[];
  categories: Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      parentId: string | null;
      position: number;
    }
  >;
  collections: Map<string, { id: string; slug: string; name: string }>;
  colours: Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      swatchHex: string;
      position: number;
    }
  >;
  sizes: Map<string, { id: string; label: string; position: number }>;
};

export function liveCollectionWhere(now: Date): Prisma.CollectionWhereInput {
  return {
    status: "PUBLISHED",
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    ],
  };
}

export const publishedProductWhere: Prisma.ProductWhereInput = {
  status: "PUBLISHED",
  category: { status: "PUBLISHED" },
};

function card(
  baseUrl: string,
  image:
    | {
        alt: string;
        mediaAsset: { width: number; height: number; variants: unknown };
      }
    | undefined,
): CardImage {
  if (!image) return null;
  const sources = imageSources(baseUrl, image.mediaAsset);
  return sources ? { ...sources, alt: image.alt } : null;
}

function pickRole<T extends { role: string; colourId: string | null }>(
  images: T[],
  role: string,
): T | undefined {
  return (
    images.find((i) => i.role === role && i.colourId === null) ??
    images.find((i) => i.role === role)
  );
}

export async function loadCatalogue(
  db: Db,
  baseUrl: string,
  now: Date,
): Promise<Catalogue> {
  const [products, categories, collections, colours, sizes] = await Promise.all(
    [
      db.product.findMany({
        where: publishedProductWhere,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        include: {
          variants: { where: { isActive: true }, include: { inventory: true } },
          images: {
            where: { role: { in: ["PRIMARY", "HOVER"] } },
            orderBy: { position: "asc" },
            include: { mediaAsset: true },
          },
          collections: {
            where: { collection: liveCollectionWhere(now) },
            select: { collectionId: true },
          },
        },
      }),
      db.category.findMany({ where: { status: "PUBLISHED" } }),
      db.collection.findMany({ where: liveCollectionWhere(now) }),
      db.colour.findMany(),
      db.size.findMany(),
    ],
  );
  return {
    products: products
      .filter((p) => p.variants.length > 0)
      .map((p) => {
        const variants = p.variants.map((v) => {
          const stock = availabilityOf(
            v.inventory ?? { onHand: 0, reserved: 0, lowStockThreshold: 0 },
          );
          return {
            id: v.id,
            sku: v.sku,
            colourId: v.colourId,
            sizeId: v.sizeId,
            pricePaise: v.pricePaise,
            compareAtPricePaise: v.compareAtPricePaise,
            stock,
            available: stock.availability !== "SOLD_OUT",
          };
        });
        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          categoryId: p.categoryId,
          collectionIds: p.collections.map((c) => c.collectionId),
          labels: p.labels,
          publishedAt: p.publishedAt ?? p.createdAt,
          variants,
          colourIds: [...new Set(variants.map((v) => v.colourId))],
          // Card images: the all-colours image of each role, else the first.
          primary: card(baseUrl, pickRole(p.images, "PRIMARY")),
          hover: card(baseUrl, pickRole(p.images, "HOVER")),
        };
      }),
    categories: new Map(categories.map((c) => [c.id, c])),
    collections: new Map(collections.map((c) => [c.id, c])),
    colours: new Map(colours.map((c) => [c.id, c])),
    sizes: new Map(sizes.map((s) => [s.id, s])),
  };
}

export type Filters = {
  categoryIds?: Set<string>;
  collectionId?: string;
  sizeIds?: Set<string>;
  colourIds?: Set<string>;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  matchIds?: Map<string, number>;
};

type Dimension = "category" | "size" | "colour" | "price";

function variantMatches(
  v: PublishedVariant,
  f: Filters,
  skip?: Dimension,
): boolean {
  if (skip !== "size" && f.sizeIds && !f.sizeIds.has(v.sizeId)) return false;
  if (skip !== "colour" && f.colourIds && !f.colourIds.has(v.colourId))
    return false;
  if (skip !== "price" && f.priceMin !== undefined && v.pricePaise < f.priceMin)
    return false;
  if (skip !== "price" && f.priceMax !== undefined && v.pricePaise > f.priceMax)
    return false;
  if (f.inStock && !v.available) return false;
  return true;
}

/** Products passing every filter, except `skip` (used for facet counts). */
export function filterProducts(
  products: PublishedProduct[],
  f: Filters,
  skip?: Dimension,
): PublishedProduct[] {
  return products.filter(
    (p) =>
      (!f.matchIds || f.matchIds.has(p.id)) &&
      (skip === "category" ||
        !f.categoryIds ||
        f.categoryIds.has(p.categoryId)) &&
      (!f.collectionId || p.collectionIds.includes(f.collectionId)) &&
      p.variants.some((v) => variantMatches(v, f, skip)),
  );
}

export const PRICE_BANDS = [
  { key: "under-2000", minPaise: 0, maxPaise: 199_999 },
  { key: "2000-3999", minPaise: 200_000, maxPaise: 399_999 },
  { key: "4000-7999", minPaise: 400_000, maxPaise: 799_999 },
  { key: "8000-plus", minPaise: 800_000, maxPaise: null },
] as const;

export function facets(c: Catalogue, f: Filters) {
  const count = (
    list: PublishedProduct[],
    key: (p: PublishedProduct) => Iterable<string>,
  ) => {
    const counts = new Map<string, number>();
    for (const p of list)
      for (const k of new Set(key(p))) counts.set(k, (counts.get(k) ?? 0) + 1);
    return counts;
  };
  const bySize = count(filterProducts(c.products, f, "size"), (p) =>
    p.variants.filter((v) => variantMatches(v, f, "size")).map((v) => v.sizeId),
  );
  const byColour = count(filterProducts(c.products, f, "colour"), (p) =>
    p.variants
      .filter((v) => variantMatches(v, f, "colour"))
      .map((v) => v.colourId),
  );
  const byCategory = count(filterProducts(c.products, f, "category"), (p) => [
    p.categoryId,
  ]);
  const forPrice = filterProducts(c.products, f, "price");
  return {
    sizes: [...c.sizes.values()]
      .filter((s) => bySize.has(s.id))
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ label: s.label, count: bySize.get(s.id)! })),
    colours: [...c.colours.values()]
      .filter((co) => byColour.has(co.id))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((co) => ({
        slug: co.slug,
        name: co.name,
        swatchHex: co.swatchHex,
        count: byColour.get(co.id)!,
      })),
    categories: [...c.categories.values()]
      .filter((ca) => byCategory.has(ca.id))
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
      .map((ca) => ({
        slug: ca.slug,
        name: ca.name,
        count: byCategory.get(ca.id)!,
      })),
    priceBands: PRICE_BANDS.map((b) => ({
      ...b,
      count: forPrice.filter((p) =>
        p.variants.some(
          (v) =>
            variantMatches(v, f, "price") &&
            v.pricePaise >= b.minPaise &&
            (b.maxPaise === null || v.pricePaise <= b.maxPaise),
        ),
      ).length,
    })).filter((b) => b.count > 0),
  };
}

/** The cheapest active variant: "from" price and its compare-at price. */
export function fromPrice(p: PublishedProduct) {
  const cheapest = p.variants.reduce((a, b) =>
    b.pricePaise < a.pricePaise ? b : a,
  );
  return {
    fromPricePaise: cheapest.pricePaise,
    compareAtPricePaise: cheapest.compareAtPricePaise,
  };
}

export function summary(c: Catalogue, p: PublishedProduct) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    ...fromPrice(p),
    /** True when active variants differ in price, so the card says "From". */
    priceVaries: new Set(p.variants.map((v) => v.pricePaise)).size > 1,
    currency: "INR" as const,
    labels: p.labels,
    availability: p.variants.some((v) => v.available)
      ? ("IN_STOCK" as const)
      : ("SOLD_OUT" as const),
    colours: p.colourIds
      .map((id) => c.colours.get(id))
      .filter((co) => co !== undefined)
      .sort((a, b) => a.position - b.position)
      .map((co) => ({ slug: co.slug, name: co.name, swatchHex: co.swatchHex })),
    sizes: [...new Set(p.variants.map((v) => v.sizeId))]
      .map((id) => c.sizes.get(id))
      .filter((s) => s !== undefined)
      .sort((a, b) => a.position - b.position)
      .map((s) => s.label),
    image: p.primary,
    hoverImage: p.hover,
  };
}

export type Sort = "newest" | "price_asc" | "price_desc" | "relevance";

export function sortProducts(
  list: PublishedProduct[],
  sort: Sort,
  matchIds?: Map<string, number>,
) {
  const byNewest = (a: PublishedProduct, b: PublishedProduct) =>
    b.publishedAt.getTime() - a.publishedAt.getTime() || (a.id < b.id ? 1 : -1);
  const price = (p: PublishedProduct) => fromPrice(p).fromPricePaise;
  const sorted = [...list];
  if (sort === "price_asc")
    sorted.sort((a, b) => price(a) - price(b) || byNewest(a, b));
  else if (sort === "price_desc")
    sorted.sort((a, b) => price(b) - price(a) || byNewest(a, b));
  else if (sort === "relevance" && matchIds)
    sorted.sort(
      (a, b) =>
        (matchIds.get(b.id) ?? 0) - (matchIds.get(a.id) ?? 0) || byNewest(a, b),
    );
  else sorted.sort(byNewest);
  return sorted;
}

/** Category plus every published descendant. */
export function categoryWithDescendants(
  c: Catalogue,
  rootId: string,
): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const cat of c.categories.values())
      if (cat.parentId && ids.has(cat.parentId) && !ids.has(cat.id)) {
        ids.add(cat.id);
        grew = true;
      }
  }
  return ids;
}

/** Words for full-text and trigram matching, lowercased, at most 8. */
export function searchTerms(q: string): string {
  return q
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .join(" ");
}

/**
 * Product IDs matching the text, with a relevance score: full-text match with
 * prefix on the last word, or a trigram match on the name for typos.
 */
export async function matchText(
  db: Db,
  q: string,
): Promise<Map<string, number>> {
  const terms = searchTerms(q);
  if (!terms) return new Map();
  const words = terms.split(" ");
  const tsquery = words
    .map((w, i) => (i === words.length - 1 ? `${w}:*` : w))
    .join(" & ");
  const rows = await db.$queryRaw<{ id: string; score: number }[]>(Prisma.sql`
    SELECT p.id::text AS id, max(score)::float8 AS score FROM (
      SELECT id, ts_rank(search_vector, to_tsquery('english', ${tsquery})) + 1 AS score
        FROM "product" WHERE status = 'PUBLISHED' AND search_vector @@ to_tsquery('english', ${tsquery})
      UNION ALL
      SELECT id, similarity(lower(name), ${terms}) AS score
        FROM "product" WHERE status = 'PUBLISHED' AND lower(name) % ${terms}
    ) p GROUP BY p.id`);
  return new Map(rows.map((r) => [r.id, Number(r.score)]));
}
