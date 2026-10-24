// Order detail: everything about one order, the moves this role may make
// (from the API's allowed-transitions answer), shipment entry, internal notes,
// refunds (recorded here, paid out manually in release one) and restocking.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import { get, send } from "../api.ts";
import { useAuth } from "../auth.tsx";
import {
  ACTION_LABELS,
  ATTENTION_LABELS,
  STATUS_LABELS,
  dateTime,
  inr,
} from "../orders.ts";
import {
  Button,
  ErrorSummary,
  Notice,
  Select,
  TextArea,
  TextField,
  ui,
} from "../ui/ui.tsx";

type Address = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pinCode: string;
};
type Detail = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentMethod: "PREPAID" | "COD";
    needsAttention: boolean;
    attentionReason: string | null;
    email: string;
    phone: string;
    shippingAddress: Address;
    customerNote: string | null;
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    codFeePaise: number;
    taxPaise: number;
    totalPaise: number;
    placedAt: string;
    items: {
      id: string;
      sku: string;
      productName: string;
      variantLabel: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
      restocked: number;
    }[];
    events: {
      fromStatus: string | null;
      toStatus: string;
      actorType: string;
      actorName: string | null;
      note: string | null;
      createdAt: string;
    }[];
    payments: {
      id: string;
      method: string;
      provider: string;
      status: string;
      amountPaise: number;
      failureCode: string | null;
      createdAt: string;
      refunds: {
        id: string;
        amountPaise: number;
        reason: string;
        status: string;
        reference: string | null;
        byStaff: boolean;
        createdAt: string;
      }[];
    }[];
    shipments: {
      id: string;
      courierName: string;
      trackingNumber: string;
      trackingUrl: string | null;
    }[];
    notes: { id: string; body: string; by: string; createdAt: string }[];
  };
  nextStatuses: string[];
};

const ACTOR: Record<string, string> = {
  SYSTEM: "System",
  CUSTOMER: "Customer",
  PROVIDER: "Payment provider",
  ADMIN: "Staff",
};

