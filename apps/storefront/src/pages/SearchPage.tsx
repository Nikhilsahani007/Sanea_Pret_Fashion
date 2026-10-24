import { useInfiniteQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router";

import { ProductGrid } from "../components/ProductCard.tsx";
import { SearchBox } from "../components/SearchBox.tsx";
import { cartStyles } from "../components/CartLines.tsx";
import { get } from "../lib/api.ts";
import type { Listing } from "../lib/types.ts";
import { useTitle } from "../lib/title.ts";
import s from "./pages.module.css";

export function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  useTitle(q ? `Search: ${q}` : "Search");
  const results = useInfiniteQuery({
    queryKey: ["search", q],
    enabled: q.length > 0,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      get<Listing>("/search", { q, limit: "24", cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = results.data?.pages.flatMap((p) => p.items) ?? [];
  const total = results.data?.pages[0]?.total ?? 0;
  return (
    <div className={s.page}>
      <h1 className={s.title}>Search</h1>
      <div style={{ marginBottom: "var(--sp-space-6)" }}>
        <SearchBox key={q} initial={q} />
      </div>
      {q && results.isPending ? <p role="status">Searching…</p> : null}
      {results.isError ? (
        <p role="alert">
          Search is not available right now. Try again in a moment.
        </p>
      ) : null}
      {q && results.data ? (
        <p className={s.meta} role="status">
          {total === 0
            ? `Nothing matches “${q}”. Try a shorter word or a colour.`
            : `${total} ${total === 1 ? "piece" : "pieces"} for “${q}”`}
        </p>
      ) : null}
      {items.length > 0 ? <ProductGrid products={items} /> : null}
      {results.hasNextPage ? (
        <p className={s.more}>
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
  );
}
