// SEO endpoints (Phase 17, OD-14 default). The storefront is a single-page
// app: it reads its meta from /seo/meta on every navigation. Crawlers and
// link-preview bots that do not run scripts are routed by the hosting layer
// (Phase 19) to /seo/preview, a small HTML document with the same meta, every
// value escaped. The sitemap and robots.txt come from published content.
import { Router } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { handle, input } from "../catalogue/common.ts";
import type { MediaStorage } from "../media/storage.ts";
import { SITE, metaFor, publicPaths, type PageMeta } from "./meta.ts";

const BASE = "/api/v1/seo";
const pathQuery = z.strictObject({
  path: z
    .string()
    .max(300)
    .regex(/^\/[A-Za-z0-9/_\-.?=&%]*$/),
});

export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** The preview document for bots: meta tags and one link, every value escaped. */
export function previewHtml(m: PageMeta): string {
  const tag = (attr: "name" | "property", key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;
  return [
    "<!doctype html>",
    '<html lang="en-IN">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>${escapeHtml(m.title)}</title>`,
    tag("name", "description", m.description),
    `<link rel="canonical" href="${escapeHtml(m.canonical)}">`,
    ...(m.noindex ? [tag("name", "robots", "noindex")] : []),
    tag("property", "og:site_name", SITE),
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
    `<h1>${escapeHtml(m.title)}</h1>`,
    `<p>${escapeHtml(m.description)}</p>`,
    `<p><a href="${escapeHtml(m.canonical)}">${escapeHtml(m.canonical)}</a></p>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function seoRouter(deps: AuthDeps, storage: MediaStorage): Router {
  const router = Router();
  const origin = deps.config.storefrontOrigin;
  const meta = (path: string) =>
    metaFor(deps.db, storage, { path, origin, now: deps.now() });

  router.get(
    `${BASE}/meta`,
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
    `${BASE}/preview`,
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
              title: `Page not found · ${SITE}`,
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
    `${BASE}/sitemap.xml`,
    handle(async (_req, res) => {
      const entries = (await publicPaths(deps.db, deps.now())).map(
        (e) =>
          `<url><loc>${escapeHtml(origin + e.path)}</loc>${e.updatedAt ? `<lastmod>${e.updatedAt.toISOString().slice(0, 10)}</lastmod>` : ""}</url>`,
      );
      res.setHeader("Cache-Control", "public, max-age=3600");
      res
        .type("application/xml")
        .send(
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`,
        );
    }),
  );

  router.get(`${BASE}/robots.txt`, (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res
      .type("text/plain")
      .send(
        [
          "User-agent: *",
          "Allow: /",
          "Disallow: /cart",
          "Disallow: /checkout",
          "Disallow: /orders/",
          "Disallow: /search",
          `Sitemap: ${origin}/sitemap.xml`,
          "",
        ].join("\n"),
      );
  });

  return router;
}
