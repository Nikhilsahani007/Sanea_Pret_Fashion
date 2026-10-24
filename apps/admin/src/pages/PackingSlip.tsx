// Packing slip print view: what to pack and where it goes, and for COD the
// amount the courier collects. No prices per line (it travels in the parcel).
import { useQuery } from "@tanstack/react-query";
import { INDIAN_STATE_NAMES } from "@sanea/shared";
import { Link, useParams } from "react-router";

import { get } from "../api.ts";
import { dateTime, inr } from "../orders.ts";
import { Button, ErrorSummary, ui } from "../ui/ui.tsx";

type Slip = {
  orderNumber: string;
  placedAt: string;
  paymentMethod: "PREPAID" | "COD";
  collectPaise: number;
  phone: string;
  shipTo: {
    fullName: string;
    line1: string;
    line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pinCode: string;
  };
  items: {
    sku: string;
    productName: string;
    variantLabel: string;
    quantity: number;
  }[];
};

export function PackingSlip() {
  const { orderNumber = "" } = useParams();
  const data = useQuery({
    queryKey: ["packing-slip", orderNumber],
    queryFn: () =>
      get<{ packingSlip: Slip }>(`/admin/orders/${orderNumber}/packing-slip`),
  });
  if (data.isPending) return <p role="status">Loading packing slip…</p>;
  if (!data.data) return <ErrorSummary error={data.error} />;
  const s = data.data.packingSlip;
  const a = s.shipTo;
  return (
    <div className={ui.stack} data-print="slip">
      <div className={ui.row} data-print="hide">
        <Link to={`/orders/${s.orderNumber}`}>← Order</Link>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <h1>Packing slip · {s.orderNumber}</h1>
      <p>Sanéa Pret · placed {dateTime(s.placedAt)}</p>
      <section aria-labelledby="ship-to">
        <h2 id="ship-to">Ship to</h2>
        <p>
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
          {a.city},{" "}
          {INDIAN_STATE_NAMES[a.state as keyof typeof INDIAN_STATE_NAMES] ??
            a.state}{" "}
          {a.pinCode}
          <br />
          Phone {s.phone}
        </p>
      </section>
      <p>
        <strong>
          {s.paymentMethod === "COD"
            ? `Cash on delivery: collect ${inr(s.collectPaise)}`
            : "Paid online: collect nothing"}
        </strong>
      </p>
      <table className={ui.table}>
        <thead>
          <tr>
            <th scope="col">Packed</th>
            <th scope="col">SKU</th>
            <th scope="col">Item</th>
            <th scope="col">Qty</th>
          </tr>
        </thead>
        <tbody>
          {s.items.map((i) => (
            <tr key={i.sku}>
              <td aria-hidden="true">☐</td>
              <td>{i.sku}</td>
              <td>
                {i.productName} · {i.variantLabel}
              </td>
              <td>{i.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
