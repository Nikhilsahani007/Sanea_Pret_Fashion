// Dashboard (project-requirements.md §3.2): counts from real rows only, and
// only those this role may act on (the API leaves the others out).
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { get } from "../api.ts";
import { ROLE_LABELS, useAuth } from "../auth.tsx";
import { inr } from "../orders.ts";
import { ErrorSummary, ui } from "../ui/ui.tsx";

type Dashboard = {
  orders?: {
    today: number;
    todayValuePaise: number;
    pendingCodConfirmation: number;
    needsAttention: number;
    toDispatch: number;
  };
  lowStockVariants?: number;
  openEnquiries?: number;
};

function Tile({
  id,
  label,
  value,
  to,
}: {
  id: string;
  label: string;
  value: string | number;
  to?: string;
}) {
  return (
    <section className={ui.panel} aria-labelledby={id}>
      <h2 id={id}>{label}</h2>
      <p style={{ fontSize: "var(--sp-step-head)" }}>{value}</p>
      {to ? <Link to={to}>View</Link> : null}
    </section>
  );
}

export function Home() {
  const { state } = useAuth();
  const data = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => get<Dashboard>("/admin/dashboard"),
    refetchInterval: 60_000,
  });
  if (state.status !== "signedIn") return null;
  const d = data.data;
  return (
    <div className={ui.stack}>
      <h1>Welcome, {state.admin.name}</h1>
      <p className={ui.muted}>Signed in as {ROLE_LABELS[state.admin.role]}.</p>
      <ErrorSummary error={data.error} />
      {!d ? <p role="status">Loading…</p> : null}
      <div className={ui.row}>
        {d?.orders ? (
          <>
            <Tile
              id="t-today"
              label="Orders today"
              value={`${d.orders.today} · ${inr(d.orders.todayValuePaise)}`}
              to="/orders"
            />
            <Tile
              id="t-cod"
              label="COD to confirm"
              value={d.orders.pendingCodConfirmation}
              to="/orders?status=PENDING_CONFIRMATION"
            />
            <Tile
              id="t-dispatch"
              label="To pack or ship"
              value={d.orders.toDispatch}
              to="/orders?status=CONFIRMED"
            />
            <Tile
              id="t-attn"
              label="Needs attention"
              value={d.orders.needsAttention}
              to="/orders?needsAttention=true"
            />
          </>
        ) : null}
        {d?.lowStockVariants !== undefined ? (
          <Tile
            id="t-low"
            label="Low-stock variants"
            value={d.lowStockVariants}
            to="/inventory?lowStock=true"
          />
        ) : null}
        {d?.openEnquiries !== undefined ? (
          <Tile
            id="t-enq"
            label="Open enquiries"
            value={d.openEnquiries}
            to="/enquiries"
          />
        ) : null}
      </div>
    </div>
  );
}
