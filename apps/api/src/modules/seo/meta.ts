// Page meta for search engines and link previews (OD-14 default: the SPA
// plus a meta endpoint for bots). One function decides title, description,
// image and canonical URL per storefront path; the SPA and the preview HTML
// both use it. Only published, visible content is described.
import type { RichText } from "@sanea/shared";

import type { Db } from "../../platform/db.ts";
import { imageSources } from "../media/urls.ts";

export type PageMeta = {
  title: string;
  description: string;
  canonical: string;
  image: { url: string; alt: string; width: number; height: number } | null;
  type: "website" | "product";
  /** Pages that should not be indexed (bag, checkout, order pages). */
  noindex: boolean;
};

const SITE = "Sanéa Pret";
const TAGLINE = "Effortless Elegance";
const DEFAULT_DESCRIPTION = `${SITE}: Indian women's eastern wear. ${TAGLINE}.`;
const PRIVATE = /^\/(cart|checkout|order)(\/|$)/;

const clip = (s: string, n: number) =>
  s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;

function plain(body: unknown): string {
  const blocks = (body as RichText | null)?.blocks ?? [];
  return blocks
    .flatMap((b) =>
      "text" in b && typeof b.text === "string"
        ? [b.text]
        : "items" in b && Array.isArray(b.items)
          ? (b.items as string[])
          : [],
    )
    .join(" ");
}

export async function metaFor(
  db: Db,
  options: { path: string; origin: string; mediaBase: string; now: Date },
): Promise<PageMeta | null> {
  const path = options.path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  const canonical = `${options.origin}${path === "/" ? "/" : path}`;
  const base = {
    canonical,
    image: null,
    type: "website" as const,
    noindex: false,
  };
  const named = (title: string, description = DEFAULT_DESCRIPTION) => ({
    ...base,
    title: `${clip(title, 60)} · ${SITE}`,
    description: clip(description, 160),
  });

  if (PRIVATE.test(path)) return { ...named("Your order"), noindex: true };
  if (path === "/")
    return {
      ...base,
      title: `${SITE} · ${TAGLINE}`,
      description: DEFAULT_DESCRIPTION,
    };
  if (path === "/shop") return named("Shop");
  if (path === "/new-in") return named("New in");
  if (path === "/collections") return named("Collections");
  if (path === "/contact") return named("Contact");
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
          where: { role: "PRIMARY" },
          orderBy: { position: "asc" },
          take: 1,
          include: { mediaAsset: true },
        },
      },
    });
    if (!p) return null;
    const img = p.images[0];
    const src = img ? imageSources(options.mediaBase, img.mediaAsset) : null;
    const absolute = (u: string) =>
      u.startsWith("http") ? u : `${options.origin}${u}`;
    return {
      ...named(p.seoTitle ?? p.name, p.seoDescription ?? p.shortDescription),
      type: "product",
      image:
        src && img
          ? {
              url: absolute(src.url),
              alt: img.alt,
              width: src.width,
              height: src.height,
            }
          : null,
    };
  }
  m = /^\/shop\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const c = await db.category.findFirst({
      where: { slug: m[1], status: "PUBLISHED" },
    });
    return c
      ? named(c.seoTitle ?? c.name, c.seoDescription ?? DEFAULT_DESCRIPTION)
      : null;
  }
  m = /^\/collections\/([a-z0-9-]+)$/.exec(path);
  if (m) {
    const now = options.now;
    const c = await db.collection.findFirst({
      where: {
        slug: m[1],
        status: "PUBLISHED",
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
    });
    return c
      ? named(
          c.seoTitle ?? c.name,
          c.seoDescription ?? c.description ?? DEFAULT_DESCRIPTION,
        )
      : null;
  }
  m = /^\/(?:policies\/([a-z0-9-]+)|([a-z0-9-]+))$/.exec(path);
  if (m) {
    const slug = m[1] ? `policy-${m[1]}` : m[2]!;
    const page = await db.page.findFirst({
      where: { slug, status: "PUBLISHED" },
    });
    return page
      ? named(
          page.seoTitle ?? page.title,
          page.seoDescription ??
            (plain(page.publishedBody) || DEFAULT_DESCRIPTION),
        )
      : null;
  }
  return null;
}
