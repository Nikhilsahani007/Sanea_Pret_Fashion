// The guest's order page. It shows what the server says: a prepaid order is
// confirmed only once the verified payment arrives, so the page polls while
// it waits (system-design.md §4.4).
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { ApiError, get, send } from "../lib/api.ts";
import { inr } from "../lib/money.ts";
import { orderToken } from "../lib/orders.ts";
import { useTitle } from "../lib/title.ts";
import type { OrderView } from "../lib/types.ts";
import page from "./pages.module.css";
import s from "./Checkout.module.css";

const POLL_MS = 2_000;
const POLL_FOR_MS = 60_000;

export function OrderStatus() {
  const { orderNumber = "" } = useParams();
  useTitle(`Order ${orderNumber}`);
  const token = orderToken(orderNumber);
  const navigate = useNavigate();
  const started = useRef(Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);

  const view = useQuery({
    queryKey: ["order", orderNumber],
    queryFn: () =>
      get<OrderView>(`/checkout/orders/${orderNumber}/status`, undefined, {
        "X-Order-Token": token ?? "",
      }),
    enabled: Boolean(token),
    retry: false,
    refetchInterval: (q) => {
      const d = q.state.data;
      const waiting =
        d?.order.status === "PENDING_PAYMENT" &&
        d.payment?.status === "CREATED" &&
        Date.now() - started.current < POLL_FOR_MS;
      return waiting ? POLL_MS : false;
    },
  });
  const status = view.data?.order.status;

  // Move focus to the outcome once it is known, for screen readers.
  useEffect(() => {
    if (status) heading.current?.focus();
  }, [status]);

  async function retry() {
    setRetrying(true);
    setRetryError(false);
    try {
      const res = await send<OrderView>(
        "POST",
        `/checkout/orders/${orderNumber}/payment`,
        {},
        {
          "Idempotency-Key": crypto.randomUUID(),
          "X-Order-Token": token ?? "",
        },
      );
      const pay = res.payment?.clientPayload?.payPath;
      if (pay) navigate(`${pay}?order=${encodeURIComponent(orderNumber)}`);
      else await view.refetch();
    } catch {
      setRetrying(false);
      setRetryError(true);
      await view.refetch();
    }
  }

  if (!token)
    return (
      <div className={page.page}>
        <h1 className={page.title}>Order {orderNumber}</h1>
        <p>
          Open this page from the tab you placed the order in. Your confirmation
          email has the order details.
        </p>
      </div>
    );
  if (view.isPending)
    return (
      <div className={page.page}>
        <p role="status">Checking your order…</p>
      </div>
    );
  if (view.isError || !view.data)
    return (
      <div className={page.page}>
        <h1 className={page.title}>Order {orderNumber}</h1>
        <p role="alert">
          {view.error instanceof ApiError && view.error.status === 404
            ? "We could not find this order."
            : "We could not load this order. Refresh to try again."}
        </p>
      </div>
    );

  const { order, payment } = view.data;
  const waitingForPayment =
    order.status === "PENDING_PAYMENT" && payment?.status === "CREATED";
  const paymentFailed =
    order.status === "PENDING_PAYMENT" &&
    (payment?.status === "FAILED" || payment?.status === "EXPIRED");

  const outcome: Record<string, { title: string; text: string }> = {
    CONFIRMED: {
      title: "Thank you. Your order is confirmed.",
      text: `We have sent the details to ${order.email}.`,
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
            ? `Your pieces are held until ${new Date(order.payBy).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Try again, or choose another way to pay.`
            : "Try again.",
        }
      : (outcome[order.status] ?? {
          title: `Order status: ${order.status.toLowerCase().replaceAll("_", " ")}`,
          text: "",
        });

  return (
    <div className={page.page}>
      <h1 className={page.title}>Order {order.orderNumber}</h1>
      <div className={s.layout}>
        <div className={s.form}>
          <div role="status" aria-live="polite" className={s.section}>
            <h2 ref={heading} tabIndex={-1} className={page.lead}>
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
                onClick={retry}
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
              onClick={() => view.refetch()}
            >
              Check again
            </button>
          ) : null}
          <p>
            Delivering to {order.shipTo.fullName}, {order.shipTo.city}{" "}
            {order.shipTo.pinCode}.
          </p>
          <p>
            <Link to="/">Continue shopping</Link>
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
                    {i.variantLabel} · {i.quantity} × {inr(i.unitPricePaise)}
                  </span>
                </span>
                <span>{inr(i.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          <p className={s.row}>
            <span>Subtotal</span>
            <span>{inr(order.subtotalPaise)}</span>
          </p>
          <p className={s.row}>
            <span>Delivery</span>
            <span>
              {order.shippingPaise === 0 ? "Free" : inr(order.shippingPaise)}
            </span>
          </p>
          {order.codFeePaise > 0 ? (
            <p className={s.row}>
              <span>Cash on delivery fee</span>
              <span>{inr(order.codFeePaise)}</span>
            </p>
          ) : null}
          <p className={s.total}>
            <span>Total</span>
            <span>{inr(order.totalPaise)}</span>
          </p>
          <p className={s.muted}>
            {order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}
            {" · "}Prices include GST.
          </p>
        </aside>
      </div>
    </div>
  );
}
