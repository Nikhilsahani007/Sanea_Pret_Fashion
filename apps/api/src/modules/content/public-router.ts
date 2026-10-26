// /api/v1/content (api-specification.md §3; phase-10-plan.md §3.7; D-093).
// Published content only: every response is built from `published` columns,
// never drafts. Targets are linked only while public; product rows contain
// only products the catalogue shows; images are derivatives. A page that is
// not public (draft, archived, or the Rehma Foundation page before the Owner
// verifies and publishes it) is a 404 identical to an unknown slug, never cached.
import {
  CONTENT_BLOCKS,
  indianMobileSchema,
  pageRichTextSchema,
  plainTextSchema,
  slugSchema,
  type ContentTarget,
  type ProductSource,
} from "@sanea/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../platform/http/errors.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { summaries } from "../catalogue/public-router.ts";
import { handle, publicCache } from "../catalogue/common.ts";
import type { MediaStorage } from "../media/storage.ts";
import {
  PUBLIC_PAGE,
  assetViews,
  hrefOf,
  imageOf,
  productsFor,
  publicHrefs,
} from "./visibility.ts";

const BASE = "/api/v1/content";
const { sql } = Prisma;

/** Served on the homepage; `home.editorial` waits for OD-23 (Phase 12). */
const HOME_KEYS = [
  "site.announcement",
  "home.hero",
  "home.newIns",
  "home.row2",
  "home.tabbedGrid",
] as const;

/**
 * The store setting behind the WhatsApp button (OD-16). Until the Owner sets
 * a valid number it is null and the storefront shows no WhatsApp link.
 */
export const WHATSAPP_SETTING = "contact.whatsapp";
/** Also the admin settings screen's schema (Phase 16). */
export const whatsAppSetting = z.object({
  number: indianMobileSchema,
  hours: plainTextSchema(0, 120).optional(),
});

const notFound: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next(new AppError("NOT_FOUND"));
};

type Window = { startsAt?: string; endsAt?: string };
const active = (w: Window, now: Date) =>
  (!w.startsAt || new Date(w.startsAt) <= now) &&
  (!w.endsAt || new Date(w.endsAt) > now);

/** Published payloads that still pass their schema; anything else is skipped. */
async function published(deps: AuthDeps, keys: readonly string[]) {
  const rows = await deps.db.contentBlock.findMany({
    where: { key: { in: [...keys] }, published: { not: Prisma.AnyNull } },
    select: { key: true, published: true },
  });
  const out = new Map<string, unknown>();
  for (const r of rows) {
    const schema = CONTENT_BLOCKS[r.key as keyof typeof CONTENT_BLOCKS]?.schema;
    const parsed = schema?.safeParse(r.published);
    if (parsed?.success) out.set(r.key, parsed.data);
  }
  return out;
}

