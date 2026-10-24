// Turns published content into what the storefront renders: image sources,
// link hrefs and product rows resolved to product summaries. Unpublished or
// missing targets are dropped rather than shown as broken links.
import {
  targetHref,
  type LinkTarget,
  type ProductSource,
  type RichText,
  type RichTextBlock,
} from "@sanea/shared";

import type { Db } from "../../platform/db.ts";
import {
  categoryWithDescendants,
  sortProducts,
  summary,
  type Catalogue,
} from "../catalogue/public-catalogue.ts";
import { imageSources, type ImageSources } from "../media/urls.ts";

export async function imagesById(
  db: Db,
  baseUrl: string,
  ids: string[],
): Promise<Map<string, ImageSources>> {
  if (ids.length === 0) return new Map();
  const assets = await db.mediaAsset.findMany({
    where: { id: { in: [...new Set(ids)] } },
  });
  const out = new Map<string, ImageSources>();
  for (const a of assets) {
    const s = imageSources(baseUrl, a);
    if (s) out.set(a.id, s);
  }
  return out;
}

/** Published slugs per target type, to drop links to hidden things. */
export async function liveSlugs(db: Db, c: Catalogue) {
  const pages = await db.page.findMany({
    where: { status: "PUBLISHED" },
    select: { slug: true },
  });
  return {
    CATEGORY: new Set([...c.categories.values()].map((x) => x.slug)),
    COLLECTION: new Set([...c.collections.values()].map((x) => x.slug)),
    PRODUCT: new Set(c.products.map((p) => p.slug)),
    PAGE: new Set(pages.map((p) => p.slug)),
  };
}
export type LiveSlugs = Awaited<ReturnType<typeof liveSlugs>>;

export function link(
  target: LinkTarget | null | undefined,
  live: LiveSlugs,
): string | null {
  if (!target) return null;
  if (target.type !== "URL" && !live[target.type].has(target.slug)) return null;
  return targetHref(target);
}

export function productsFor(c: Catalogue, source: ProductSource, max: number) {
  let list = c.products;
  if (source.type === "COLLECTION") {
    const col = [...c.collections.values()].find((x) => x.slug === source.slug);
    list = col ? list.filter((p) => p.collectionIds.includes(col.id)) : [];
  } else if (source.type === "CATEGORY") {
    const cat = [...c.categories.values()].find((x) => x.slug === source.slug);
    const ids = cat ? categoryWithDescendants(c, cat.id) : new Set<string>();
    list = list.filter((p) => ids.has(p.categoryId));
  } else if (source.type === "MANUAL") {
    const bySlug = new Map(list.map((p) => [p.slug, p]));
    return source.slugs
      .flatMap((s) => (bySlug.has(s) ? [summary(c, bySlug.get(s)!)] : []))
      .slice(0, max);
  }
  return sortProducts(list, "newest")
    .slice(0, max)
    .map((p) => summary(c, p));
}

/** Rich text with image blocks resolved and links to hidden pages kept as text. */
export async function resolveRichText(db: Db, baseUrl: string, body: RichText) {
  const images = await imagesById(
    db,
    baseUrl,
    body.blocks.flatMap((b) => (b.type === "image" ? [b.mediaAssetId] : [])),
  );
  type Resolved =
    | Exclude<RichTextBlock, { type: "image" }>
    | ({ type: "image"; alt: string } & ImageSources);
  const blocks: Resolved[] = [];
  for (const b of body.blocks) {
    if (b.type !== "image") blocks.push(b);
    else {
      const sources = images.get(b.mediaAssetId);
      if (sources) blocks.push({ type: "image", alt: b.alt, ...sources });
    }
  }
  return { blocks };
}
