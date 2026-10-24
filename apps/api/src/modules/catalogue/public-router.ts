// Public catalogue and search (api-specification.md §3): categories,
// collections, product listing with filters and facets, product detail,
// search and suggestions. Read-only; short public caching.
import { availabilityOf } from "@sanea/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle, input } from "../../platform/http/handle.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import { validate } from "../../platform/http/validate.ts";
import type { ModuleDeps } from "../deps.ts";
import { imageSources } from "../media/urls.ts";
import {
  categoryWithDescendants,
  facets,
  filterProducts,
  liveCollectionWhere,
  loadCatalogue,
  matchText,
  publishedProductWhere,
  searchTerms,
  sortProducts,
  summary,
  type Catalogue,
  type Filters,
  type Sort,
} from "./public-catalogue.ts";

const V1 = "/api/v1";

const publicCache: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=30");
  next();
};

const list = z
  .union([z.string(), z.array(z.string())])
  .transform((v) => (Array.isArray(v) ? v : [v]));
const paise = z.coerce.number().int().min(0).max(2_147_483_647);

export const listingQuery = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: z.string().max(120).optional(),
    collection: z.string().max(120).optional(),
    size: list.pipe(z.array(z.string().max(20)).max(10)).optional(),
    colour: list.pipe(z.array(z.string().max(120)).max(20)).optional(),
    priceMin: paise.optional(),
    priceMax: paise.optional(),
    inStock: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    sort: z.enum(["newest", "price_asc", "price_desc", "relevance"]).optional(),
    limit: z.coerce.number().int().min(1).max(48).default(24),
    cursor: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,16}$/)
      .optional(),
  })
  .strict();
type ListingQuery = z.infer<typeof listingQuery>;

const slugParams = z.object({ slug: z.string().min(1).max(120) });
const suggestQuery = z
  .object({ q: z.string().trim().min(2).max(100) })
  .strict();

const encodeCursor = (offset: number) =>
  Buffer.from(String(offset)).toString("base64url");
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString());
  return Number.isSafeInteger(n) && n >= 0 ? n : 0;
}

async function runListing(deps: ModuleDeps, q: ListingQuery, c: Catalogue) {
  const bySlug = <T extends { slug: string }>(
    m: Map<string, T>,
    slug: string,
  ) => [...m.values()].find((x) => x.slug === slug);
  const f: Filters = {};
  const empty = {
    items: [],
    nextCursor: null,
    total: 0,
    facets: facets(c, { matchIds: new Map() }),
  };
  if (q.category) {
    const cat = bySlug(c.categories, q.category);
    if (!cat) return empty;
    f.categoryIds = categoryWithDescendants(c, cat.id);
  }
  if (q.collection) {
    const col = bySlug(c.collections, q.collection);
    if (!col) return empty;
    f.collectionId = col.id;
  }
  if (q.size) {
    const wanted = new Set(q.size.map((s) => s.toLowerCase()));
    f.sizeIds = new Set(
      [...c.sizes.values()]
        .filter((s) => wanted.has(s.label.toLowerCase()))
        .map((s) => s.id),
    );
  }
  if (q.colour) {
    const wanted = new Set(q.colour);
    f.colourIds = new Set(
      [...c.colours.values()]
        .filter((co) => wanted.has(co.slug))
        .map((co) => co.id),
    );
  }
  if (q.priceMin !== undefined) f.priceMin = q.priceMin;
  if (q.priceMax !== undefined) f.priceMax = q.priceMax;
  if (q.inStock) f.inStock = true;
  if (q.q && searchTerms(q.q)) f.matchIds = await matchText(deps.db, q.q);

  const sort: Sort = q.sort ?? (f.matchIds ? "relevance" : "newest");
  const matched = sortProducts(filterProducts(c.products, f), sort, f.matchIds);
  const offset = decodeCursor(q.cursor);
  const page = matched.slice(offset, offset + q.limit);
  return {
    items: page.map((p) => summary(c, p)),
    nextCursor:
      offset + q.limit < matched.length ? encodeCursor(offset + q.limit) : null,
    total: matched.length,
    facets: facets(c, f),
  };
}

