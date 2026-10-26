// Packing slip (phase-16-plan.md): what goes in the parcel and where it goes.
// No prices: the slip travels with the goods, and it is not a GST invoice
// (B-14). For cash on delivery it shows the amount the courier collects.
// The shell and the buttons are hidden when printing.
import { useParams, Link } from "react-router";

import { api } from "../api/client.ts";
import { inr, when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button } from "../ui/controls.tsx";
import {
  Cluster,
  ErrorState,
  Loading,
  PageHeader,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import type { ShipTo } from "./labels.ts";
import s from "./orders.module.css";

type Slip = {
  packingSlip: {
    orderNumber: string;
    placedAt: string;
    paymentMethod: "PREPAID" | "COD";
    collectPaise: number;
    shipTo: ShipTo;
    phone: string;
    items: {
      sku: string;
      productName: string;
      variantLabel: string;
      quantity: number;
    }[];
  };
};

export function PackingSlip() {
  const { orderNumber = "" } = useParams();
  const slip = useResource<Slip>(
    (signal) =>
      api.get(`/admin/orders/${orderNumber}/packing-slip`, { signal }),
    [orderNumber],
  );
  if (slip.status === "loading")
    return <Loading label="Loading packing slip…" />;
  if (slip.status === "error")
    return <ErrorState error={slip.error} onRetry={slip.reload} />;
  const p = slip.data.packingSlip;
  const a = p.shipTo;
  const units = p.items.reduce((n, i) => n + i.quantity, 0);

  return (
    <Stack gap="6">
      <Cluster className={s.noPrint}>
        <Link to={`/orders/${p.orderNumber}`}>Back to the order</Link>
        <Button variant="secondary" onClick={() => window.print()}>
          Print
        </Button>
      </Cluster>
      <article className={s.slip} aria-label={`Packing slip ${p.orderNumber}`}>
        <div className={s.slipHead}>
          <PageHeader
            title={`Packing slip ${p.orderNumber}`}
            description={`Sanéa Pret · placed ${when(p.placedAt)}`}
          />
        </div>
        <section aria-labelledby="slip-to">
          <h2 id="slip-to">Deliver to</h2>
          <address className={s.address}>
            {a.fullName}
            <br />
            {a.line1}
            {a.line2 ? (
              <>
                <br />
                {a.line2}
              </>
            ) : null}
            {a.landmark ? (
              <>
                <br />
                Near {a.landmark}
              </>
            ) : null}
            <br />
            {a.city} {a.pinCode}
            <br />
            Phone {p.phone}
          </address>
        </section>
        <TableRegion label="Items to pack">
          <table className={`${ui.table} ${s.fit}`}>
            <caption className="visually-hidden">Items to pack</caption>
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Item</th>
                <th scope="col" className={ui.numeric}>
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((i) => (
                <tr key={i.sku}>
                  <td className={ui.code}>{i.sku}</td>
                  <td>
                    {i.productName} · {i.variantLabel}
                  </td>
                  <td className={ui.numeric}>{i.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableRegion>
        <p>
          {units} {units === 1 ? "unit" : "units"} in total.
        </p>
        <p className={s.collect}>
          {p.paymentMethod === "COD"
            ? `Cash on delivery: collect ${inr(p.collectPaise)}`
            : "Paid online: collect nothing"}
        </p>
      </article>
    </Stack>
  );
}
