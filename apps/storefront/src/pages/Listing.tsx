// Collection, category, "new in" and "shop all" listings with filters and
// sorting (index Phase 13). Filter state lives in the URL, so results are
// shareable and the back button works (system-design.md §8).
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { cartStyles } from "../components/CartLines.tsx";
import { ProductGrid } from "../components/ProductCard.tsx";
import { ApiError, get } from "../lib/api.ts";
import { inr } from "../lib/money.ts";
import type { Img, Listing as ListingData } from "../lib/types.ts";
import { useTitle } from "../lib/title.ts";
import { NotFound } from "./NotFound.tsx";
import s from "./Listing.module.css";
import p from "./pages.module.css";

type Kind = "all" | "new" | "category" | "collection";
const SORTS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price, low to high" },
  { value: "price_desc", label: "Price, high to low" },
];

function bandLabel(b: { minPaise: number; maxPaise: number | null }) {
  if (b.minPaise === 0 && b.maxPaise !== null)
    return `Under ${inr(b.maxPaise + 1)}`;
  if (b.maxPaise === null) return `${inr(b.minPaise)} and above`;
  return `${inr(b.minPaise)} to ${inr(b.maxPaise + 1)}`;
}

export function Listing({ kind }: { kind: Kind }) {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);

  // Heading from the category or collection itself.
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () =>
      get<{
        categories: {
          slug: string;
          name: string;
          children: { slug: string; name: string }[];
        }[];
      }>("/catalogue/categories"),
    enabled: kind === "category",
  });
  const collection = useQuery({
    queryKey: ["collection", slug],
    queryFn: () =>
      get<{
        collection: {
          name: string;
          description: string | null;
          seoTitle: string | null;
        };
      }>(`/catalogue/collections/${slug}`),
    enabled: kind === "collection",
    retry: false,
  });
  const allCategories =
    categories.data?.categories.flatMap((c) => [c, ...c.children]) ?? [];
  const title =
    kind === "new"
      ? "New in"
      : kind === "all"
        ? "Shop all"
        : kind === "category"
          ? allCategories.find((c) => c.slug === slug)?.name
          : collection.data?.collection.name;
  useTitle(title);

  const query = new URLSearchParams(params);
  query.set("limit", "24");
  if (kind === "category") query.set("category", slug!);
  if (kind === "collection") query.set("collection", slug!);
  const key = query.toString();
  const results = useInfiniteQuery({
    queryKey: ["listing", key],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const q = new URLSearchParams(query);
      if (pageParam) q.set("cursor", pageParam);
      return get<ListingData>("/catalogue/products", q);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (
    kind === "collection" &&
    collection.error instanceof ApiError &&
    collection.error.status === 404
  )
    return <NotFound />;
  if (kind === "category" && categories.data && !title) return <NotFound />;

  const toggle = (name: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const values = next.getAll(name);
        next.delete(name);
        for (const v of values.includes(value)
          ? values.filter((x) => x !== value)
          : [...values, value])
          next.append(name, v);
        return next;
      },
      { replace: true },
    );
  const setBand = (b: { minPaise: number; maxPaise: number | null } | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("priceMin");
        next.delete("priceMax");
        if (b) {
          next.set("priceMin", String(b.minPaise));
          if (b.maxPaise !== null) next.set("priceMax", String(b.maxPaise));
        }
        return next;
      },
      { replace: true },
    );
  const facets = results.data?.pages[0]?.facets;
  const total = results.data?.pages[0]?.total ?? 0;
  const items = results.data?.pages.flatMap((pg) => pg.items) ?? [];
  const activeFilters = ["size", "colour", "priceMin", "inStock"].some((k) =>
    params.has(k),
  );

  return (
    <div className={p.page}>
      <h1 className={p.title}>{title ?? " "}</h1>
      {kind === "collection" && collection.data?.collection.description ? (
        <p className={p.lead}>{collection.data.collection.description}</p>
      ) : null}
      <div className={s.layout}>
        <div>
          <button
            type="button"
            className={s.toggle}
            aria-expanded={open}
            aria-controls="filters"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide filters" : "Filter"}
          </button>
          <form
            id="filters"
            className={s.filters}
            data-open={open}
            aria-label="Filters"
            onSubmit={(e) => e.preventDefault()}
          >
            {facets && facets.sizes.length > 0 ? (
              <fieldset>
                <legend>Size</legend>
                {facets.sizes.map((f) => (
                  <label key={f.label} className={s.check}>
                    <input
                      type="checkbox"
                      checked={params.getAll("size").includes(f.label)}
                      onChange={() => toggle("size", f.label)}
                    />
                    {f.label} <span className={s.count}>({f.count})</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {facets && facets.colours.length > 0 ? (
              <fieldset>
                <legend>Colour</legend>
                {facets.colours.map((f) => (
                  <label key={f.slug} className={s.check}>
                    <input
                      type="checkbox"
                      checked={params.getAll("colour").includes(f.slug)}
                      onChange={() => toggle("colour", f.slug)}
                    />
                    <span
                      className={s.swatch}
                      style={{ background: f.swatchHex }}
                      aria-hidden="true"
                    />
                    {f.name} <span className={s.count}>({f.count})</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {facets && facets.priceBands.length > 0 ? (
              <fieldset>
                <legend>Price</legend>
                <label className={s.check}>
                  <input
                    type="radio"
                    name="price"
                    checked={!params.has("priceMin")}
                    onChange={() => setBand(null)}
                  />
                  Any price
                </label>
                {facets.priceBands.map((b) => (
                  <label key={b.key} className={s.check}>
                    <input
                      type="radio"
                      name="price"
                      checked={params.get("priceMin") === String(b.minPaise)}
                      onChange={() => setBand(b)}
                    />
                    {bandLabel(b)} <span className={s.count}>({b.count})</span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            <label className={s.check}>
              <input
                type="checkbox"
                checked={params.get("inStock") === "true"}
                onChange={(e) =>
                  setParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      if (e.target.checked) next.set("inStock", "true");
                      else next.delete("inStock");
                      return next;
                    },
                    { replace: true },
                  )
                }
              />
              In stock only
            </label>
            {activeFilters ? (
              <button
                type="button"
                className={s.clear}
                onClick={() =>
                  setParams(
                    params.get("sort") ? { sort: params.get("sort")! } : {},
                    { replace: true },
                  )
                }
              >
                Clear filters
              </button>
            ) : null}
          </form>
        </div>
        <div>
          <div className={s.bar}>
            <p className={p.meta} role="status" style={{ margin: 0 }}>
              {results.isPending
                ? "Loading…"
                : `${total} ${total === 1 ? "piece" : "pieces"}`}
            </p>
            <label className={s.sort}>
              Sort by
              <select
                value={params.get("sort") ?? "newest"}
                onChange={(e) =>
                  setParams(
                    (prev) => {
                      const next = new URLSearchParams(prev);
                      if (e.target.value === "newest") next.delete("sort");
                      else next.set("sort", e.target.value);
                      return next;
                    },
                    { replace: true },
                  )
                }
              >
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {results.isError ? (
            <p role="alert">
              These pieces could not be loaded. Try again in a moment.
            </p>
          ) : null}
          {results.data && total === 0 ? (
            <p>
              Nothing matches these filters.{" "}
              {activeFilters ? (
                <button
                  type="button"
                  className={s.clear}
                  onClick={() => setParams({}, { replace: true })}
                >
                  Clear filters
                </button>
              ) : null}
            </p>
          ) : null}
          <ProductGrid products={items} />
          {results.hasNextPage ? (
            <p className={p.more}>
              <button
                type="button"
                className={`${cartStyles.button} ${cartStyles.secondary}`}
                onClick={() => void results.fetchNextPage()}
                disabled={results.isFetchingNextPage}
              >
                {results.isFetchingNextPage ? "Loading…" : "Show more"}
              </button>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Collections() {
  useTitle("Collections");
  const list = useQuery({
    queryKey: ["collections"],
    queryFn: () =>
      get<{
        collections: {
          slug: string;
          name: string;
          description: string | null;
          heroImage: Img | null;
        }[];
      }>("/catalogue/collections"),
  });
  return (
    <div className={p.page}>
      <h1 className={p.title}>Collections</h1>
      {list.data?.collections.length === 0 ? (
        <p>New collections are on their way.</p>
      ) : null}
      <ul className={s.collections}>
        {list.data?.collections.map((c) => (
          <li key={c.slug}>
            <Link to={`/collections/${c.slug}`} className={s.collection}>
              {c.heroImage ? (
                <picture>
                  <source
                    type="image/avif"
                    srcSet={c.heroImage.avifSrcset}
                    sizes="(max-width: 40rem) 100vw, 33vw"
                  />
                  <img
                    src={c.heroImage.url}
                    srcSet={c.heroImage.webpSrcset}
                    sizes="(max-width: 40rem) 100vw, 33vw"
                    alt=""
                    loading="lazy"
                    width={c.heroImage.width}
                    height={c.heroImage.height}
                  />
                </picture>
              ) : (
                <div className={s.collectionBlank} aria-hidden="true" />
              )}
              <h2>{c.name}</h2>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
