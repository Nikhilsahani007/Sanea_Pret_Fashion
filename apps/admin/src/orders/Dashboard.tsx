// Dashboard (project-requirements.md §3.2): today's work, counted from real
// rows by the API. Each tile opens the list it counts. The API leaves out the
// figures a role may not use, so the tiles follow the role.
import { Link } from "react-router";

import { api, query } from "../api/client.ts";
import { useAdmin } from "../auth/session.tsx";
import { inr } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { ErrorState, Loading, PageHeader, Stack } from "../ui/feedback.tsx";
import s from "./orders.module.css";

type Figures = {
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

/** Today's date in India, for the order list's date filter. */
function istToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(),
  );
}

function Tile({
  to,
  label,
  value,
  detail,
}: {
  to: string;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Link to={to} className={s.tile}>
      <span>{label}</span>
      <span className={s.tileValue}>{value}</span>
      {detail ? <span>{detail}</span> : null}
    </Link>
  );
}

export function Dashboard() {
  const admin = useAdmin();
  const figures = useResource<Figures>(
    (signal) => api.get("/admin/dashboard", { signal }),
    [],
  );

  return (
    <Stack gap="6">
      <PageHeader
        title="Today"
        description={`Signed in as ${admin.name}. Each figure opens the list behind it.`}
      />
      {figures.status === "loading" ? <Loading /> : null}
      {figures.status === "error" ? (
        <ErrorState error={figures.error} onRetry={figures.reload} />
      ) : null}
      {figures.status === "ready" ? (
        <div className={s.tiles}>
          {figures.data.orders ? (
            <>
              <Tile
                to={`/orders${query({ from: istToday(), to: istToday() })}`}
                label="Orders today"
                value={figures.data.orders.today}
                detail={`${inr(figures.data.orders.todayValuePaise)} placed, cancellations excluded`}
              />
              <Tile
                to="/orders?status=PENDING_CONFIRMATION"
                label="COD orders to confirm"
                value={figures.data.orders.pendingCodConfirmation}
                detail="Call or message the customer first"
              />
              <Tile
                to="/orders?status=CONFIRMED"
                label="To pack and ship"
                value={figures.data.orders.toDispatch}
                detail="Confirmed or packed"
              />
              <Tile
                to="/orders?needsAttention=true"
                label="Need attention"
                value={figures.data.orders.needsAttention}
                detail="Payment problems and refunds due"
              />
            </>
          ) : null}
          {figures.data.lowStockVariants !== undefined ? (
            <Tile
              to="/inventory?lowStock=true"
              label="Low-stock variants"
              value={figures.data.lowStockVariants}
            />
          ) : null}
          {figures.data.openEnquiries !== undefined ? (
            <Tile
              to="/enquiries"
              label="Open enquiries"
              value={figures.data.openEnquiries}
              detail="New or in progress"
            />
          ) : null}
        </div>
      ) : null}
    </Stack>
  );
}