export function publicCatalogueRouter(deps: ModuleDeps): Router {
  const router = Router();
  const base = deps.config.mediaPublicBaseUrl;
  // security-design.md §3: search 60 per minute per IP.
  const searchLimit = createRateLimiter({ windowMs: 60_000, limit: 60 });

  router.get(
    `${V1}/catalogue/categories`,
    publicCache,
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
      type Node = (typeof rows)[number] & { children: Node[] };
      const nodes = new Map<string, Node>(
        rows.map((r) => [r.id, { ...r, children: [] }]),
      );
      const roots: Node[] = [];
      for (const node of nodes.values()) {
        const parent = node.parentId ? nodes.get(node.parentId) : undefined;
        if (parent) parent.children.push(node);
        else if (!node.parentId) roots.push(node);
      }
      res.json({ categories: roots });
    }),
  );

  router.get(
    `${V1}/catalogue/collections`,
    publicCache,
    handle(async (_req, res) => {
      const rows = await deps.db.collection.findMany({
        where: liveCollectionWhere(deps.now()),
        orderBy: { name: "asc" },
        include: { heroImage: true },
      });
      res.json({
        collections: rows.map((c) => ({
          slug: c.slug,
          name: c.name,
          description: c.description,
          heroImage: c.heroImage ? imageSources(base, c.heroImage) : null,
        })),
      });
    }),
  );

  router.get(
    `${V1}/catalogue/collections/:slug`,
    publicCache,
    validate({ params: slugParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      const c = await deps.db.collection.findFirst({
        where: { slug: params.slug, ...liveCollectionWhere(deps.now()) },
        include: { heroImage: true },
      });
      if (!c) throw new AppError("NOT_FOUND");
      res.json({
        collection: {
          slug: c.slug,
          name: c.name,
          description: c.description,
          heroImage: c.heroImage ? imageSources(base, c.heroImage) : null,
          seoTitle: c.seoTitle,
          seoDescription: c.seoDescription,
        },
      });
    }),
  );

  const listing = handle(async (_req, res) => {
    const { query } = input<unknown, unknown, ListingQuery>(res);
    const c = await loadCatalogue(deps.db, base, deps.now());
    res.json(await runListing(deps, query, c));
  });
  router.get(
    `${V1}/catalogue/products`,
    publicCache,
    validate({ query: listingQuery }),
    listing,
  );
  router.get(
    `${V1}/search`,
    searchLimit,
    publicCache,
    validate({ query: listingQuery }),
    listing,
  );

  router.get(
    `${V1}/catalogue/products/:slug`,
    publicCache,
    validate({ params: slugParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof slugParams>>(res);
      res.json({ product: await productDetail(deps, params.slug) });
    }),
  );

  router.get(
    `${V1}/search/suggest`,
    searchLimit,
    publicCache,
    validate({ query: suggestQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof suggestQuery>>(
        res,
      );
      const terms = searchTerms(query.q);
      if (terms.length < 2) return res.json({ products: [], categories: [] });
      const matches = await matchText(deps.db, terms);
      const ids = [...matches.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
      const [products, categories] = await Promise.all([
        deps.db.product.findMany({
          where: {
            id: { in: ids },
            ...publishedProductWhere,
            variants: { some: { isActive: true } },
          },
          select: { id: true, slug: true, name: true },
        }),
        deps.db.category.findMany({
          where: {
            status: "PUBLISHED",
            name: { contains: terms, mode: "insensitive" },
          },
          orderBy: { position: "asc" },
          take: 3,
          select: { slug: true, name: true },
        }),
      ]);
      const order = new Map(ids.map((id, i) => [id, i]));
      const ranked = products.sort(
        (a, b) => order.get(a.id)! - order.get(b.id)!,
      );
      const productLimit = Math.max(0, 6 - categories.length);
      res.json({
        products: ranked
          .slice(0, productLimit)
          .map(({ slug, name }) => ({ slug, name })),
        categories,
      });
    }),
  );

  return router;
}

/** Product detail (api-specification.md §6). */
async function productDetail(deps: ModuleDeps, slug: string) {
  const base = deps.config.mediaPublicBaseUrl;
  const p = await deps.db.product.findFirst({
    where: { slug, ...publishedProductWhere },
    include: {
      category: { select: { slug: true, name: true } },
      sizeChart: true,
      variants: {
        where: { isActive: true },
        include: { inventory: true, colour: true, size: true },
        orderBy: [
          { colour: { position: "asc" } },
          { size: { position: "asc" } },
        ],
      },
      images: { orderBy: { position: "asc" }, include: { mediaAsset: true } },
      collections: {
        where: { collection: liveCollectionWhere(deps.now()) },
        include: { collection: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!p || p.variants.length === 0) throw new AppError("NOT_FOUND");
  const colours = new Map(p.variants.map((v) => [v.colour.id, v.colour]));
  const sizes = new Map(p.variants.map((v) => [v.size.id, v.size]));
  const cheapest = p.variants.reduce((a, b) =>
    b.pricePaise < a.pricePaise ? b : a,
  );
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    fromPricePaise: cheapest.pricePaise,
    compareAtPricePaise: cheapest.compareAtPricePaise,
    currency: "INR" as const,
    shortDescription: p.shortDescription,
    description: p.description as Prisma.JsonObject,
    fabric: p.fabric,
    care: p.care,
    fit: p.fit,
    labels: p.labels,
    category: p.category,
    collections: p.collections.map((c) => c.collection),
    sizeChart: p.sizeChart
      ? {
          name: p.sizeChart.name,
          unit: p.sizeChart.unit,
          rows: p.sizeChart.rows,
        }
      : null,
    colours: [...colours.values()]
      .sort((a, b) => a.position - b.position)
      .map((c) => ({
        id: c.id,
        slug: c.slug,
        name: c.name,
        swatchHex: c.swatchHex,
      })),
    sizes: [...sizes.values()]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, label: s.label })),
    variants: p.variants.map((v) => ({
      id: v.id,
      colourId: v.colourId,
      sizeId: v.sizeId,
      sku: v.sku,
      pricePaise: v.pricePaise,
      compareAtPricePaise: v.compareAtPricePaise,
      ...availabilityOf(
        v.inventory ?? { onHand: 0, reserved: 0, lowStockThreshold: 0 },
      ),
    })),
    images: p.images
      .map((i) => {
        const sources = imageSources(base, i.mediaAsset);
        return sources
          ? { colourId: i.colourId, role: i.role, alt: i.alt, ...sources }
          : null;
      })
      .filter((i) => i !== null),
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
  };
}
