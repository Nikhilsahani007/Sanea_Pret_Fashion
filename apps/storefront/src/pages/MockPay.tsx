// The stand-in for a payment gateway's hosted page, in development and tests
// only (D-107): the API mounts its endpoint only with the mock provider,
// which production refuses. No card details are asked for and no money moves.
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";

import { send } from "../lib/api.ts";
import { orderToken } from "../lib/orders.ts";
import { useTitle } from "../lib/title.ts";
import page from "./pages.module.css";
import s from "./Checkout.module.css";

export function MockPay() {
  useTitle("Test payment");
  const { paymentId = "" } = useParams();
  const [params] = useSearchParams();
  const orderNumber = params.get("order") ?? "";
  const token = orderToken(orderNumber);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function pay(outcome: "success" | "failure" | "timeout") {
    setBusy(true);
    try {
      await send(
        "POST",
        `/checkout/mock/${paymentId}`,
        { outcome },
        { "X-Order-Token": token ?? "" },
      );
      // The browser return is only a hint; the order page asks the server.
      navigate(`/order/${orderNumber}`);
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div className={page.page}>
      <h1 className={page.title}>Test payment</h1>
      <div className={s.form}>
        <p className={s.notice}>
          This is a test payment page for development. No card details are asked
          for and no money moves. Live online payment is not set up yet.
        </p>
        <p>Order {orderNumber}</p>
        {!token ? (
          <p className={s.alert} role="alert">
            Open this page from the tab you placed the order in.
          </p>
        ) : (
          <div className={s.options}>
            <button
              type="button"
              className={s.button}
              disabled={busy}
              onClick={() => pay("success")}
            >
              Pay (test success)
            </button>
            <button
              type="button"
              className={s.secondary}
              disabled={busy}
              onClick={() => pay("failure")}
            >
              Decline (test failure)
            </button>
            <button
              type="button"
              className={s.secondary}
              disabled={busy}
              onClick={() => pay("timeout")}
            >
              Leave without paying
            </button>
          </div>
        )}
        {failed ? (
          <p className={s.alert} role="alert">
            The test payment could not be sent. Go back and try again.
          </p>
        ) : null}
      </div>
    </div>
  );
}
