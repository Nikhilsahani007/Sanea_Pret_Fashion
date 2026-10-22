// Products: filter by status and category, newest first, cursor paging
// (GET /admin/products). Every role can view; O M C can create.
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api, query, toApiError, type ApiError } from "../api/client.ts";
import type {
  Category,
  List,
  Page,
  ProductSummary,
  Status,
} from "../api/types.ts";
import { useCan } from "../auth/session.tsx";
import { when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField } from "../ui/controls.tsx";
import {
  Cluster,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Stack,
  TableRegion,
  StatusChip,
  ui,
} from "../ui/feedback.tsx";

const STATUSES: Status[] = ["DRAFT", "PUBLISHED", "ARCHIVED"];

export function ProductsList() {
  const can = useCan();
  const canEdit = can("products.editContent");
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const categoryId = params.get("category") ?? "";

  const categories = useResource<Category[]>(
    async (signal) =>
      canEdit
        ? (await api.get<List<Category>>("/admin/categories", { signal })).items
        : [],
    [canEdit],
  );
  const page = useResource<Page<ProductSummary>>(
    (signal) =>
      api.get(`/admin/products${query({ status, categoryId, limit: 25 })}`, {
        signal,
      }),
    [status, categoryId],
  );
  const [more, setMore] = useState<ProductSummary[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<ApiError | null>(null);

  const categoryName = (id: string) =>
    categories.status === "ready"
      ? (categories.data.find((c) => c.id === id)?.name ?? "—")
      : "—";

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
    setMore([]);
    setCursor(undefined);
  }

  const firstCursor = page.status === "ready" ? page.data.nextCursor : null;
  const nextCursor = cursor === undefined ? firstCursor : cursor;

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const r = await api.get<Page<ProductSummary>>(
        `/admin/products${query({ status, categoryId, limit: 25, cursor: nextCursor })}`,
      );
      setMore((m) => [...m, ...r.items]);
      setCursor(r.nextCursor);
    } catch (error) {
      setMoreError(toApiError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  const items = page.status === "ready" ? [...page.data.items, ...more] : [];

  return (
    <Stack gap="6">
      <PageHeader
        title="Products"
        description={
          canEdit
            ? undefined
            : "Your role can view products but not change them."
        }
      >
        {canEdit ? (
          <Link to="/products/new" className={ui.button}>
            New product
          </Link>
        ) : null}
      </PageHeader>

      <form aria-label="Filter products" onSubmit={(e) => e.preventDefault()}>
        <Cluster gap="4">
          <div>
            <SelectField
              label="Status"
              value={status}
              onChange={(e) => setFilter("status", e.target.value)}
              optional
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0) + s.slice(1).toLowerCase()}
                </option>
              ))}
            </SelectField>
          </div>
          {canEdit && categories.status === "ready" ? (
            <div>
              <SelectField
                label="Category"
                value={categoryId}
                onChange={(e) => setFilter("category", e.target.value)}
                optional
              >
                <option value="">All categories</option>
                {categories.data.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : null}
        </Cluster>
      </form>

      {page.status === "loading" ? <Loading label="Loading products…" /> : null}
      {page.status === "error" ? (
        <ErrorState error={page.error} onRetry={page.reload} />
      ) : null}
      {page.status === "ready" && items.length === 0 ? (
        <Empty>
          {status || categoryId ? (
            <p>No products match these filters.</p>
          ) : (
            <Stack gap="3">
              <p>No products yet.</p>
              {canEdit ? (
                <p>
                  <Link to="/products/new">Create the first product</Link>
                </p>
              ) : null}
            </Stack>
          )}
        </Empty>
      ) : null}
      {items.length > 0 ? (
        <TableRegion label="Products">
          <table className={ui.table}>
            <caption className="visually-hidden">
              Products, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Status</th>
                {canEdit ? <th scope="col">Category</th> : null}
                <th scope="col" className={ui.numeric}>
                  Variants
                </th>
                <th scope="col" className={ui.numeric}>
                  Images
                </th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/products/${p.id}`}>{p.name}</Link>
                  </td>
                  <td>
                    <StatusChip status={p.status} />
                  </td>
                  {canEdit ? <td>{categoryName(p.categoryId)}</td> : null}
                  <td className={ui.numeric}>{p.variantCount}</td>
                  <td className={ui.numeric}>{p.imageCount}</td>
                  <td>{when(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : null}
      {moreError ? (
        <Notice tone="error" title="More products could not be loaded">
          <p>{moreError.message}</p>
        </Notice>
      ) : null}
      {page.status === "ready" && nextCursor ? (
        <div>
          <Button
            variant="secondary"
            onClick={loadMore}
            busy={loadingMore}
            busyLabel="Loading…"
          >
            Load more products
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}
