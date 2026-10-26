// The guest's order page (/orders/:orderNumber). It shows what the server
// says: a prepaid order is confirmed only once the verified payment arrives,
// so the page polls while it waits (system-design.md §4.4). It needs the
// order's access token, kept in this tab's session storage.
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { api, toApiError, type ApiError } from "../api/client.ts";
import type { OrderView } from "../api/types.ts";
import { rupees } from "../lib/format.ts";
import { orderToken } from "./orders.ts";
import s from "./checkout.module.css";

const POLL_MS = 2_000;
const POLL_FOR_MS = 60_000;

export function OrderStatus() {
  const { orderNumber = "" } = useParams();
  const token = orderToken(orderNumber);
  const navigate = useNavigate();
  const started = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const [view, setView] = useState<OrderView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);

  useEffect(() => {
    document.title = `Order ${orderNumber} · Sanéa Pret`;
  }, [orderNumber]);

  const load = useCallback(async () => {
    try {
      setView(
        await api.get<OrderView>(
          `/checkout/orders/${orderNumber}/status`,
          undefined,
          { "X-Order-Token": token ?? "" },
        ),
      );
      setError(null);
    } catch (e) {
      setError(toApiError(e));
    }
  }, [orderNumber, token]);

  useEffect(() => {
    if (token) void load();
  }, [load, token]);

  const status = view?.order.status;
  const waitingForPayment =
    status === "PENDING_PAYMENT" && view?.payment?.status === "CREATED";

  // Poll while a payment is open, for a minute.
  useEffect(() => {
    if (!waitingForPayment || Date.now() - started.current >= POLL_FOR_MS)
      return;
    const timer = setTimeout(() => void load(), POLL_MS);
    return () => clearTimeout(timer);
  }, [view, waitingForPayment, load]);

  // Move focus to the outcome once it is known, for screen readers.
  useEffect(() => {
    if (status) heading.current?.focus();
  }, [status]);

  async function retry() {
    setRetrying(true);
    setRetryError(false);
    try {
      const res = await api.post<OrderView>(
        `/checkout/orders/${orderNumber}/payment`,
        {},
        {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Order-Token": token ?? "",
        },
      );
      const pay = res.payment?.clientPayload?.payPath;
      if (pay) navigate(`${pay}?order=${encodeURIComponent(orderNumber)}`);
      else await load();
    } catch {
      setRetrying(false);
      setRetryError(true);
      await load();
    }
  }

  if (!token)
    return (
      <section className={s.page} aria-labelledby="order-title">
        <h1 id="order-title">Order {orderNumber}</h1>
        <p>
          Open this page from the tab you placed the order in. Keep your order
          number; we can look the order up for you.
        </p>
      </section>
    );
  if (error && !view)
    return (
      <section className={s.page} aria-labelledby="order-title">
        <h1 id="order-title">Order {orderNumber}</h1>
        <p role="alert">
          {error.status === 404
            ? "We could not find this order."
            : "We could not load this order. Refresh to try again."}
        </p>
      </section>
    );
  if (!view)
    return (
      <div className={s.page} aria-busy="true">
        <span className="visually-hidden">Loading</span>
      </div>
    );

  const { order, payment } = view;
  const paymentFailed =
    order.status === "PENDING_PAYMENT" &&
    (payment?.status === "FAILED" || payment?.status === "EXPIRED");

  const outcome: Record<string, { title: string; text: string }> = {
    CONFIRMED: {
      title: "Thank you. Your order is confirmed.",
      text: "Keep your order number for any questions about the order.",
    },
    PENDING_CONFIRMATION: {
      title: "Thank you. Your order is placed.",
      text: "You pay in cash on delivery. We confirm the order with you before it is packed.",
    },
    CANCELLED: {
      title: "This order was cancelled.",
      text: "Nothing was charged for it, or any payment will be refunded.",
    },
  };
  const shown = waitingForPayment
    ? {
        title: "Waiting for your payment.",
        text: "This page updates when the payment goes through.",
      }
    : paymentFailed
      ? {
          title: "Your payment did not go through.",
          text: order.payBy
            ? `Your pieces are held until ${new Date(order.payBy).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Try again.`
            : "Try again.",
        }
      : (outcome[order.status] ?? {
          title: `Order status: ${order.status.toLowerCase().replaceAll("_", " ")}`,
          text: "",
        });

  return (
    <section className={s.page} aria-labelledby="order-title">
      <h1 id="order-title">Order {order.orderNumber}</h1>
      <div className={s.layout}>
        <div className={s.form}>
          <div role="status" aria-live="polite" className={s.section}>
            <h2 ref={heading} tabIndex={-1} className={s.outcome}>
              {shown.title}
            </h2>
            {shown.text ? <p>{shown.text}</p> : null}
          </div>
          {paymentFailed && order.payBy ? (
            <div>
              <button
                type="button"
                className={s.button}
                disabled={retrying}
                onClick={() => void retry()}
              >
                {retrying
                  ? "Opening the payment page…"
                  : "Try the payment again"}
              </button>
              {retryError ? (
                <p className={s.error} role="alert">
                  The payment could not be restarted. The hold may have ended.
                </p>
              ) : null}
            </div>
          ) : null}
          {waitingForPayment && Date.now() - started.current >= POLL_FOR_MS ? (
            <button
              type="button"
              className={s.secondary}
              onClick={() => void load()}
            >
              Check again
            </button>
          ) : null}
          <p>
            Delivering to {order.shipTo.fullName}, {order.shipTo.city}{" "}
            {order.shipTo.pinCode}.
          </p>
          <p>
            <Link to="/shop">Continue shopping</Link>
          </p>
        </div>
        <aside className={s.summary} aria-label="Order summary">
          <h2>Your order</h2>
          <ul className={s.items}>
            {order.items.map((i) => (
              <li key={`${i.productName}-${i.variantLabel}`} className={s.item}>
                <span>
                  {i.productName}
                  <br />
                  <span className={s.muted}>
                    {i.variantLabel} · {i.quantity} × {rupees(i.unitPricePaise)}
                  </span>
                </span>
                <span className="tabular">{rupees(i.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <p className={s.row}>
            <span>Subtotal</span>
            <span className="tabular">{rupees(order.subtotalPaise)}</span>
          </p>
          <p className={s.row}>
            <span>Delivery</span>
            <span className="tabular">
              {order.shippingPaise === 0 ? "Free" : rupees(order.shippingPaise)}
            </span>
          </p>
          {order.codFeePaise > 0 ? (
            <p className={s.row}>
              <span>Cash on delivery fee</span>
              <span className="tabular">{rupees(order.codFeePaise)}</span>
            </p>
          ) : null}
          <p className={s.total}>
            <span>Total</span>
            <span className="tabular">{rupees(order.totalPaise)}</span>
          </p>
          <p className={s.muted}>
            {order.paymentMethod === "COD"
              ? "Cash on delivery"
              : order.status === "PENDING_PAYMENT"
                ? "Pay online"
                : "Paid online"}
            {" · "}Prices include GST.
          </p>
        </aside>
      </div>
    </section>
  );
}