export function OrderDetail() {
  const { orderNumber = "" } = useParams();
  const { can } = useAuth();
  const qc = useQueryClient();
  const key = ["order", orderNumber];
  const data = useQuery({
    queryKey: key,
    queryFn: () => get<Detail>(`/admin/orders/${orderNumber}`),
  });
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const move = useMutation({
    mutationFn: (body: object) =>
      send("POST", `/admin/orders/${orderNumber}/transitions`, body),
    onSuccess: async (_r, body) => {
      setDone(
        `Order moved to ${STATUS_LABELS[(body as { toStatus: string }).toStatus]}.`,
      );
      setMoveTo(null);
      await refresh();
      await qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
  const note = useMutation({
    mutationFn: (body: string) =>
      send("POST", `/admin/orders/${orderNumber}/notes`, { body }),
    onSuccess: refresh,
  });
  const refund = useMutation({
    mutationFn: (body: object) =>
      send("POST", `/admin/orders/${orderNumber}/refunds`, body),
    onSuccess: refresh,
  });
  const complete = useMutation({
    mutationFn: (v: { id: string; outcome: string; reference?: string }) =>
      send("POST", `/admin/orders/${orderNumber}/refunds/${v.id}/complete`, {
        outcome: v.outcome,
        ...(v.reference ? { reference: v.reference } : {}),
      }),
    onSuccess: refresh,
  });
  const restock = useMutation({
    mutationFn: (lines: { itemId: string; quantity: number }[]) =>
      send("POST", `/admin/orders/${orderNumber}/restock`, { lines }),
    onSuccess: refresh,
  });

  if (data.isPending) return <p role="status">Loading order…</p>;
  if (!data.data) return <ErrorSummary error={data.error} />;
  const { order: o, nextStatuses } = data.data;
  const a = o.shippingAddress;
  const paid = o.payments.find((p) =>
    ["CAPTURED", "COLLECTED", "REFUND_PENDING", "REFUNDED"].includes(p.status),
  );

  function onMove(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "").trim();
    move.mutate({
      toStatus: moveTo,
      ...(v("note") ? { note: v("note") } : {}),
      ...(moveTo === "SHIPPED"
        ? {
            shipment: {
              courierName: v("courierName"),
              trackingNumber: v("trackingNumber"),
              ...(v("trackingUrl") ? { trackingUrl: v("trackingUrl") } : {}),
            },
          }
        : {}),
    });
  }
  const fieldErr = (k: string) =>
    move.error && "fieldErrors" in move.error
      ? (move.error as { fieldErrors(): Record<string, string> }).fieldErrors()[
          k
        ]
      : undefined;

  return (
    <div className={ui.stack}>
      <p>
        <Link to="/orders">← Orders</Link>
      </p>
      <div className={ui.pageHead}>
        <h1>Order {o.orderNumber}</h1>
        <span className={ui.status} data-status={o.status}>
          {STATUS_LABELS[o.status] ?? o.status}
        </span>
      </div>
      {o.needsAttention ? (
        <p className={ui.summary} role="alert">
          Needs attention:{" "}
          {ATTENTION_LABELS[o.attentionReason ?? ""] ?? o.attentionReason}
        </p>
      ) : null}
      {done ? <Notice>{done}</Notice> : null}

      <div className={ui.grid2}>
        <div className={ui.stack}>
          <section className={ui.panel} aria-labelledby="items">
            <h2 id="items">Items</h2>
            <div className={ui.tableWrap}>
              <table className={ui.table}>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Item</th>
                    <th scope="col">Qty</th>
                    <th scope="col">Price</th>
                    <th scope="col">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {o.items.map((i) => (
                    <tr key={i.id}>
                      <td>{i.sku}</td>
                      <td>
                        {i.productName} · {i.variantLabel}
                        {i.restocked > 0 ? (
                          <span className={ui.muted}>
                            {" "}
                            · {i.restocked} restocked
                          </span>
                        ) : null}
                      </td>
                      <td>{i.quantity}</td>
                      <td>{inr(i.unitPricePaise)}</td>
                      <td>{inr(i.lineTotalPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className={ui.dl}>
              <dt>Subtotal</dt>
              <dd>{inr(o.subtotalPaise)}</dd>
              <dt>Delivery</dt>
              <dd>{inr(o.shippingPaise)}</dd>
              {o.codFeePaise > 0 ? (
                <>
                  <dt>COD fee</dt>
                  <dd>{inr(o.codFeePaise)}</dd>
                </>
              ) : null}
              <dt>Total</dt>
              <dd>
                <strong>{inr(o.totalPaise)}</strong>
              </dd>
              <dt>GST included</dt>
              <dd>
                {o.taxPaise > 0 ? inr(o.taxPaise) : "No GST rule entered"}
              </dd>
            </dl>
          </section>

          {nextStatuses.length > 0 ? (
            <section className={ui.panel} aria-labelledby="actions">
              <h2 id="actions">Next step</h2>
              <div className={ui.row}>
                {nextStatuses.map((s) => (
                  <Button
                    key={s}
                    variant={
                      s === "CANCELLED"
                        ? "danger"
                        : moveTo === s
                          ? "primary"
                          : "secondary"
                    }
                    aria-pressed={moveTo === s}
                    onClick={() => {
                      setDone(null);
                      move.reset();
                      setMoveTo(s);
                    }}
                  >
                    {ACTION_LABELS[s] ?? s}
                  </Button>
                ))}
              </div>
              {moveTo ? (
                <form
                  className={ui.stack}
                  onSubmit={onMove}
                  aria-label={ACTION_LABELS[moveTo]}
                >
                  {moveTo === "SHIPPED" ? (
                    <>
                      <TextField
                        label="Courier"
                        name="courierName"
                        required
                        maxLength={100}
                        error={
                          fieldErr("shipment.courierName") ??
                          fieldErr("shipment")
                        }
                      />
                      <TextField
                        label="Tracking number"
                        name="trackingNumber"
                        required
                        maxLength={100}
                        error={fieldErr("shipment.trackingNumber")}
                      />
                      <TextField
                        label="Tracking link (optional)"
                        name="trackingUrl"
                        type="url"
                        hint="https only"
                        error={fieldErr("shipment.trackingUrl")}
                      />
                    </>
                  ) : null}
                  {moveTo === "CONFIRMED" && o.paymentMethod === "COD" ? (
                    <p className={ui.muted}>
                      Confirm only after speaking to the customer by phone or
                      WhatsApp.
                    </p>
                  ) : null}
                  {moveTo === "CANCELLED" ? (
                    <p className={ui.muted}>
                      Held stock is released.{" "}
                      {o.paymentMethod === "PREPAID" && paid
                        ? "A refund record is created for the online payment."
                        : ""}
                    </p>
                  ) : null}
                  <TextArea
                    label="Note for the history (optional)"
                    name="note"
                    rows={2}
                    maxLength={500}
                  />
                  <ErrorSummary error={move.error} />
                  <div className={ui.row}>
                    <Button
                      type="submit"
                      busy={move.isPending}
                      variant={moveTo === "CANCELLED" ? "danger" : "primary"}
                    >
                      {ACTION_LABELS[moveTo]}
                    </Button>
                    <Button variant="quiet" onClick={() => setMoveTo(null)}>
                      Back
                    </Button>
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}

          <section className={ui.panel} aria-labelledby="history">
            <h2 id="history">History</h2>
            <ol className={ui.timeline}>
              {o.events.map((e, i) => (
                <li key={i}>
                  {dateTime(e.createdAt)}:{" "}
                  {STATUS_LABELS[e.toStatus] ?? e.toStatus} ·{" "}
                  {e.actorName ?? ACTOR[e.actorType]}
                  {e.note ? (
                    <span className={ui.muted}> · {e.note}</span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section className={ui.panel} aria-labelledby="notes">
            <h2 id="notes">Internal notes</h2>
            {o.notes.length === 0 ? (
              <p className={ui.muted}>
                No notes yet. Customers never see these.
              </p>
            ) : null}
            <ul className={ui.timeline}>
              {o.notes.map((n) => (
                <li key={n.id}>
                  <span className={ui.muted}>
                    {dateTime(n.createdAt)} · {n.by}:
                  </span>{" "}
                  {n.body}
                </li>
              ))}
            </ul>
            <form
              className={ui.stack}
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const v = String(new FormData(form).get("body") ?? "").trim();
                if (v) note.mutate(v, { onSuccess: () => form.reset() });
              }}
            >
              <TextArea
                label="Add a note"
                name="body"
                rows={2}
                maxLength={2000}
              />
              <ErrorSummary error={note.error} />
              <Button type="submit" variant="secondary" busy={note.isPending}>
                Add note
              </Button>
            </form>
          </section>
        </div>

        <div className={ui.stack}>
          <section className={ui.panel} aria-labelledby="customer">
            <h2 id="customer">Customer and delivery</h2>
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
              {a.city} {a.pinCode}
            </p>
            <p>
              <a href={`tel:${o.phone}`}>{o.phone}</a>
              <br />
              <a href={`mailto:${o.email}`}>{o.email}</a>
            </p>
            {o.customerNote ? <p>Customer note: {o.customerNote}</p> : null}
            <p className={ui.muted}>Placed {dateTime(o.placedAt)}</p>
            <p>
              <Link to={`/orders/${o.orderNumber}/packing-slip`}>
                Packing slip
              </Link>
            </p>
            {o.shipments.map((s) => (
              <p key={s.id}>
                {s.courierName} · {s.trackingNumber}
                {s.trackingUrl ? (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={s.trackingUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Track
                    </a>
                  </>
                ) : null}
              </p>
            ))}
          </section>

          <section className={ui.panel} aria-labelledby="payments">
            <h2 id="payments">Payment</h2>
            {o.payments.map((p) => (
              <div key={p.id} className={ui.stack}>
                <p>
                  {p.method === "COD"
                    ? "Cash on delivery"
                    : `Online (${p.provider})`}{" "}
                  · {p.status.toLowerCase().replaceAll("_", " ")} ·{" "}
                  {inr(p.amountPaise)}
                  {p.failureCode ? (
                    <span className={ui.muted}> · {p.failureCode}</span>
                  ) : null}
                </p>
                {p.refunds.map((r) => (
                  <div key={r.id} className={ui.row}>
                    <span>
                      Refund {inr(r.amountPaise)} · {r.status.toLowerCase()} ·{" "}
                      {r.reason}
                      {r.reference ? ` · ref ${r.reference}` : ""}
                    </span>
                    {r.status === "PENDING" && can("orders.cancelRefund") ? (
                      <form
                        className={ui.row}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const ref = String(
                            new FormData(e.currentTarget).get("reference") ??
                              "",
                          ).trim();
                          complete.mutate({
                            id: r.id,
                            outcome: "REFUNDED",
                            ...(ref ? { reference: ref } : {}),
                          });
                        }}
                      >
                        <TextField
                          label="Reference"
                          name="reference"
                          maxLength={100}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          busy={complete.isPending}
                        >
                          Mark refunded
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
            <ErrorSummary error={complete.error} />
            {paid && can("orders.cancelRefund") ? (
              <form
                className={ui.stack}
                aria-label="Record a refund"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const rupees = Number(
                    String(f.get("amount") ?? "").replace(/[,₹\s]/g, ""),
                  );
                  refund.mutate({
                    amountPaise: Math.round(rupees * 100),
                    reason: String(f.get("reason") ?? "").trim(),
                  });
                }}
              >
                <h3>Record a refund</h3>
                <p className={ui.muted}>
                  Pay the refund through the bank or gateway, then mark it
                  refunded here.
                </p>
                <TextField
                  label="Amount in rupees"
                  name="amount"
                  inputMode="decimal"
                  required
                  error={
                    refund.error && "fieldErrors" in refund.error
                      ? (
                          refund.error as {
                            fieldErrors(): Record<string, string>;
                          }
                        ).fieldErrors().amountPaise
                      : undefined
                  }
                />
                <TextField
                  label="Reason"
                  name="reason"
                  required
                  maxLength={500}
                />
                <ErrorSummary error={refund.error} />
                <Button
                  type="submit"
                  variant="secondary"
                  busy={refund.isPending}
                >
                  Record refund
                </Button>
              </form>
            ) : null}
          </section>

          {(o.status === "RETURN_TO_ORIGIN" && can("orders.fulfil")) ||
          (o.status === "RETURNED" && can("orders.cancelRefund")) ? (
            <section className={ui.panel} aria-labelledby="restock">
              <h2 id="restock">Restock after inspection</h2>
              <form
                className={ui.stack}
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const lines = o.items
                    .map((i) => ({
                      itemId: i.id,
                      quantity: Number(f.get(i.id) ?? 0),
                    }))
                    .filter((l) => l.quantity > 0);
                  if (lines.length) restock.mutate(lines);
                }}
              >
                {o.items.map((i) => (
                  <Select
                    key={i.id}
                    label={`${i.sku} (${i.quantity - i.restocked} left to restock)`}
                    name={i.id}
                    defaultValue="0"
                  >
                    {Array.from(
                      { length: i.quantity - i.restocked + 1 },
                      (_, n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ),
                    )}
                  </Select>
                ))}
                <ErrorSummary error={restock.error} />
                <Button
                  type="submit"
                  variant="secondary"
                  busy={restock.isPending}
                >
                  Restock
                </Button>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
