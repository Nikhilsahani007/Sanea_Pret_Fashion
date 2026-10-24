// Applies the API's page meta (description, canonical URL, link-preview tags,
// noindex) to the document head on every navigation. Titles stay with each
// page (useTitle). Crawlers that do not run scripts get the same meta from
// the API's preview endpoint (OD-14 default).
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useLocation } from "react-router";

import { get } from "./api.ts";

type Meta = {
  description: string;
  canonical: string;
  image: { url: string; alt: string } | null;
  type: string;
  title: string;
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
  if (href === null) return el?.remove();
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.append(el);
  }
  el.href = href;
}

export function usePageMeta() {
  const { pathname } = useLocation();
  const meta = useQuery({
    queryKey: ["meta", pathname],
    queryFn: () =>
      get<{ meta: Meta }>("/seo/meta", { path: pathname }).then((r) => r.meta),
    staleTime: 60_000,
    retry: false,
  });
  const m = meta.data;
  useEffect(() => {
    // Unknown pages (404 from the API) are not indexed.
    const missing = meta.isError;
    setMeta("name", "description", m?.description ?? null);
    setCanonical(m?.canonical ?? null);
    setMeta("name", "robots", missing || m?.noindex ? "noindex" : null);
    setMeta("property", "og:title", m?.title ?? null);
    setMeta("property", "og:description", m?.description ?? null);
    setMeta("property", "og:url", m?.canonical ?? null);
    setMeta("property", "og:type", m?.type ?? null);
    setMeta("property", "og:image", m?.image?.url ?? null);
  }, [m, meta.isError]);
}
