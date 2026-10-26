// Page meta for search engines and link previews (Phase 17, OD-14 default).
// On every navigation the app asks the API for the page's description,
// canonical URL and preview tags and writes them to the document head; each
// page still sets its own title. Unknown pages are `noindex`. Crawlers that
// do not run scripts get the same meta from the API's preview endpoint.
import { useEffect } from "react";
import { useLocation } from "react-router";

import { api } from "../api/client.ts";

export type PageMeta = {
  title: string;
  description: string;
  canonical: string;
  image: { url: string; alt: string } | null;
  type: string;
  noindex: boolean;
};

function setMeta(attr: "name" | "property", key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(
    `meta[${attr}="${key}"]`,
  );
  if (value === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.append(el);
  }
  el.content = value;
}

function setCanonical(href: string | null) {
  let el = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (href === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.append(el);
  }
  el.href = href;
}

/** Writes `meta` to the head; null clears it and marks the page noindex. */
export function applyMeta(meta: PageMeta | null) {
  setMeta("name", "description", meta?.description ?? null);
  setCanonical(meta?.canonical ?? null);
  setMeta("name", "robots", !meta || meta.noindex ? "noindex" : null);
  setMeta("property", "og:title", meta?.title ?? null);
  setMeta("property", "og:description", meta?.description ?? null);
  setMeta("property", "og:url", meta?.canonical ?? null);
  setMeta("property", "og:type", meta?.type ?? null);
  setMeta("property", "og:image", meta?.image?.url ?? null);
  setMeta("property", "og:image:alt", meta?.image?.alt ?? null);
}

export function usePageMeta() {
  const { pathname } = useLocation();
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<{ meta: PageMeta }>(
        `/seo/meta?path=${encodeURIComponent(pathname)}`,
        controller.signal,
      )
      .then(
        (r) => applyMeta(r.meta),
        () => {
          if (!controller.signal.aborted) applyMeta(null);
        },
      );
    return () => controller.abort();
  }, [pathname]);
}