export function contentPublicRouter(
  deps: AuthDeps,
  storage: MediaStorage,
): Router {
  const router = Router();
  const dbNow = async () =>
    (await deps.db.$queryRaw<{ now: Date }[]>(sql`SELECT now() AS "now"`))[0]!
      .now;

  router.get(
    `${BASE}/home`,
    publicCache,
    handle(async (_req, res) => {
      const now = await dbNow();
      const blocks = await published(deps, HOME_KEYS);
      const announcement = blocks.get("site.announcement") as
        ({ text: string; link?: ContentTarget } & Window) | undefined;
      const hero = blocks.get("home.hero") as
        | {
            slides: ({
              desktopImageId: string;
              mobileImageId: string;
              alt: string;
              campaignLine?: string;
              ctaLabel: string;
              ctaTarget: ContentTarget;
              focalPoint?: { x: number; y: number };
            } & Window)[];
          }
        | undefined;
      const slides = (hero?.slides ?? []).filter((s) => active(s, now));
      const targets = [
        ...(announcement?.link ? [announcement.link] : []),
        ...slides.map((s) => s.ctaTarget),
      ];
      const [hrefs, assets] = await Promise.all([
        publicHrefs(deps.db, targets, now),
        assetViews(
          deps.db,
          slides.flatMap((s) => [s.desktopImageId, s.mobileImageId]),
        ),
      ]);

      const row = async (key: "home.newIns" | "home.row2") => {
        const b = blocks.get(key) as
          | { title: string; source: ProductSource; maxItems: number }
          | undefined;
        if (!b) return null;
        const items = await summaries(
          deps,
          storage,
          await productsFor(deps.db, b.source, b.maxItems, now),
        );
        return items.length ? { title: b.title, items } : null;
      };
      const grid = blocks.get("home.tabbedGrid") as
        | { tabs: { label: string; source: ProductSource }[]; maxItems: number }
        | undefined;
      const tabs = grid
        ? (
            await Promise.all(
              grid.tabs.map(async (t) => ({
                label: t.label,
                items: await summaries(
                  deps,
                  storage,
                  await productsFor(deps.db, t.source, grid.maxItems, now),
                ),
              })),
            )
          ).filter((t) => t.items.length > 0)
        : [];

      res.json({
        announcement:
          announcement && active(announcement, now)
            ? {
                text: announcement.text,
                href: announcement.link
                  ? hrefOf(hrefs, announcement.link)
                  : null,
              }
            : null,
        hero: {
          // A slide whose call to action points at something not public is not shown.
          slides: slides.flatMap((s) => {
            const href = hrefOf(hrefs, s.ctaTarget);
            const desktop = imageOf(
              storage,
              assets.get(s.desktopImageId),
              s.alt,
            );
            const mobile = imageOf(storage, assets.get(s.mobileImageId), s.alt);
            return href && desktop && mobile
              ? [
                  {
                    desktopImage: desktop,
                    mobileImage: mobile,
                    campaignLine: s.campaignLine ?? null,
                    ctaLabel: s.ctaLabel,
                    href,
                    focalPoint: s.focalPoint ?? null,
                  },
                ]
              : [];
          }),
        },
        newIns: await row("home.newIns"),
        row2: await row("home.row2"),
        tabbedGrid: tabs.length ? { tabs } : null,
      });
    }),
  );

  router.get(
    `${BASE}/settings/public`,
    publicCache,
    handle(async (_req, res) => {
      const row = await deps.db.storeSetting.findUnique({
        where: { key: WHATSAPP_SETTING },
        select: { value: true },
      });
      const whatsApp = whatsAppSetting.safeParse(row?.value);
      res.json({
        whatsApp: whatsApp.success
          ? { number: whatsApp.data.number, hours: whatsApp.data.hours || null }
          : null,
      });
    }),
  );

  router.get(
    `${BASE}/navigation`,
    publicCache,
    handle(async (_req, res) => {
      const now = await dbNow();
      const rows = await deps.db.navigationItem.findMany({
        orderBy: [{ menu: "asc" }, { position: "asc" }],
      });
      const targets = rows.map((r) =>
        r.targetType === "URL"
          ? ({ kind: "URL", url: r.url! } as const)
          : ({ kind: r.targetType, id: r.targetId! } as ContentTarget),
      );
      const hrefs = await publicHrefs(deps.db, targets, now);
      const menus: Record<string, { label: string; href: string }[]> = {};
      rows.forEach((r, i) => {
        const href = hrefOf(hrefs, targets[i]!);
        // Only links whose target is public right now (Q10-3).
        if (href) (menus[r.menu] ??= []).push({ label: r.label, href });
      });
      const footer =
        (await published(deps, ["site.footer"])).get("site.footer") ?? null;
      res.json({ menus, footer });
    }),
  );

  router.get(
    `${BASE}/pages/:slug`,
    handle(async (req, res, next) => {
      const slug = slugSchema.safeParse(req.params.slug);
      if (!slug.success) return notFound(req, res, next);
      const [page] = await deps.db.$queryRaw<
        {
          slug: string;
          title: string;
          body: unknown;
          seoTitle: string | null;
          seoDescription: string | null;
        }[]
      >(sql`
        SELECT pg."slug", pg."title", pg."published_body" AS "body", pg."seo_title" AS "seoTitle", pg."seo_description" AS "seoDescription"
        FROM "page" pg
        WHERE pg."slug" = ${slug.data} AND ${PUBLIC_PAGE} AND pg."published_body" IS NOT NULL`);
      const body = page ? pageRichTextSchema.safeParse(page.body) : null;
      if (!page || !body?.success) return notFound(req, res, next);
      const images = body.data.content.flatMap((b) =>
        b.type === "image" ? [b.mediaAssetId] : [],
      );
      const assets = await assetViews(deps.db, images);
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({
        slug: page.slug,
        title: page.title,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        body: {
          type: "doc",
          // Image nodes become derivative views; an image whose file is gone is left out.
          content: body.data.content.flatMap((b): unknown[] => {
            if (b.type !== "image") return [b];
            const image = imageOf(storage, assets.get(b.mediaAssetId), b.alt);
            return image
              ? [{ type: "image", image, caption: b.caption ?? null }]
              : [];
          }),
        },
      });
    }),
  );

  return router;
}
