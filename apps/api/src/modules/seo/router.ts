// SEO endpoints (OD-14 default, Phase 17). The storefront is a single-page
// app, so crawlers and link-preview bots are served a small HTML document
// with the page's meta tags by the hosting layer (it routes known bot user
// agents to /api/v1/seo/preview); everyone else gets the app. The sitemap
// and robots.txt are generated from published content.
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { handle, input } from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import type { ModuleDeps } from "../deps.ts";
import { metaFor, type PageMeta } from "./meta.ts";

const pathQuery = z.strictObject({
  path: z
    .string()
    .max(300)
    .regex(/^\/[A-Za-z0-9/_\-.?=&%]*$/),
});

const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** The preview document: meta tags and one link, every value escaped. */
export function previewHtml(m: PageMeta): string {
  const tag = (attr: "name" | "property", key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escape(value)}">`;
  const lines = [
    "<!doctype html>",
    '<html lang="en-IN">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escape(m.title)}</title>`,
    tag("name", "description", m.description),
    `<link rel="canonical" href="${escape(m.canonical)}">`,
    ...(m.noindex ? [tag("name", "robots", "noindex")] : []),
    tag("property", "og:site_name", "Sanéa Pret"),
    tag("property", "og:type", m.type),
    tag("property", "og:title", m.title),
    tag("property", "og:description", m.description),
    tag("property", "og:url", m.canonical),
    tag("property", "og:locale", "en_IN"),
    ...(m.image
      ? [
          tag("property", "og:image", m.image.url),
          tag("property", "og:image:alt", m.image.alt),
          tag("property", "og:image:width", String(m.image.width)),
          tag("property", "og:image:height", String(m.image.height)),
        ]
      : []),
    tag("name", "twitter:card", m.image ? "summary_large_image" : "summary"),
    "</head>",
    "<body>",
    `<h1>${escape(m.title)}</h1>`,
    `<p>${escape(m.description)}</p>`,
    `<p><a href="${escape(m.canonical)}">${escape(m.canonical)}</a></p>`,
    "</body>",
    "</html>",
  ];
  return lines.join("\n");
}

export function seoRouter(deps: ModuleDeps): Router {
  const router = Router();
  const origin = deps.config.storefrontOrigin;
  const meta = (path: string) =>
    metaFor(deps.db, {
      path,
      origin,
      mediaBase: deps.config.mediaPublicBaseUrl,
      now: deps.now(),
    });

  router.get(
    "/api/v1/seo/meta",
    validate({ query: pathQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof pathQuery>>(res);
      const m = await meta(query.path);
      if (!m) throw new AppError("NOT_FOUND");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json({ meta: m });
    }),
  );

  router.get(
    "/api/v1/seo/preview",
    validate({ query: pathQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof pathQuery>>(res);
      const m = await meta(query.path);
      res.setHeader("Cache-Control", "public, max-age=300");
      res
        .status(m ? 200 : 404)
        .type("html")
        .send(
          previewHtml(
            m ?? {
              title: "Not found · Sanéa Pret",
              description: "This page does not exist.",
              canonical: `${origin}/`,
              image: null,
              type: "website",
              noindex: true,
            },
          ),
        );
    }),
  );

  router.get(
    "/api/v1/seo/sitemap.xml",
    handle(async (_req, res) => {
      const now = deps.now();
      const [products, categories, collections, pages] = await Promise.all([
        deps.db.product.findMany({
          where: { status: "PUBLISHED", category: { status: "PUBLISHED" } },
          select: { slug: true, updatedAt: true },
        }),
        deps.db.category.findMany({
          where: { status: "PUBLISHED" },
          select: { slug: true, updatedAt: true },
        }),
        deps.db.collection.findMany({
          where: {
            status: "PUBLISHED",
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            ],
          },
          select: { slug: true, updatedAt: true },
        }),
        deps.db.page.findMany({
          where: { status: "PUBLISHED" },
          select: { slug: true, updatedAt: true },
        }),
      ]);
      const url = (path: string, at?: Date) =>
        `<url><loc>${escape(origin + path)}</loc>${at ? `<lastmod>${at.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`;
      const entries = [
        url("/"),
        url("/shop"),
        url("/new-in"),
        url("/collections"),
        url("/contact"),
        ...categories.map((c) => url(`/shop/${c.slug}`, c.updatedAt)),
        ...collections.map((c) => url(`/collections/${c.slug}`, c.updatedAt)),
        ...products.map((p) => url(`/products/${p.slug}`, p.updatedAt)),
        ...pages.map((p) =>
          url(
            p.slug.startsWith("policy-")
              ? `/policies/${p.slug.slice("policy-".length)}`
              : `/${p.slug}`,
            p.updatedAt,
          ),
        ),
      ];
      res.setHeader("Cache-Control", "public, max-age=3600");
      res
        .type("application/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
        );
    }),
  );

  router.get("/api/v1/seo/robots.txt", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res
      .type("text/plain")
      .send(
        [
          "User-agent: *",
          "Allow: /",
          "Disallow: /cart",
          "Disallow: /checkout",
          "Disallow: /order/",
          "Disallow: /search",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n"),
      );
  });

  return router;
}
