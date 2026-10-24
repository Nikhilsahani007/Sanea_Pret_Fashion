// Order list (project-requirements.md §3.2): filter by status, payment method,
// dates and attention flag; search by order number, email or phone.
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";

import { get } from "../api.ts";
import { ATTENTION_LABELS, STATUS_LABELS, dateTime, inr } from "../orders.ts";
import { Button, ErrorSummary, Select, TextField, ui } from "../ui/ui.tsx";

type Row = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: "PREPAID" | "COD";
  totalPaise: number;
  itemCount: number;
  customerName: string;
  city: string;
  needsAttention: boolean;
  attentionReason: string | null;
  placedAt: string;
};

const FILTERS = [
  "status",
  "method",
  "needsAttention",
  "q",
  "from",
  "to",
] as const;

export function Orders() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(
    FILTERS.map((k) => [k, params.get(k) ?? undefined]),
  );
  const list = useInfiniteQuery({
    queryKey: ["orders", filters],
    queryFn: ({ pageParam }) =>
      get<{ orders: Row[]; nextBefore: string | null }>("/admin/orders", {
        ...filters,
        before: pageParam,
        limit: "50",
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.orders) ?? [];

  return (
    <div className={ui.stack}>
      <h1>Orders</h1>
      <form
        className={ui.row}
        role="search"
        aria-label="Filter orders"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          for (const k of FILTERS) {
            const v = String(f.get(k) ?? "").trim();
            if (v) next.set(k, v);
          }
          setParams(next);
        }}
      >
        <Select
          label="Status"
          name="status"
          defaultValue={filters.status ?? ""}
        >
          <option value="">Any</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select
          label="Payment"
          name="method"
          defaultValue={filters.method ?? ""}
        >
          <option value="">Any</option>
          <option value="PREPAID">Online</option>
          <option value="COD">Cash on delivery</option>
        </Select>
        <TextField
          label="From"
          name="from"
          type="date"
          defaultValue={filters.from ?? ""}
        />
        <TextField
          label="To"
          name="to"
          type="date"
          defaultValue={filters.to ?? ""}
        />
        <TextField
          label="Search"
          name="q"
          type="search"
          hint="Order number, email or phone"
          defaultValue={filters.q ?? ""}
        />
        <label className={ui.check}>
          <input
            type="checkbox"
            name="needsAttention"
            value="true"
            defaultChecked={filters.needsAttention === "true"}
          />
          Needs attention only
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
      </form>
      <ErrorSummary error={list.error} />
      {list.isPending ? <p role="status">Loading orders…</p> : null}
      {list.data && rows.length === 0 ? (
        <p className={ui.panel}>No orders match.</p>
      ) : null}
      {rows.length > 0 ? (
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Placed</th>
                <th scope="col">Customer</th>
                <th scope="col">Items</th>
                <th scope="col">Total</th>
                <th scope="col">Payment</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link to={`/orders/${o.orderNumber}`}>{o.orderNumber}</Link>
                    {o.needsAttention ? (
                      <span className={ui.flag}>
                        {" "}
                        {ATTENTION_LABELS[o.attentionReason ?? ""] ??
                          "Needs attention"}
                      </span>
                    ) : null}
                  </td>
                  <td>{dateTime(o.placedAt)}</td>
                  <td>
                    {o.customerName}, {o.city}
                  </td>
                  <td>{o.itemCount}</td>
                  <td>{inr(o.totalPaise)}</td>
                  <td>{o.paymentMethod === "COD" ? "COD" : "Online"}</td>
                  <td>
                    <span className={ui.status} data-status={o.status}>
                      {STATUS_LABELS[o.status] ?? o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          busy={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          Show more
        </Button>
      ) : null}
    </div>
  );
}
