// Order list (project-requirements.md §3.2, phase-16-plan.md): filter by
// status, payment method, dates and the attention flag; search by order
// number, email or phone. The filters live in the address, so a dashboard
// tile can link straight to a filtered list. O M F (`orders.view`).
import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";

import { api, query, toApiError, type ApiError } from "../api/client.ts";
import { inr, when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, Checkbox, SelectField, TextField } from "../ui/controls.tsx";
import {
  Empty,
  ErrorState,
  Loading,
  Notice,
  PageHeader,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import {
  ATTENTION_LABELS,
  STATUS_LABELS,
  methodLabel,
  type OrderRow,
} from "./labels.ts";
import s from "./orders.module.css";

const FILTERS = ["status", "method", "needsAttention", "q", "from", "to"];
type ListPage = { orders: OrderRow[]; nextBefore: string | null };

export function StatusChip({ status }: { status: string }) {
  const tone =
    status === "DELIVERED"
      ? s.done
      : status === "CANCELLED" || status === "RETURNED"
        ? s.closed
        : status === "PENDING_CONFIRMATION"
          ? s.attention
          : "";
  return (
    <span className={`${ui.chip} ${tone}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Orders() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(
    FILTERS.map((k) => [k, params.get(k) ?? undefined]),
  );
  const key = params.toString();
  const [draft, setDraft] = useState(() => ({
    status: filters.status ?? "",
    method: filters.method ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
    q: filters.q ?? "",
    needsAttention: filters.needsAttention === "true",
  }));
  const [more, setMore] = useState<OrderRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<ApiError | null>(null);

  const page = useResource<ListPage>(
    (signal) =>
      api.get(`/admin/orders${query({ ...filters, limit: 50 })}`, { signal }),
    [key],
  );
  // A new first page (new filters or a reload) starts the list again.
  const first = page.status === "ready" ? page.data : null;
  useEffect(() => {
    setMore([]);
    setMoreError(null);
    setNext(first?.nextBefore ?? null);
  }, [first]);

  function apply(e: FormEvent) {
    e.preventDefault();
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(draft)) {
      const value = typeof v === "boolean" ? (v ? "true" : "") : v.trim();
      if (value) out.set(k, value);
    }
    setParams(out);
  }

  async function loadMore() {
    if (!next) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const r = await api.get<ListPage>(
        `/admin/orders${query({ ...filters, before: next, limit: 50 })}`,
      );
      setMore((m) => [...m, ...r.orders]);
      setNext(r.nextBefore);
    } catch (err) {
      setMoreError(toApiError(err));
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = first ? [...first.orders, ...more] : [];
  const filtered = FILTERS.some((k) => filters[k]);

  return (
    <Stack gap="6">
      <PageHeader
        title="Orders"
        description="Newest first. Cash on delivery orders wait for a call or WhatsApp message before they are confirmed."
      />
      <form role="search" aria-label="Filter orders" onSubmit={apply}>
        <div className={s.filters}>
          <SelectField
            label="Status"
            optional
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          >
            <option value="">Any status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Payment"
            optional
            value={draft.method}
            onChange={(e) => setDraft({ ...draft, method: e.target.value })}
          >
            <option value="">Any payment</option>
            <option value="PREPAID">Online</option>
            <option value="COD">Cash on delivery</option>
          </SelectField>
          <TextField
            label="Placed from"
            optional
            type="date"
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
          />
          <TextField
            label="Placed to"
            optional
            type="date"
            value={draft.to}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
          />
          <TextField
            label="Search"
            optional
            type="search"
            hint="Order number, email or phone"
            value={draft.q}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, q: e.target.value })}
          />
          <Checkbox
            label="Needs attention only"
            checked={draft.needsAttention}
            onChange={(e) =>
              setDraft({ ...draft, needsAttention: e.target.checked })
            }
          />
          <div>
            <Button type="submit" variant="secondary">
              Apply filters
            </Button>
          </div>
        </div>
      </form>

      {page.status === "loading" ? <Loading label="Loading orders…" /> : null}
      {page.status === "error" ? (
        <ErrorState error={page.error} onRetry={page.reload} />
      ) : null}
      {page.status === "ready" && rows.length === 0 ? (
        <Empty>
          <p>
            {filtered
              ? "No orders match these filters."
              : "No orders yet. Orders placed on the storefront appear here."}
          </p>
        </Empty>
      ) : null}
      {rows.length > 0 ? (
        <TableRegion label="Orders">
          <table className={ui.table}>
            <caption className="visually-hidden">Orders, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Status</th>
                <th scope="col">Placed</th>
                <th scope="col">Customer</th>
                <th scope="col" className={ui.numeric}>
                  Items
                </th>
                <th scope="col" className={ui.numeric}>
                  Total
                </th>
                <th scope="col">Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td className={ui.code}>
                    <Link to={`/orders/${o.orderNumber}`}>{o.orderNumber}</Link>
                    {o.needsAttention ? (
                      <>
                        {" "}
                        <span className={`${ui.chip} ${s.attention}`}>
                          {ATTENTION_LABELS[o.attentionReason ?? ""] ??
                            "Needs attention"}
                        </span>
                      </>
                    ) : null}
                  </td>
                  <td>
                    <StatusChip status={o.status} />
                  </td>
                  <td>{when(o.placedAt)}</td>
                  <td>
                    {o.customerName}, {o.city}
                  </td>
                  <td className={ui.numeric}>{o.itemCount}</td>
                  <td className={ui.numeric}>{inr(o.totalPaise)}</td>
                  <td>{methodLabel(o.paymentMethod)}</td>
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
            busy={loadingMore}
            busyLabel="Loading…"
            onClick={loadMore}
          >
            Show more orders
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}
