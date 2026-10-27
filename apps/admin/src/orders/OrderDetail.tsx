// Order detail (phase-16-plan.md): everything about one order and the moves
// this role may make, from the API's own answer (the API checks them again).
// Shipping asks for the courier and tracking number; cancelling asks for a
// reason (D-181). Internal notes are append-only; refunds are recorded here
// and paid outside the system in release one (UF-7); returns are restocked
// after inspection (SR-13).
import {
  CANCEL_REASONS,
  STAFF_CANCEL_REASONS,
  type CancelReason,
} from "@sanea/shared";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";

import {
  api,
  localError,
  toApiError,
  type ApiError,
  type FieldErrors,
} from "../api/client.ts";
import { useCan } from "../auth/session.tsx";
import { inr, rupeesToPaise, when } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Button, SelectField, TextArea, TextField } from "../ui/controls.tsx";
import {
  Cluster,
  ErrorState,
  ErrorSummary,
  Loading,
  Notice,
  PageHeader,
  Panel,
  Stack,
  TableRegion,
  ui,
} from "../ui/feedback.tsx";
import {
  ACTOR_LABELS,
  ATTENTION_LABELS,
  PAYMENT_STATUS_LABELS,
  STATUS_LABELS,
  actionLabel,
  methodLabel,
  type OrderDetail as Detail,
} from "./labels.ts";
import { StatusChip } from "./Orders.tsx";
import s from "./orders.module.css";

type Order = Detail["order"];
const PAID = ["CAPTURED", "COLLECTED", "REFUND_PENDING", "REFUNDED"];

export function OrderDetail() {
  const { orderNumber = "" } = useParams();
  const can = useCan();
  const [message, setMessage] = useState<string | null>(null);
  const detail = useResource<Detail>(
    (signal) => api.get(`/admin/orders/${orderNumber}`, { signal }),
    [orderNumber],
  );
  const done = (text: string) => {
    setMessage(text);
    detail.reload();
  };

  if (detail.status === "loading") return <Loading label="Loading order…" />;
  if (detail.status === "error")
    return (
      <Stack gap="4">
        <PageHeader title={`Order ${orderNumber}`} />
        <ErrorState error={detail.error} onRetry={detail.reload} />
      </Stack>
    );
  const { order: o, nextStatuses } = detail.data;
  const paid = o.payments.find((p) => PAID.includes(p.status));
  const canRestock =
    (o.status === "RETURN_TO_ORIGIN" && can("orders.fulfil")) ||
    (o.status === "RETURNED" && can("orders.cancelRefund"));

  return (
    <Stack gap="6">
      <p>
        <Link to="/orders">Back to orders</Link>
      </p>
      <PageHeader
        title={`Order ${o.orderNumber}`}
        description={`Placed ${when(o.placedAt)} · ${methodLabel(o.paymentMethod)} · ${inr(o.totalPaise)}`}
      >
        <StatusChip status={o.status} />
        <Link to={`/orders/${o.orderNumber}/packing-slip`}>Packing slip</Link>
      </PageHeader>
      {o.needsAttention ? (
        <Notice tone="error" title="Needs attention">
          <p>
            {ATTENTION_LABELS[o.attentionReason ?? ""] ?? o.attentionReason}
          </p>
        </Notice>
      ) : null}
      {message ? <Notice tone="success" title={message} /> : null}

      <div className={s.columns}>
        <Stack gap="6">
          {nextStatuses.length > 0 ? (
            <NextStep
              key={`${o.status}-${o.events.length}`}
              order={o}
              nextStatuses={nextStatuses}
              hasPaidOnline={o.paymentMethod === "PREPAID" && Boolean(paid)}
              onDone={done}
            />
          ) : null}
          <Items order={o} />
          <History order={o} />
          <Notes key={`notes-${o.notes.length}`} order={o} onDone={done} />
        </Stack>
        <Stack gap="6">
          <Customer order={o} />
          <Payments
            order={o}
            canRecord={Boolean(paid) && can("orders.cancelRefund")}
            onDone={done}
          />
          {canRestock ? (
            <Restock
              key={`restock-${o.items.map((i) => i.restocked).join("-")}`}
              order={o}
              onDone={done}
            />
          ) : null}
        </Stack>
      </div>
    </Stack>
  );
}

