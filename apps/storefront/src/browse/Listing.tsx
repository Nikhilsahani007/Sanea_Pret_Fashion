// Listings (phase-13-plan.md §2; D-179): Shop all (/shop), a category
// (/shop/:slug, with its published sub-categories), New Ins (/new-in, newest
// first) and a collection (/collections/:slug). Filters (size, colour, price
// band, in stock) and the sort live in the URL; "Load more" follows the
// cursor. The filter panel sits beside the grid on wide screens and in a
// sheet on narrow ones. The result count is announced politely; results
// change with a 150 ms crossfade only (design-system.md §8).
import { useEffect, useId, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type {
  CategoryNode,
  Collection,
  Facets,
  Listing as ListingResponse,
  ProductSummary,
} from "../api/types.ts";
import { rupees } from "../lib/format.ts";
import { useRise } from "../lib/motion.ts";
import { useResource } from "../lib/resource.ts";
import { ProductCard } from "../product/ProductCard.tsx";
import grid from "../product/product.module.css";
import { NotFound } from "../shell/NotFound.tsx";
import { Picture } from "../ui/Picture.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import ui from "../ui/ui.module.css";
import {
  PRICE_BANDS,
  SORTS,
  activeCount,
  apiQuery,
  bandLabel,
  readFilters,
  writeFilters,
  type Filters,
  type Sort,
} from "./filters.ts";
import s from "./browse.module.css";

const PAGE = 24;

type Scope = { category?: string; collection?: string };
type Heading = {
  title: string;
  intro: string | null;
  image?: Collection["heroImage"];
  /** Category links shown in the panel (Shop all and New Ins only). */
  browseCategories: boolean;
};

function findCategory(
  nodes: CategoryNode[],
  slug: string,
): CategoryNode | null {
  for (const n of nodes) {
    if (n.slug === slug) return n;
    const child = findCategory(n.children, slug);
    if (child) return child;
  }
  return null;
}

export function ShopAll() {
  return (
    <Products
      scope={{}}
      heading={{
        title: "Shop all",
        intro: null,
        browseCategories: true,
      }}
    />
  );
}

export function NewIns() {
  return (
    <Products
      scope={{}}
      heading={{ title: "New Ins", intro: null, browseCategories: true }}
      newest
    />
  );
}

export function CategoryListing() {
  const slug = useParams().slug ?? "";
  const tree = useResource<{ items: CategoryNode[] }>(
    (signal) => api.get("/catalogue/categories", signal),
    [],
  );
  if (tree.status === "loading") return <Loading />;
  if (tree.status === "error")
    return <Problem error={tree.error} reload={tree.reload} />;
  const category = findCategory(tree.data.items, slug);
  if (!category) return <NotFound />;
  return (
    <Products
      key={slug}
      scope={{ category: slug }}
      heading={{
        title: category.name,
        intro: null,
        browseCategories: false,
      }}
      subcategories={category.children}
    />
  );
}

export function CollectionListing() {
  const slug = useParams().slug ?? "";
  const collection = useResource<Collection>(
    (signal) => api.get(`/catalogue/collections/${slug}`, signal),
    [slug],
  );
  if (collection.status === "loading") return <Loading />;
  if (collection.status === "error")
    return collection.error.status === 404 ? (
      <NotFound />
    ) : (
      <Problem error={collection.error} reload={collection.reload} />
    );
  const c = collection.data;
  return (
    <Products
      key={slug}
      scope={{ collection: slug }}
      heading={{
        title: c.name,
        intro: c.description,
        image: c.heroImage,
        browseCategories: false,
      }}
    />
  );
}

function Loading() {
  return (
    <div className={s.loading} aria-busy="true">
      <span className="visually-hidden">Loading</span>
    </div>
  );
}

function Problem({ error, reload }: { error: ApiError; reload: () => void }) {
  return (
    <div role="alert" className={s.problem}>
      <p>{error.message}</p>
      <button type="button" className={ui.button} onClick={reload}>
        Try again
      </button>
    </div>
  );
}

function Products({
  scope,
  heading,
  subcategories = [],
  newest = false,
}: {
  scope: Scope;
  heading: Heading;
  subcategories?: CategoryNode[];
  newest?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const key = writeFilters(filters).toString();
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "more" | "done">("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [panel, setPanel] = useState(false);
  // The first cards of each new result rise in; "Show more" adds quietly.
  const gridRef = useRef<HTMLUListElement>(null);
  useRise(gridRef, items[0]?.id ?? null);
  const scopeKey = `${scope.category ?? ""}|${scope.collection ?? ""}`;

  useEffect(() => {
    document.title = `${heading.title} · Sanéa Pret`;
  }, [heading.title]);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setError(null);
    api
      .get<ListingResponse>(
        `/catalogue/products?${apiQuery(scope, filters, PAGE)}`,
        controller.signal,
      )
      .then(
        (r) => {
          setItems(r.items);
          setFacets(r.facets ?? null);
          setCursor(r.nextCursor);
          setState("done");
        },
        (e: unknown) => {
          if (controller.signal.aborted) return;
          setError(toApiError(e));
          setItems([]);
          setCursor(null);
          setState("done");
        },
      );
    return () => controller.abort();
    // `scope` and `filters` are captured by their keys.
  }, [scopeKey, key]);

  async function more() {
    if (!cursor) return;
    setState("more");
    try {
      const r = await api.get<ListingResponse>(
        `/catalogue/products?${apiQuery(scope, filters, PAGE, cursor)}`,
      );
      setItems((prev) => [...prev, ...r.items]);
      setCursor(r.nextCursor);
      setError(null);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setState("done");
    }
  }

  const update = (next: Partial<Filters>) =>
    setParams(writeFilters({ ...filters, ...next }), { replace: true });
  const count = activeCount(filters);
  const status =
    state === "loading"
      ? "Loading products…"
      : error && items.length === 0
        ? ""
        : items.length === 0
          ? count
            ? "No products match these filters."
            : "Nothing here yet."
          : `${items.length}${cursor ? "+" : ""} ${items.length === 1 && !cursor ? "product" : "products"}`;

  const panelProps = {
    facets,
    filters,
    update,
    browseCategories: heading.browseCategories,
    subcategories,
  };

  return (
    <section aria-labelledby="listing-title" className={s.listing}>
      <header className={s.head}>
        {heading.image?.url ? (
          <div className={s.heroImage}>
            <Picture image={heading.image} sizes="100vw" eager />
          </div>
        ) : null}
        <h1 id="listing-title">{heading.title}</h1>
        {heading.intro ? <p className={s.intro}>{heading.intro}</p> : null}
      </header>
      <div className={s.toolbar}>
        <p role="status" className={s.count}>
          {status}
        </p>
        <div className={s.controls}>
          <button
            type="button"
            className={s.filterButton}
            onClick={() => setPanel(true)}
          >
            Filter{count ? ` (${count})` : ""}
          </button>
          <label className={s.sort}>
            Sort by{" "}
            <select
              value={filters.sort}
              onChange={(e) => update({ sort: e.target.value as Sort })}
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {value === "newest" && newest ? "Newest first" : label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className={s.body}>
        <aside className={s.aside} aria-label="Filters">
          <FilterPanel {...panelProps} />
        </aside>
        <div className={s.results} data-busy={state === "loading" || undefined}>
          {error ? (
            <div role="alert" className={s.problem}>
              <p>
                {error.status === 429
                  ? "The shop is busy. Try again in a moment."
                  : error.message}
              </p>
            </div>
          ) : null}
          {state === "done" && !error && items.length === 0 && count ? (
            <p>
              <button
                type="button"
                className={s.textButton}
                onClick={() =>
                  update({ sizes: [], colours: [], band: null, inStock: false })
                }
              >
                Clear the filters
              </button>{" "}
              to see everything here.
            </p>
          ) : null}
          {items.length ? (
            <ul className={grid.grid} aria-label="Products" ref={gridRef}>
              {items.map((p) => (
                <li key={p.id}>
                  <ProductCard product={p} />
                </li>
              ))}
            </ul>
          ) : null}
          {cursor ? (
            <div className={s.more}>
              <button
                type="button"
                className={ui.button}
                disabled={state === "more"}
                onClick={() => void more()}
              >
                {state === "more" ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <Sheet
        open={panel}
        onClose={() => setPanel(false)}
        title="Filter"
        side="left"
      >
        <FilterPanel {...panelProps} />
        <button
          type="button"
          className={ui.button}
          onClick={() => setPanel(false)}
        >
          {state === "loading"
            ? "Show products"
            : `Show ${status || "products"}`}
        </button>
      </Sheet>
    </section>
  );
}

function FilterPanel({
  facets,
  filters,
  update,
  browseCategories,
  subcategories,
}: {
  facets: Facets | null;
  filters: Filters;
  update: (next: Partial<Filters>) => void;
  browseCategories: boolean;
  subcategories: CategoryNode[];
}) {
  const id = useId();
  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  const categories = browseCategories
    ? (facets?.categories ?? []).filter((c) => c.count > 0)
    : subcategories.map((c) => ({ slug: c.slug, name: c.name, count: null }));
  const sizes = facets?.sizes ?? [];
  const colours = facets?.colours ?? [];
  const count = activeCount(filters);

  return (
    <div className={s.panel}>
      {categories.length ? (
        <nav aria-label="Categories" className={s.group}>
          <h2 className={s.groupTitle}>
            {browseCategories ? "Categories" : "In this category"}
          </h2>
          <ul className={s.categoryList}>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link to={`/shop/${c.slug}`}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {sizes.length ? (
        <fieldset className={s.group}>
          <legend className={s.groupTitle}>Size</legend>
          <div className={s.options}>
            {sizes.map((size) => (
              <label key={size.label} className={s.check}>
                <input
                  type="checkbox"
                  checked={filters.sizes.includes(size.label)}
                  onChange={() =>
                    update({ sizes: toggle(filters.sizes, size.label) })
                  }
                />
                {size.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {colours.length ? (
        <fieldset className={s.group}>
          <legend className={s.groupTitle}>Colour</legend>
          <div className={s.stackOptions}>
            {colours.map((c) => (
              <label key={c.slug} className={s.check}>
                <input
                  type="checkbox"
                  checked={filters.colours.includes(c.slug)}
                  onChange={() =>
                    update({ colours: toggle(filters.colours, c.slug) })
                  }
                />
                <span
                  className={s.chip}
                  style={{ backgroundColor: c.swatchHex }}
                  aria-hidden="true"
                />
                {c.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <fieldset className={s.group}>
        <legend className={s.groupTitle}>Price</legend>
        <div className={s.stackOptions}>
          <label className={s.check}>
            <input
              type="radio"
              name={`${id}-price`}
              checked={filters.band === null}
              onChange={() => update({ band: null })}
            />
            Any price
          </label>
          {PRICE_BANDS.map((b) => (
            <label key={b.min} className={s.check}>
              <input
                type="radio"
                name={`${id}-price`}
                checked={filters.band === b.min}
                onChange={() => update({ band: b.min })}
              />
              {bandLabel(b, rupees)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className={s.group}>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={filters.inStock}
            onChange={(e) => update({ inStock: e.target.checked })}
          />
          In stock only
        </label>
      </div>
      {count ? (
        <button
          type="button"
          className={s.textButton}
          onClick={() =>
            update({ sizes: [], colours: [], band: null, inStock: false })
          }
        >
          Clear all filters
        </button>
      ) : null}
    </div>
  );
}
