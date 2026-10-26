// Public catalogue (api-specification.md §3 and §6): published data only,
// 60-second HTTP caching (Q8-5), derivative image URLs only (safeguard 1),
// stock as availability states (D-082 as amended by Q8-2).
import { MAX_AMOUNT_PAISE, availabilityOf, slugSchema } from "@sanea/shared";
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "../auth/deps.ts";
import type { MediaStorage } from "../media/storage.ts";
import {
  decodeCursor,
  encodeCursor,
  handle,
  imageView,
  input,
  publicCache,
} from "./common.ts";
import {
  listProducts,
  listingFacets,
  type ListingCursor,
  type ListingFilters,
  type ListingSort,
} from "./listing.ts";

export const CATALOGUE = "/api/v1/catalogue";

const many = (item: z.ZodType<string>) =>
  z.preprocess(
    (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
    z.array(item).max(20).optional(),
  );
const paise = z.coerce.number().int().min(0).max(MAX_AMOUNT_PAISE).optional();

/** Shared by the listing and search; `size[]` and `colour[]` are also accepted. */
export const listingQueryShape = {
  category: slugSchema.optional(),
  collection: slugSchema.optional(),
  size: many(z.string().trim().min(1).max(20)),
  "size[]": many(z.string().trim().min(1).max(20)),
  colour: many(slugSchema),
  "colour[]": many(slugSchema),
  priceMin: paise,
  priceMax: paise,
  inStock: z.enum(["true", "false"]).optional(),
  limit: z.coerce.number().int().min(1).max(48).default(24),
  cursor: z.string().max(400).optional(),
};
const priceRange = (q: {
  priceMin?: number | undefined;
  priceMax?: number | undefined;
}) =>
  q.priceMin === undefined ||
  q.priceMax === undefined ||
  q.priceMin <= q.priceMax;

const listingQuery = z
  .strictObject({
    ...listingQueryShape,
    sort: z.enum(["newest", "price_asc", "price_desc"]).default("newest"),
  })
  .refine(priceRange, {
    error: "priceMin must not be above priceMax",
    path: ["priceMin"],
  });

export type ListingQuery = z.infer<typeof listingQuery> & { q?: string };

const cursorSchema: z.ZodType<ListingCursor> = z.union([
  z.strictObject({ s: z.literal("newest"), t: z.iso.datetime(), id: z.uuid() }),
  z.strictObject({
    s: z.enum(["price_asc", "price_desc"]),
    p: z.number().int().min(0),
    id: z.uuid(),
  }),
  z.strictObject({
    s: z.literal("relevance"),
    o: z.number().int().min(0).max(10_000),
  }),
]);

export function filtersOf(q: ListingQuery): ListingFilters {
  const sizes = [...(q.size ?? []), ...(q["size[]"] ?? [])];
  const colours = [...(q.colour ?? []), ...(q["colour[]"] ?? [])];
  return {
    category: q.category,
    collection: q.collection,
    sizes: sizes.length ? sizes : undefined,
    colours: colours.length ? colours : undefined,
    priceMin: q.priceMin,
    priceMax: q.priceMax,
    inStock: q.inStock === "true",
    q: q.q,
  };
}

/** Runs a listing or search and shapes the page (shared with the search router). */
export async function listingResponse(
  deps: AuthDeps,
  storage: MediaStorage,
  q: ListingQuery,
  sort: ListingSort,
) {
  const cursor = decodeCursor(q.cursor, cursorSchema);
  if (cursor && cursor.s !== sort)
    throw new AppError("VALIDATION_FAILED", [
      {
        path: "query.cursor",
        code: "INVALID",
        message: "This value is not valid.",
      },
    ]);
  const filters = filtersOf(q);
  const now = deps.now();
  const [{ items, next }, facets] = await Promise.all([
    listProducts(deps.db, filters, sort, q.limit, cursor, now),
    listingFacets(deps.db, filters, now),
  ]);
  return {
    items: await summaries(deps, storage, items),
    facets,
    nextCursor: next ? encodeCursor(next) : null,
  };
}

/** Product summaries for listings and content product rows (Phase 10). */
export async function summaries(
  deps: AuthDeps,
  storage: MediaStorage,
  items: {
    id: string;
    slug: string;
    name: string;
    labels: string[];
    fromPricePaise: number;
  }[],
) {
  if (items.length === 0) return [];
  const ids = items.map((i) => i.id);
  const [images, variants] = await Promise.all([
    deps.db.productImage.findMany({
      where: { productId: { in: ids }, role: "PRIMARY" },
      orderBy: [{ position: "asc" }],
      include: { mediaAsset: true },
    }),
    deps.db.productVariant.findMany({
      where: { productId: { in: ids }, isActive: true },
      include: { colour: true, inventory: true },
      orderBy: { colour: { position: "asc" } },
    }),
  ]);
  return items.map((p) => {
    const own = variants.filter((v) => v.productId === p.id);
    const colours = [
      ...new Map(
        own.map((v) => [
          v.colour.id,
          { name: v.colour.name, swatchHex: v.colour.swatchHex },
        ]),
      ).values(),
    ];
    // Prefer the image for all colours, else the first colour's.
    const primary =
      images.find((i) => i.productId === p.id && i.colourId === null) ??
      images.find((i) => i.productId === p.id);
    const soldOut = own.every(
      (v) => availabilityOf(stockOf(v.inventory)).availability === "SOLD_OUT",
    );
    return {
      id: p.id,
      slug: p.slug,
      name: p.name,
      fromPricePaise: p.fromPricePaise,
      currency: "INR" as const,
      labels: p.labels,
      colours,
      soldOut,
      primaryImage: primary ? imageView(primary, storage) : null,
    };
  });
}

const stockOf = (
  inv: { onHand: number; reserved: number; lowStockThreshold: number } | null,
) => inv ?? { onHand: 0, reserved: 0, lowStockThreshold: 0 };

export function cataloguePublicRouter(
  deps: AuthDeps,
  storage: MediaStorage,
): Router {
  const router = Router();
  router.use(CATALOGUE, publicCache);

  router.get(
    `${CATALOGUE}/categories`,
    handle(async (_req, res) => {
      const rows = await deps.db.category.findMany({
        where: { status: "PUBLISHED" },
        orderBy: [{ position: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          slug: true,
          parentId: true,
          seoTitle: true,
          seoDescription: true,
        },
      });
      const ids = new Set(rows.map((r) => r.id));
      type Node = (typeof rows)[number] & { children: Node[] };
      const nodes = new Map<string, Node>(
        rows.map((r) => [r.id, { ...r, children: [] }]),
      );
      const roots: Node[] = [];
      for (const node of nodes.values()) {
        if (node.parentId === null) roots.push(node);
        else if (ids.has(node.parentId))
          nodes.get(node.parentId)!.children.push(node);
        // A published child of an unpublished parent is not shown.
      }
      const strip = (n: Node): object => ({
        name: n.name,
        slug: n.slug,
        seoTitle: n.seoTitle,
        seoDescription: n.seoDescription,
        children: n.children.map(strip),
      });
      res.json({ items: roots.map(strip) });
    }),
  );

  const visibleCollections = () => {
    const now = deps.now();
    return {
      status: "PUBLISHED" as const,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    };
  };
  const collectionView = (c: {
    name: string;
    slug: string;
    description: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    heroImage: { width: number; height: number; variants: unknown } | null;
  }) => ({
    name: c.name,
    slug: c.slug,
    description: c.description,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    heroImage: c.heroImage
      ? imageView(
          {
            colourId: null,
            alt: c.name,
            role: "HERO",
            position: 0,
            mediaAsset: c.heroImage,
          },
          storage,
        )
      : null,
  });

  router.get(
    `${CATALOGUE}/collections`,
    handle(async (_req, res) => {
      const rows = await deps.db.collection.findMany({
        where: visibleCollections(),
        orderBy: { name: "asc" },
        include: { heroImage: true },
      });
      res.json({ items: rows.map(collectionView) });
    }),
  );

  router.get(
    `${CATALOGUE}/collections/:slug`,
    validate({ params: z.strictObject({ slug: slugSchema }) }),
    handle(async (_req, res) => {
      const { params } = input<unknown, { slug: string }>(res);
      const c = await deps.db.collection.findFirst({
        where: { slug: params.slug, ...visibleCollections() },
        include: { heroImage: true },
      });
      if (!c) throw new AppError("NOT_FOUND");
      res.json(collectionView(c));
    }),
  );

  router.get(
    `${CATALOGUE}/products`,
    validate({ query: listingQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, ListingQuery>(res);
      res.json(await listingResponse(deps, storage, query, query.sort));
    }),
  );

  router.get(
    `${CATALOGUE}/products/:slug`,
    validate({ params: z.strictObject({ slug: slugSchema }) }),
    handle(async (_req, res) => {
      const { params } = input<unknown, { slug: string }>(res);
      const p = await deps.db.product.findFirst({
        where: {
          slug: params.slug,
          status: "PUBLISHED",
          category: { status: "PUBLISHED" },
          variants: { some: { isActive: true } },
        },
        include: {
          category: { select: { name: true, slug: true } },
          sizeChart: { select: { name: true, unit: true, rows: true } },
          variants: {
            where: { isActive: true },
            include: { colour: true, size: true, inventory: true },
            orderBy: [
              { colour: { position: "asc" } },
              { size: { position: "asc" } },
            ],
          },
          images: {
            orderBy: { position: "asc" },
            include: { mediaAsset: true },
          },
        },
      });
      if (!p) throw new AppError("NOT_FOUND");
      const colours = [
        ...new Map(
          p.variants.map((v) => [
            v.colour.id,
            {
              id: v.colour.id,
              slug: v.colour.slug,
              name: v.colour.name,
              swatchHex: v.colour.swatchHex,
            },
          ]),
        ).values(),
      ];
      const sizes = [
        ...new Map(
          p.variants.map((v) => [
            v.size.id,
            { id: v.size.id, label: v.size.label, position: v.size.position },
          ]),
        ).values(),
      ]
        .sort((a, b) => a.position - b.position)
        .map((s) => ({ id: s.id, label: s.label }));
      const activeColourIds = new Set(colours.map((c) => c.id));
      res.json({
        id: p.id,
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        description: p.description,
        fabric: p.fabric,
        care: p.care,
        fit: p.fit,
        category: p.category,
        sizeChart: p.sizeChart,
        fromPricePaise: Math.min(...p.variants.map((v) => v.pricePaise)),
        currency: "INR",
        colours,
        sizes,
        variants: p.variants.map((v) => ({
          id: v.id,
          colourId: v.colourId,
          sizeId: v.sizeId,
          sku: v.sku,
          pricePaise: v.pricePaise,
          compareAtPricePaise: v.compareAtPricePaise,
          ...availabilityOf(stockOf(v.inventory)),
        })),
        // Images for colours with no active variant are not shown.
        images: p.images
          .filter((i) => i.colourId === null || activeColourIds.has(i.colourId))
          .map((i) => imageView(i, storage)),
        labels: p.labels,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      });
    }),
  );

  return router;
}