function NextStep({
  order: o,
  nextStatuses,
  hasPaidOnline,
  onDone,
}: {
  order: Order;
  nextStatuses: string[];
  hasPaidOnline: boolean;
  onDone: (message: string) => void;
}) {
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [courier, setCourier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  function choose(to: string) {
    setMoveTo(to);
    setReason("");
    setNote("");
    setError(null);
    setFields({});
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!moveTo) return;
    const problems: FieldErrors = {};
    if (moveTo === "SHIPPED") {
      if (!courier.trim()) problems.courierName = "Enter the courier.";
      if (!tracking.trim())
        problems.trackingNumber = "Enter the tracking number.";
      if (trackingUrl.trim() && !/^https:\/\//.test(trackingUrl.trim()))
        problems.trackingUrl = "The tracking link must start with https://.";
    }
    if (moveTo === "CANCELLED") {
      if (!reason) problems.reason = "Choose why the order is cancelled.";
      if (reason === "OTHER" && !note.trim())
        problems.note = "Describe the reason in the note.";
    }
    setFields(problems);
    if (Object.keys(problems).length) {
      setError(localError("Check the highlighted fields."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${o.orderNumber}/transitions`, {
        toStatus: moveTo,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(moveTo === "CANCELLED" ? { reason } : {}),
        ...(moveTo === "SHIPPED"
          ? {
              shipment: {
                courierName: courier.trim(),
                trackingNumber: tracking.trim(),
                ...(trackingUrl.trim()
                  ? { trackingUrl: trackingUrl.trim() }
                  : {}),
              },
            }
          : {}),
      });
      onDone(`Order ${o.orderNumber}: ${STATUS_LABELS[moveTo] ?? moveTo}.`);
    } catch (err) {
      const apiError = toApiError(err);
      setError(apiError);
      const f = apiError.fieldErrors;
      setFields({
        ...(f["shipment.courierName"]
          ? { courierName: f["shipment.courierName"] }
          : {}),
        ...(f["shipment.trackingNumber"]
          ? { trackingNumber: f["shipment.trackingNumber"] }
          : {}),
        ...(f["shipment.trackingUrl"]
          ? { trackingUrl: f["shipment.trackingUrl"] }
          : {}),
        ...(f.reason ? { reason: f.reason } : {}),
        ...(f.note ? { note: f.note } : {}),
      });
    } finally {
      setBusy(false);
    }
  }

  const label = moveTo ? actionLabel(o.status, moveTo) : "";
  return (
    <Panel title="Next step">
      <Stack>
        <Cluster>
          {nextStatuses.map((to) => (
            <Button
              key={to}
              variant={
                to === "CANCELLED"
                  ? "danger"
                  : moveTo === to
                    ? "primary"
                    : "secondary"
              }
              aria-pressed={moveTo === to}
              onClick={() => choose(to)}
            >
              {actionLabel(o.status, to)}
            </Button>
          ))}
        </Cluster>
        {moveTo ? (
          <form onSubmit={submit} noValidate aria-label={label}>
            <fieldset className={ui.fieldset}>
              <legend>{label}</legend>
              <Stack>
                <ErrorSummary
                  error={error}
                  fields={fields}
                  idPrefix="move-"
                  labels={{
                    courierName: "Courier",
                    trackingNumber: "Tracking number",
                    trackingUrl: "Tracking link",
                    reason: "Reason",
                    note: "Note",
                  }}
                />
                {moveTo === "CONFIRMED" && o.paymentMethod === "COD" ? (
                  <p className={ui.muted}>
                    Confirm only after speaking to the customer by phone or
                    WhatsApp.
                  </p>
                ) : null}
                {moveTo === "SHIPPED" ? (
                  <div className={s.formGrid}>
                    <TextField
                      id="move-courierName"
                      label="Courier"
                      maxLength={100}
                      value={courier}
                      onChange={(e) => setCourier(e.target.value)}
                      error={fields.courierName}
                    />
                    <TextField
                      id="move-trackingNumber"
                      label="Tracking number"
                      maxLength={100}
                      spellCheck={false}
                      value={tracking}
                      onChange={(e) => setTracking(e.target.value)}
                      error={fields.trackingNumber}
                    />
                    <TextField
                      id="move-trackingUrl"
                      label="Tracking link"
                      optional
                      type="url"
                      hint="Starts with https://. The customer's shipping email includes it."
                      maxLength={500}
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      error={fields.trackingUrl}
                    />
                  </div>
                ) : null}
                {moveTo === "CANCELLED" ? (
                  <>
                    <p className={ui.muted}>
                      Held stock goes back on sale.
                      {hasPaidOnline
                        ? " A refund record is created for the online payment."
                        : ""}{" "}
                      The customer is emailed.
                    </p>
                    <SelectField
                      id="move-reason"
                      label="Reason"
                      value={reason}
                      onChange={(e) =>
                        setReason(e.target.value as CancelReason | "")
                      }
                      error={fields.reason}
                    >
                      <option value="">Choose a reason</option>
                      {STAFF_CANCEL_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {CANCEL_REASONS[r]}
                        </option>
                      ))}
                    </SelectField>
                  </>
                ) : null}
                <TextArea
                  id="move-note"
                  label="Note for the order history"
                  optional={!(moveTo === "CANCELLED" && reason === "OTHER")}
                  hint="Staff see it in the history; customers never do. Do not record payment details."
                  rows={2}
                  maxLength={500}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  error={fields.note}
                />
                <Cluster>
                  <Button
                    type="submit"
                    variant={moveTo === "CANCELLED" ? "danger" : "primary"}
                    busy={busy}
                    busyLabel="Saving…"
                  >
                    {label}
                  </Button>
                  <Button variant="quiet" onClick={() => setMoveTo(null)}>
                    Back
                  </Button>
                </Cluster>
              </Stack>
            </fieldset>
          </form>
        ) : null}
      </Stack>
    </Panel>
  );
}

function Items({ order: o }: { order: Order }) {
  return (
    <Panel title="Items">
      <TableRegion label="Items in this order">
        <table className={`${ui.table} ${s.fit}`}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col" className={ui.numeric}>
                Qty
              </th>
              <th scope="col" className={ui.numeric}>
                Price
              </th>
              <th scope="col" className={ui.numeric}>
                Line total
              </th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((i) => (
              <tr key={i.id}>
                <td>
                  {i.productName}
                  <br />
                  <span className={ui.muted}>
                    {i.variantLabel} · <span className={ui.code}>{i.sku}</span>
                    {i.restocked > 0 ? <> · {i.restocked} restocked</> : null}
                  </span>
                </td>
                <td className={ui.numeric}>{i.quantity}</td>
                <td className={ui.numeric}>{inr(i.unitPricePaise)}</td>
                <td className={ui.numeric}>{inr(i.lineTotalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableRegion>
      <dl className={s.totals}>
        <dt>Subtotal</dt>
        <dd>{inr(o.subtotalPaise)}</dd>
        {o.discountPaise > 0 ? (
          <>
            <dt>Discount</dt>
            <dd>−{inr(o.discountPaise)}</dd>
          </>
        ) : null}
        <dt>Delivery</dt>
        <dd>{o.shippingPaise > 0 ? inr(o.shippingPaise) : "Free"}</dd>
        {o.codFeePaise > 0 ? (
          <>
            <dt>COD fee</dt>
            <dd>{inr(o.codFeePaise)}</dd>
          </>
        ) : null}
        <dt>
          <strong>Total</strong>
        </dt>
        <dd>
          <strong>{inr(o.totalPaise)}</strong>
        </dd>
        <dt>GST included</dt>
        <dd>{o.taxPaise > 0 ? inr(o.taxPaise) : "No GST rule entered"}</dd>
      </dl>
    </Panel>
  );
}

function History({ order: o }: { order: Order }) {
  return (
    <Panel title="History">
      <ol className={s.timeline}>
        {o.events.map((e, i) => (
          <li key={i}>
            <strong>{STATUS_LABELS[e.toStatus] ?? e.toStatus}</strong> ·{" "}
            {when(e.createdAt)} · {e.actorName ?? ACTOR_LABELS[e.actorType]}
            {e.reason ? <> · {CANCEL_REASONS[e.reason] ?? e.reason}</> : null}
            {e.note ? <span className={ui.muted}> · {e.note}</span> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function Notes({
  order: o,
  onDone,
}: {
  order: Order;
  onDone: (message: string) => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) {
      setError(localError("Write the note first."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${o.orderNumber}/notes`, {
        body: body.trim(),
      });
      onDone("Note added.");
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Internal notes">
      <Stack>
        {o.notes.length === 0 ? (
          <p className={ui.muted}>No notes yet. Customers never see these.</p>
        ) : (
          <ul className={s.timeline}>
            {o.notes.map((n) => (
              <li key={n.id}>
                <span className={ui.muted}>
                  {when(n.createdAt)} · {n.by}:
                </span>{" "}
                <span className={s.message}>{n.body}</span>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} noValidate aria-label="Add a note">
          <Stack>
            {error ? <Notice tone="error" title={error.message} /> : null}
            <TextArea
              label="New note"
              hint="Notes cannot be edited or deleted once added."
              rows={2}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div>
              <Button
                type="submit"
                variant="secondary"
                busy={busy}
                busyLabel="Adding…"
              >
                Add note
              </Button>
            </div>
          </Stack>
        </form>
      </Stack>
    </Panel>
  );
}

function Customer({ order: o }: { order: Order }) {
  const a = o.shippingAddress;
  return (
    <Panel title="Customer and delivery">
      <Stack gap="3">
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
        </address>
        <p>
          <a href={`tel:${o.phone}`}>{o.phone}</a>
          <br />
          <a href={`mailto:${o.email}`}>{o.email}</a>
        </p>
        {o.customerNote ? <p>Customer note: {o.customerNote}</p> : null}
        {o.shipments.map((sh) => (
          <p key={sh.id}>
            Shipped {when(sh.shippedAt)} with {sh.courierName}, tracking{" "}
            <span className={ui.code}>{sh.trackingNumber}</span>
            {sh.trackingUrl ? (
              <>
                {" "}
                ·{" "}
                <a href={sh.trackingUrl} target="_blank" rel="noreferrer">
                  Track the parcel
                </a>
              </>
            ) : null}
            {sh.deliveredAt ? <> · delivered {when(sh.deliveredAt)}</> : null}
          </p>
        ))}
      </Stack>
    </Panel>
  );
}

function Payments({
  order: o,
  canRecord,
  onDone,
}: {
  order: Order;
  canRecord: boolean;
  onDone: (message: string) => void;
}) {
  const can = useCan();
  return (
    <Panel title="Payment">
      <Stack>
        {o.payments.map((p) => (
          <Stack key={p.id} gap="3">
            <p>
              {p.method === "COD" ? "Cash on delivery" : "Online"} ·{" "}
              {PAYMENT_STATUS_LABELS[p.status] ?? p.status} ·{" "}
              {inr(p.amountPaise)}
              {p.failureCode ? (
                <span className={ui.muted}> · {p.failureCode}</span>
              ) : null}
            </p>
            {p.refunds.map((r) => (
              <RefundRow
                key={r.id}
                orderNumber={o.orderNumber}
                refund={r}
                gateway={p.method === "PREPAID" && p.provider === "phonepe"}
                canComplete={can("orders.cancelRefund")}
                onDone={onDone}
              />
            ))}
          </Stack>
        ))}
        {canRecord ? (
          <RecordRefund
            orderNumber={o.orderNumber}
            gateway={o.payments.some(
              (p) => p.method === "PREPAID" && p.provider === "phonepe",
            )}
            onDone={onDone}
          />
        ) : null}
      </Stack>
    </Panel>
  );
}

function RefundRow({
  orderNumber,
  refund: r,
  gateway,
  canComplete,
  onDone,
}: {
  orderNumber: string;
  refund: Order["payments"][number]["refunds"][number];
  /** Paid through PhonePe: it settles from PhonePe's answer (Phase 18). */
  gateway: boolean;
  canComplete: boolean;
  onDone: (message: string) => void;
}) {
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function complete(outcome: "REFUNDED" | "FAILED") {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${orderNumber}/refunds/${r.id}/complete`, {
        outcome,
        ...(reference.trim() ? { reference: reference.trim() } : {}),
      });
      onDone(
        outcome === "REFUNDED"
          ? `Refund of ${inr(r.amountPaise)} marked refunded.`
          : `Refund of ${inr(r.amountPaise)} marked failed.`,
      );
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={ui.fieldset}>
      <Stack gap="3">
        <p>
          Refund {inr(r.amountPaise)} ·{" "}
          {r.status !== "PENDING"
            ? r.status.toLowerCase()
            : gateway
              ? "sent to PhonePe, waiting for its answer"
              : "to pay"}{" "}
          · {r.reason}
          {r.reference ? ` · reference ${r.reference}` : ""}
        </p>
        {r.status === "PENDING" && canComplete && !gateway ? (
          <>
            {error ? <Notice tone="error" title={error.message} /> : null}
            <TextField
              label="Bank or gateway reference"
              optional
              maxLength={100}
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
            <Cluster>
              <Button
                variant="secondary"
                size="small"
                busy={busy}
                onClick={() => complete("REFUNDED")}
              >
                Mark refunded
              </Button>
              <Button
                variant="quiet"
                size="small"
                disabled={busy}
                onClick={() => complete("FAILED")}
              >
                Mark failed
              </Button>
            </Cluster>
          </>
        ) : null}
      </Stack>
    </div>
  );
}

function RecordRefund({
  orderNumber,
  gateway,
  onDone,
}: {
  orderNumber: string;
  gateway: boolean;
  onDone: (message: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = rupeesToPaise(amount);
    const problems: FieldErrors = {};
    if (!parsed.ok) problems.amount = parsed.message;
    else if (parsed.value < 1) problems.amount = "Enter an amount above zero.";
    if (!reason.trim()) problems.reason = "Give the reason for the refund.";
    setFields(problems);
    if (Object.keys(problems).length || !parsed.ok) {
      setError(localError("Check the highlighted fields."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${orderNumber}/refunds`, {
        amountPaise: parsed.value,
        reason: reason.trim(),
      });
      onDone(`Refund of ${inr(parsed.value)} recorded. Pay it, then mark it.`);
    } catch (err) {
      const apiError = toApiError(err);
      const d = apiError.details as
        { reason?: string; refundablePaise?: number } | undefined;
      if (d?.reason === "OVER_REFUND")
        setFields({
          amount: `At most ${inr(d.refundablePaise ?? 0)} can still be refunded.`,
        });
      setError(apiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Record a refund">
      <fieldset className={ui.fieldset}>
        <legend>Record a refund</legend>
        <Stack>
          <p className={ui.muted}>
            {gateway
              ? "The refund is sent to PhonePe within a minute and settles when PhonePe confirms it."
              : "Pay the refund through the bank or the gateway, then mark it refunded here with its reference."}
          </p>
          <ErrorSummary
            error={error}
            fields={fields}
            idPrefix="refund-"
            labels={{ amount: "Amount", reason: "Reason" }}
          />
          <TextField
            id="refund-amount"
            label="Amount in rupees"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={fields.amount}
          />
          <TextField
            id="refund-reason"
            label="Reason"
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            error={fields.reason}
          />
          <div>
            <Button
              type="submit"
              variant="secondary"
              busy={busy}
              busyLabel="Recording…"
            >
              Record refund
            </Button>
          </div>
        </Stack>
      </fieldset>
    </form>
  );
}

function Restock({
  order: o,
  onDone,
}: {
  order: Order;
  onDone: (message: string) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const lines = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([itemId, quantity]) => ({ itemId, quantity }));
    if (lines.length === 0) {
      setError(localError("Choose how many units go back on the shelf."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/admin/orders/${o.orderNumber}/restock`, { lines });
      const n = lines.reduce((t, l) => t + l.quantity, 0);
      onDone(`${n} ${n === 1 ? "unit" : "units"} back in stock.`);
    } catch (err) {
      setError(toApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Restock after inspection">
      <form onSubmit={submit} noValidate aria-label="Restock returned units">
        <Stack>
          <p className={ui.muted}>
            Put back only units that passed inspection. Each restock is a stock
            movement.
          </p>
          {error ? <Notice tone="error" title={error.message} /> : null}
          {o.items.map((i) => {
            const left = i.quantity - i.restocked;
            return (
              <SelectField
                key={i.id}
                label={`${i.sku}, ${i.variantLabel}`}
                hint={`${left} of ${i.quantity} not restocked yet`}
                value={String(counts[i.id] ?? 0)}
                disabled={left === 0}
                onChange={(e) =>
                  setCounts({ ...counts, [i.id]: Number(e.target.value) })
                }
              >
                {Array.from({ length: left + 1 }, (_, n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </SelectField>
            );
          })}
          <div>
            <Button
              type="submit"
              variant="secondary"
              busy={busy}
              busyLabel="Restocking…"
            >
              Restock
            </Button>
          </div>
        </Stack>
      </form>
    </Panel>
  );
}
