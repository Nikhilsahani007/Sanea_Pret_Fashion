// Public content (api-specification.md §3): the homepage, menus, pages and
// public settings. Only published content is read; drafts never leave the
// admin API. Cached for 60 seconds and cleared on publish.
import {
  CONTENT_BLOCKS,
  NAVIGATION_MENUS,
  richTextSchema,
  slugSchema,
  storeSettingsSchema,
  type ContentBlockKey,
} from "@sanea/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { handle, input } from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import { loadCatalogue } from "../catalogue/public-catalogue.ts";
import type { ModuleDeps } from "../deps.ts";
import { readMenu } from "./admin-router.ts";
import { cached } from "./cache.ts";
import {
  imagesById,
  link,
  liveSlugs,
  productsFor,
  resolveRichText,
} from "./resolve.ts";

const V1 = "/api/v1/content";
const cache60: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "public, max-age=60");
  next();
};

type Published<K extends ContentBlockKey> = z.infer<
  (typeof CONTENT_BLOCKS)[K]["schema"]
>;

function active(
  item: {
    startsAt?: string | null | undefined;
    endsAt?: string | null | undefined;
  },
  now: Date,
) {
  return (
    (!item.startsAt || new Date(item.startsAt) <= now) &&
    (!item.endsAt || new Date(item.endsAt) > now)
  );
}

export async function homeContent(deps: ModuleDeps) {
  const now = deps.now();
  const base = deps.config.mediaPublicBaseUrl;
  const rows = await deps.db.contentBlock.findMany({
    where: { publishedAt: { not: null } },
  });
  const block = <K extends ContentBlockKey>(key: K): Published<K> | null => {
    const row = rows.find((r) => r.key === key);
    if (!row?.published) return null;
    const parsed = CONTENT_BLOCKS[key].schema.safeParse(row.published);
    return parsed.success ? (parsed.data as Published<K>) : null;
  };
  const c = await loadCatalogue(deps.db, base, now);
  const live = await liveSlugs(deps.db, c);

  const announcement = block("home.announcement");
  const hero = block("home.hero");
  const slides = (hero?.slides ?? []).filter((s) => active(s, now));
  const images = await imagesById(
    deps.db,
    base,
    slides.flatMap((s) => [
      s.desktopImageId,
      ...(s.mobileImageId ? [s.mobileImageId] : []),
    ]),
  );
  const row = (key: "home.new-ins" | "home.row-2") => {
    const r = block(key);
    if (!r) return null;
    const items = productsFor(c, r.source, r.maxItems);
    return items.length
      ? { title: r.title, items, viewAllHref: link(r.viewAll, live) }
      : null;
  };
  const tabbed = block("home.tabbed");
  const footer = block("site.footer");

  return {
    announcement:
      announcement && active(announcement, now)
        ? { text: announcement.text, href: link(announcement.link, live) }
        : null,
    hero: slides.flatMap((s, i) => {
      const desktop = images.get(s.desktopImageId);
      if (!desktop) return [];
      return [
        {
          id: `slide-${i + 1}`,
          desktop,
          mobile: s.mobileImageId
            ? (images.get(s.mobileImageId) ?? null)
            : null,
          alt: s.alt,
          campaignLine: s.campaignLine,
          ctaLabel: s.ctaLabel,
          ctaHref: link(s.ctaTarget, live),
          focalX: s.focalX,
          focalY: s.focalY,
        },
      ];
    }),
    pills: (block("home.pills")?.pills ?? []).flatMap((p) => {
      const href = link(p.target, live);
      return href ? [{ label: p.label, href }] : [];
    }),
    newIns: row("home.new-ins"),
    secondRow: row("home.row-2"),
    tabbed: tabbed
      ? {
          title: tabbed.title ?? null,
          tabs: tabbed.tabs
            .map((t) => ({
              label: t.label,
              items: productsFor(c, t.source, tabbed.maxItems),
            }))
            .filter((t) => t.items.length > 0),
        }
      : null,
    // The editorial band stays off until you approve it (OD-23).
    footer: footer
      ? {
          groups: footer.groups.map((g) => ({
            title: g.title,
            links: g.links.flatMap((l) => {
              const href = link(l.target, live);
              return href ? [{ label: l.label, href }] : [];
            }),
          })),
          social: footer.social,
        }
      : null,
  };
}

export function contentPublicRouter(deps: ModuleDeps): Router {
  const router = Router();

  router.get(
    `${V1}/home`,
    cache60,
    handle(async (_req, res) => {
      res.json(await cached("home", () => homeContent(deps)));
    }),
  );

  router.get(
    `${V1}/navigation`,
    cache60,
    handle(async (_req, res) => {
      res.json(
        await cached("navigation", async () => {
          const c = await loadCatalogue(
            deps.db,
            deps.config.mediaPublicBaseUrl,
            deps.now(),
          );
          const live = await liveSlugs(deps.db, c);
          const menus: Record<string, { label: string; href: string }[]> = {};
          for (const menu of NAVIGATION_MENUS)
            menus[menu] = (await readMenu(deps, menu)).flatMap((i) => {
              const href = link(i.target, live);
              return href ? [{ label: i.label, href }] : [];
            });
          return { menus };
        }),
      );
    }),
  );

  router.get(
    `${V1}/pages/:slug`,
    cache60,
    validate({ params: z.object({ slug: slugSchema }) }),
    handle(async (_req, res) => {
      const { params } = input<unknown, { slug: string }>(res);
      const page = await deps.db.page.findUnique({
        where: { slug: params.slug },
      });
      // The database refuses an unverified Rehma Foundation page in PUBLISHED (CHECK).
      if (!page || page.status !== "PUBLISHED" || !page.publishedBody)
        throw new AppError("NOT_FOUND");
      const body = richTextSchema.safeParse(page.publishedBody);
      if (!body.success) throw new AppError("NOT_FOUND");
      res.json({
        page: {
          slug: page.slug,
          title: page.title,
          body: await resolveRichText(
            deps.db,
            deps.config.mediaPublicBaseUrl,
            body.data,
          ),
          seoTitle: page.seoTitle,
          seoDescription: page.seoDescription,
        },
      });
    }),
  );

  router.get(
    `${V1}/settings/public`,
    cache60,
    handle(async (_req, res) => {
      const row = await deps.db.storeSetting.findUnique({
        where: { key: "store" },
      });
      const s = storeSettingsSchema.parse(row?.value ?? {});
      // COD availability arrives with the COD rules in Phase 15.
      res.json({
        whatsappNumber: s.whatsappNumber,
        contactEmail: s.contactEmail,
        contactPhone: s.contactPhone,
        businessAddress: s.businessAddress,
      });
    }),
  );

  return router;
}
