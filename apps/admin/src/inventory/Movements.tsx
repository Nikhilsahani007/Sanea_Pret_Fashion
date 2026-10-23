// Stock movements (O M F): the append-only ledger of every stock change,
// newest first, with filters and paging (phase-9-plan.md §3.6).
import { useState } from "react";
import { useSearchParams } from "react-router";

import { api, query, toApiError, type ApiError } from "../api/client.ts";
import type { Movement, MovementType, Page } from "../api/types.ts";
import { localToIso, when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  RECEIVED: "Received",
  ADJUSTMENT: "Adjustment",
  RESERVED: "Reserved for a customer",
  RELEASED: "Reservation released",
  SHIPPED: "Shipped",
  RETURNED: "Returned",
  RESTOCKED: "Restocked",
  CORRECTION: "Count correction",
};

/** "+3", "−2" or "—", with a true minus sign. */
export const signed = (n: number) =>
  n === 0 ? "—" : n > 0 ? `+${n}` : `−${Math.abs(n)}`;

export function Movements() {
  const [params, setParams] = useSearchParams();
  const type = params.get("type") ?? "";
  const variantId = params.get("variant") ?? "";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const [fromDraft, setFromDraft] = useState(from);
  const [toDraft, setToDraft] = useState(to);
  const [more, setMore] = useState<Movement[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<ApiError | null>(null);

  const filters = {
    type: type || undefined,
    variantId: variantId || undefined,
    from: from ? (localToIso(from) ?? undefined) : undefined,
    to: to ? (localToIso(to) ?? undefined) : undefined,
    limit: 50,
  };
  const first = useResource<Page<Movement>>(
    (signal) =>
      api.get(`/admin/inventory/movements${query(filters)}`, { signal }),
    [type, variantId, from, to],
  );

  function apply(next: Record<string, string>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setParams(p, { replace: true });
    setMore([]);
    setCursor(undefined);
  }

  const items = first.status === "ready" ? [...first.data.items, ...more] : [];
  const next =
    cursor === undefined
      ? first.status === "ready"
        ? first.data.nextCursor
        : null
      : cursor;

  async function loadMore() {
    if (!next) return;
    setBusy(true);
    setMoreError(null);
    try {
      const page = await api.get<Page<Movement>>(
        `/admin/inventory/movements${query({ ...filters, cursor: next })}`,
      );
      setMore((m) => [...m, ...page.items]);
      setCursor(page.nextCursor);
    } catch (err) {
      setMoreError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="6">
      <PageHeader
        title="Stock movements"
        description="Every change to on hand or reserved stock, newest first. Entries cannot be edited or deleted."
      />
      <form
        aria-label="Filter stock movements"
        onSubmit={(e) => {
          e.preventDefault();
          apply({ from: fromDraft, to: toDraft });
        }}
      >
        <Cluster gap="4">
          <div>
            <SelectField
              label="Kind"
              optional
              value={type}
              onChange={(e) => apply({ type: e.target.value })}
            >
              <option value="">All kinds</option>
              {Object.entries(MOVEMENT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
          </div>
          <div>
            <TextField
              label="From"
              optional
              type="datetime-local"
              hint="India Standard Time"
              value={fromDraft}
              onChange={(e) => setFromDraft(e.target.value)}
            />
          </div>
          <div>
            <TextField
              label="Until"
              optional
              type="datetime-local"
              hint="India Standard Time"
              value={toDraft}
              onChange={(e) => setToDraft(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary">
            Apply dates
          </Button>
          {variantId ? (
            <Button variant="quiet" onClick={() => apply({ variant: "" })}>
              Show all variants
            </Button>
          ) : null}
        </Cluster>
      </form>

      {first.status === "loading" ? (
        <Loading label="Loading movements…" />
      ) : null}
      {first.status === "error" ? (
        <ErrorState error={first.error} onRetry={first.reload} />
      ) : null}
      {first.status === "ready" && items.length === 0 ? (
        <Empty>
          <p>No stock movements match these filters.</p>
        </Empty>
      ) : null}
      {items.length > 0 ? (
        <TableRegion label="Stock movements">
          <table className={ui.table}>
            <caption className="visually-hidden">
              Stock movements, newest first
            </caption>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">SKU</th>
                <th scope="col">Kind</th>
                <th scope="col" className={ui.numeric}>
                  On hand
                </th>
                <th scope="col" className={ui.numeric}>
                  Reserved
                </th>
                <th scope="col">Reason</th>
                <th scope="col">By</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>{when(m.createdAt)}</td>
                  <td className={ui.code}>
                    <button
                      type="button"
                      className={ui.linkButton}
                      onClick={() => apply({ variant: m.variantId })}
                      aria-label={`Show movements for ${m.sku}`}
                    >
                      {m.sku}
                    </button>
                  </td>
                  <td>{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                  <td className={ui.numeric}>{signed(m.onHandDelta)}</td>
                  <td className={ui.numeric}>{signed(m.reservedDelta)}</td>
                  <td>{m.reason ?? "—"}</td>
                  <td>
                    {m.actorName ??
                      (m.referenceType === "RESERVATION" ? "System" : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
      ) : null}
      {moreError ? <Notice tone="error" title={moreError.message} /> : null}
      {next ? (
        <div>
          <Button
            variant="secondary"
            onClick={loadMore}
            busy={busy}
            busyLabel="Loading…"
          >
            Load more movements
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}
