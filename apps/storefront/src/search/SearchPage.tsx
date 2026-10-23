// /search?q= (phase-11-plan.md §4.3): results from /api/v1/search, sorting,
// "Load more" by cursor, empty and error states. The query and the sort stay
// in the URL. The result count is announced politely.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type { Listing, ProductSummary } from "../api/types.ts";
import { ProductCard } from "../product/ProductCard.tsx";
import grid from "../product/product.module.css";
import ui from "../ui/ui.module.css";
import s from "./search.module.css";

const SORTS = {
  relevance: "Best match",
  newest: "Newest",
  price_asc: "Price, low to high",
  price_desc: "Price, high to low",
} as const;
type Sort = keyof typeof SORTS;
const isSort = (v: string | null): v is Sort =>
  v !== null && Object.hasOwn(SORTS, v);

const PAGE = 24;

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const sortParam = params.get("sort");
  const sort: Sort = isSort(sortParam) ? sortParam : "relevance";
  const [items, setItems] = useState<ProductSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "more" | "done">(
    "idle",
  );
  const [error, setError] = useState<ApiError | null>(null);

  const url = (after?: string) =>
    `/search?q=${encodeURIComponent(q)}&sort=${sort}&limit=${PAGE}${after ? `&cursor=${encodeURIComponent(after)}` : ""}`;

  useEffect(() => {
    document.title = q ? `Search: ${q} · Sanéa Pret` : "Search · Sanéa Pret";
    setItems([]);
    setCursor(null);
    setError(null);
    if (q.length < 2) {
      setState("idle");
      return;
    }
    const controller = new AbortController();
    setState("loading");
    api.get<Listing>(url(), controller.signal).then(
      (r) => {
        setItems(r.items);
        setCursor(r.nextCursor);
        setState("done");
      },
      (e: unknown) => {
        if (controller.signal.aborted) return;
        setError(toApiError(e));
        setState("done");
      },
    );
    return () => controller.abort();
    // `url` depends only on q and sort.
  }, [q, sort]);

  async function more() {
    if (!cursor) return;
    setState("more");
    try {
      const r = await api.get<Listing>(url(cursor));
      setItems((prev) => [...prev, ...r.items]);
      setCursor(r.nextCursor);
      setError(null);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setState("done");
    }
  }

  const busy = error?.status === 429;
  return (
    <section aria-labelledby="search-title" className={s.page}>
      <h1 id="search-title">{q ? `Results for “${q}”` : "Search the shop"}</h1>
      {q.length >= 2 ? (
        <div className={s.toolbar}>
          <p role="status" className={s.count}>
            {state === "loading"
              ? "Searching…"
              : error && items.length === 0
                ? ""
                : items.length === 0
                  ? "No products match."
                  : `${items.length}${cursor ? "+" : ""} ${items.length === 1 && !cursor ? "product" : "products"}`}
          </p>
          <label className={s.sort}>
            Sort by{" "}
            <select
              value={sort}
              onChange={(e) =>
                setParams({ q, sort: e.target.value }, { replace: true })
              }
            >
              {Object.entries(SORTS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p>Type at least two letters in the search box above.</p>
      )}
      {error ? (
        <div role="alert" className={s.problem}>
          <p>
            {busy ? "Search is busy. Try again in a moment." : error.message}
          </p>
        </div>
      ) : null}
      {state === "done" && !error && items.length === 0 && q.length >= 2 ? (
        <p>Try a different word, or check the spelling.</p>
      ) : null}
      {items.length ? (
        <ul className={grid.grid} aria-label="Results">
          {items.map((p) => (
            <li key={p.id}>
              <ProductCard product={p} />
            </li>
          ))}
        </ul>
      ) : null}
      {cursor ? (
        <div>
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
    </section>
  );
}
