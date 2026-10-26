// Page meta for search engines and link previews (Phase 17, OD-14 default:
// the single-page app plus a meta endpoint for bots). One function decides
// the title, description, image and canonical URL per storefront path; the
// app and the preview HTML both use it. Only content that is public right
// now is described; private pages (bag, checkout, orders, search) are
// `noindex`.
import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { imageView } from "../catalogue/common.ts";
import { PUBLIC_PAGE } from "../content/visibility.ts";
import type { MediaStorage } from "../media/storage.ts";

const { sql } = Prisma;

export type PageMeta = {
  title: string;
  description: string;
  canonical: string;
  image: { url: string; alt: string; width: number; height: number } | null;
  type: "website" | "product";
  noindex: boolean;
};

export const SITE = "Sanéa Pret";
const TAGLINE = "Effortless Elegance";
const DEFAULT_DESCRIPTION = `${SITE}: Indian women's eastern wear. ${TAGLINE}.`;
const PRIVATE = /^\/(cart|checkout|orders)(\/|$)/;

const clip = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;

/** The words of a rich-text document (text nodes only), for a description. */
export function plainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: unknown; text?: unknown; content?: unknown };
  if (n.type === "text" && typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  return n.content
    .map(plainText)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Visible collections, the same rule as the public catalogue. */
const liveCollection = (now: Date) => ({
  status: "PUBLISHED" as const,
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
  ],
});

export async function metaFor(
  db: Db,
  storage: MediaStorage,
  options: { path: string; origin: string; now: Date },
): Promise<PageMeta | null> {
  const path = options.path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  const canonical = `${options.origin}${path}`;
  const base = { canonical, image: null, type: "website" as const };
  const named = (title: string, description?: string | null) => ({
    ...base,
    title: `${clip(title, 60)} · ${SITE}`,
    description: clip(description?.trim() || DEFAULT_DESCRIPTION, 160),
    noindex: false,
  });

  if (PRIVATE.test(path)) return { ...named("Your order"), noindex: true };
  if (path === "/")
    return {
      ...base,
      title: `${SITE} · ${TAGLINE}`,
      description: DEFAULT_DESCRIPTION,
      noindex: false,
    };
  if (path === "/shop") return named("Shop all");
  if (path === "/new-in") return named("New in");
  if (path === "/search") return { ...named("Search"), noindex: true };

  let m = /^\/products\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const p = await db.product.findFirst({
      where: {
        slug: m[1],
        status: "PUBLISHED",
        category: { status: "PUBLISHED" },
      },
      include: {
        images: {
          orderBy: [{ role: "asc" }, { position: "asc" }],
          take: 1,
          include: { mediaAsset: true },
        },
      },
    });
    if (!p) return null;
    const img = p.images[0];
    const view = img ? imageView(img, storage) : null;
    return {
      ...named(p.seoTitle ?? p.name, p.seoDescription ?? p.shortDescription),
      type: "product",
      image:
        view?.url && img
          ? {
              url: view.url,
              alt: img.alt,
              width: view.width,
              height: view.height,
            }
          : null,
    };
  }
  m = /^\/shop\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const c = await db.category.findFirst({
      where: { slug: m[1], status: "PUBLISHED" },
    });
    return c ? named(c.seoTitle ?? c.name, c.seoDescription) : null;
  }
  m = /^\/collections\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const c = await db.collection.findFirst({
      where: { slug: m[1], ...liveCollection(options.now) },
    });
    return c
      ? named(c.seoTitle ?? c.name, c.seoDescription ?? c.description)
      : null;
  }
  m = /^\/pages\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const [page] = await db.$queryRaw<
      {
        title: string;
        body: unknown;
        seoTitle: string | null;
        seoDescription: string | null;
      }[]
    >(sql`
      SELECT pg."title", pg."published_body" AS "body", pg."seo_title" AS "seoTitle", pg."seo_description" AS "seoDescription"
      FROM "page" pg
      WHERE pg."slug" = ${m[1]} AND ${PUBLIC_PAGE} AND pg."published_body" IS NOT NULL`);
    return page
      ? named(
          page.seoTitle ?? page.title,
          page.seoDescription ?? plainText(page.body),
        )
      : null;
  }
  return null;
}

/** Every public path with its last change, for the sitemap. */
export async function publicPaths(db: Db, now: Date) {
  const [products, categories, collections, pages] = await Promise.all([
    db.product.findMany({
      where: { status: "PUBLISHED", category: { status: "PUBLISHED" } },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    }),
    db.category.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    }),
    db.collection.findMany({
      where: liveCollection(now),
      select: { slug: true, updatedAt: true },
      orderBy: { slug: "asc" },
    }),
    db.$queryRaw<{ slug: string; updatedAt: Date }[]>(sql`
      SELECT pg."slug", pg."updated_at" AS "updatedAt" FROM "page" pg
      WHERE ${PUBLIC_PAGE} AND pg."published_body" IS NOT NULL
      ORDER BY pg."slug"`),
  ]);
  return [
    { path: "/", updatedAt: null },
    { path: "/shop", updatedAt: null },
    { path: "/new-in", updatedAt: null },
    ...categories.map((c) => ({
      path: `/shop/${c.slug}`,
      updatedAt: c.updatedAt,
    })),
    ...collections.map((c) => ({
      path: `/collections/${c.slug}`,
      updatedAt: c.updatedAt,
    })),
    ...products.map((p) => ({
      path: `/products/${p.slug}`,
      updatedAt: p.updatedAt,
    })),
    ...pages.map((p) => ({ path: `/pages/${p.slug}`, updatedAt: p.updatedAt })),
  ];
}
