// Checkout (system-design.md §4.1): contact, delivery address, delivery,
// payment, review, on one page. The server prices everything; the page shows
// its quote and sends the total it showed, so a change is caught (PRICE_CHANGED).
import {
  INDIAN_STATE_NAMES,
  placeOrderSchema,
  toFieldErrors,
} from "@sanea/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router";

import { ApiError, send } from "../lib/api.ts";
import { useCart } from "../lib/hooks.ts";
import { inr } from "../lib/money.ts";
import { rememberOrder } from "../lib/orders.ts";
import { useTitle } from "../lib/title.ts";
import type { OrderView, Quote } from "../lib/types.ts";
import page from "./pages.module.css";
import s from "./Checkout.module.css";

type Method = "PREPAID" | "COD";
type Errors = Record<string, string>;

const COD_REASON: Record<string, string> = {
  COD_DISABLED: "Cash on delivery is not offered at the moment.",
  OVER_LIMIT: "Cash on delivery is not offered for an order of this value.",
  PIN_CODE_EXCLUDED: "Cash on delivery is not offered at this PIN code.",
  REFUSAL_LIMIT: "Cash on delivery is not offered for this mobile number.",
};

const ADDRESS_FIELDS = [
  ["fullName", "Full name", "name", true],
  ["line1", "Address", "address-line1", true],
  ["line2", "Flat, floor or building (optional)", "address-line2", true],
  ["landmark", "Landmark (optional)", "off", true],
  ["city", "Town or city", "address-level2", false],
] as const;

export function Checkout() {
  useTitle("Checkout");
  const cart = useCart();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const form = useRef<HTMLFormElement>(null);
  const [method, setMethod] = useState<Method | null>(null);
  const [pin, setPin] = useState("");
  const [sameBilling, setSameBilling] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const [attempt, setAttempt] = useState(0);
  const [alert, setAlert] = useState<ReactNode>(null);
  const [placing, setPlacing] = useState(false);
  // One key per distinct order attempt; a resend of the same body reuses it.
  const idem = useRef<{ key: string; body: string } | null>(null);

  const quote = useQuery({
    queryKey: ["quote", /^\d{6}$/.test(pin) ? pin : "", method],
    queryFn: () =>
      send<Quote>("POST", "/checkout/quote", {
        ...(/^\d{6}$/.test(pin) ? { shippingAddress: { pinCode: pin } } : {}),
        ...(method ? { paymentMethod: method } : {}),
      }),
    enabled: Boolean(cart.data && cart.data.lines.length > 0),
    placeholderData: (prev) => prev,
  });
  const q = quote.data;

  // COD disappears for this order: fall back to paying online.
  useEffect(() => {
    if (method === "COD" && q && !q.cod.available) setMethod(null);
  }, [q, method]);

  useEffect(() => {
    if (attempt === 0) return;
    form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [attempt]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAlert(null);
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "");
    const phone = v("contact.phone");
    const address = (prefix: string) => ({
      fullName: v(`${prefix}.fullName`),
      phone: v(`${prefix}.phone`) || phone,
      line1: v(`${prefix}.line1`),
      line2: v(`${prefix}.line2`),
      landmark: v(`${prefix}.landmark`),
      city: v(`${prefix}.city`),
      state: v(`${prefix}.state`),
      pinCode: v(`${prefix}.pinCode`),
    });
    const body = {
      contact: { email: v("contact.email").trim(), phone },
      shippingAddress: address("shippingAddress"),
      ...(sameBilling ? {} : { billingAddress: address("billingAddress") }),
      deliveryMethod: "STANDARD",
      paymentMethod: method ?? "",
      expectedTotalPaise: q?.totalPaise ?? 0,
    };
    const parsed = placeOrderSchema.safeParse(body);
    if (!parsed.success) {
      const map: Errors = {};
      for (const err of toFieldErrors(parsed.error))
        map[err.path] ??= err.message;
      if (map.paymentMethod) map.paymentMethod = "Choose how you will pay.";
      setErrors(map);
      setAttempt((n) => n + 1);
      return;
    }
    setErrors({});
    const json = JSON.stringify(parsed.data);
    if (idem.current?.body !== json)
      idem.current = { key: crypto.randomUUID(), body: json };
    setPlacing(true);
    try {
      const res = await send<OrderView & { accessToken: string }>(
        "POST",
        "/checkout/orders",
        parsed.data,
        { "Idempotency-Key": idem.current.key },
      );
      rememberOrder(res.order.orderNumber, res.accessToken);
      qc.setQueryData(["cart"], undefined);
      await qc.invalidateQueries({ queryKey: ["cart"] });
      const pay = res.payment?.clientPayload?.payPath;
      navigate(
        pay
          ? `${pay}?order=${encodeURIComponent(res.order.orderNumber)}`
          : `/order/${res.order.orderNumber}`,
      );
    } catch (err) {
      setPlacing(false);
      if (!(err instanceof ApiError)) {
        setAlert(
          "We could not reach the shop. Check your connection and try again.",
        );
        return;
      }
      if (err.code === "VALIDATION_FAILED" && Array.isArray(err.details)) {
        const map: Errors = {};
        for (const d of err.details as { path: string; message: string }[])
          map[d.path.replace(/^body\./, "")] ??= d.message;
        setErrors(map);
        setAttempt((n) => n + 1);
      } else if (err.code === "PRICE_CHANGED") {
        await quote.refetch();
        setAlert(
          `The total is now ${inr((err.details as { totalPaise: number }).totalPaise)}. Check it and place the order again.`,
        );
      } else if (err.code === "OUT_OF_STOCK" || err.code === "CART_NOT_READY") {
        await qc.invalidateQueries({ queryKey: ["cart"] });
        setAlert(
          <>
            Some pieces in your bag changed while you were checking out.{" "}
            <Link to="/cart">Review your bag</Link>.
          </>,
        );
      } else if (err.code === "COD_NOT_AVAILABLE") {
        await quote.refetch();
        setMethod(null);
        setAlert(
          "Cash on delivery is not available for this order. Choose to pay online.",
        );
      } else if (err.code === "RATE_LIMITED") {
        setAlert("Too many attempts. Wait a minute and try again.");
      } else setAlert(err.message);
    }
  }

  const describe = (name: string, hint = false) =>
    [hint ? `${name}-hint` : "", errors[name] ? `${name}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined;

  function field(
    name: string,
    label: string,
    input: (p: {
      id: string;
      name: string;
      "aria-invalid": true | undefined;
      "aria-describedby": string | undefined;
    }) => ReactNode,
    opts: { hint?: string; wide?: boolean } = {},
  ) {
    return (
      <div className={`${s.field} ${opts.wide ? s.wide : ""}`} key={name}>
        <label htmlFor={name}>{label}</label>
        {input({
          id: name,
          name,
          "aria-invalid": errors[name] ? true : undefined,
          "aria-describedby": describe(name, Boolean(opts.hint)),
        })}
        {opts.hint ? (
          <span id={`${name}-hint`} className={s.hint}>
            {opts.hint}
          </span>
        ) : null}
        {errors[name] ? (
          <span id={`${name}-error`} className={s.error}>
            {errors[name]}
          </span>
        ) : null}
      </div>
    );
  }

  function addressFields(prefix: string, section: "shipping" | "billing") {
    return (
      <div className={s.grid}>
        {ADDRESS_FIELDS.map(([key, label, auto, wide]) =>
          field(
            `${prefix}.${key}`,
            label,
            (p) => (
              <input
                {...p}
                autoComplete={auto === "off" ? "off" : `${section} ${auto}`}
                maxLength={key === "fullName" || key === "city" ? 100 : 200}
              />
            ),
            { wide },
          ),
        )}
        {field(`${prefix}.state`, "State or union territory", (p) => (
          <select
            {...p}
            autoComplete={`${section} address-level1`}
            defaultValue=""
          >
            <option value="" disabled>
              Choose
            </option>
            {Object.entries(INDIAN_STATE_NAMES).map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
        ))}
        {field(`${prefix}.pinCode`, "PIN code", (p) => (
          <input
            {...p}
            inputMode="numeric"
            autoComplete={`${section} postal-code`}
            maxLength={7}
            onChange={
              section === "shipping"
                ? (e) => setPin(e.currentTarget.value.replace(/\D/g, ""))
                : undefined
            }
          />
        ))}
      </div>
    );
  }

  if (cart.isPending)
    return (
      <div className={page.page}>
        <p role="status">Loading your bag…</p>
      </div>
    );
  const c = cart.data;
  if (!c || c.lines.length === 0)
    return (
      <div className={page.page}>
        <h1 className={page.title}>Checkout</h1>
        <p>
          Your bag is empty. <Link to="/">Continue shopping</Link>
        </p>
      </div>
    );

  const codOk = q?.paymentMethods.COD ?? false;
  const prepaidOk = q?.paymentMethods.PREPAID ?? false;
  const codReason = q && !q.cod.available ? COD_REASON[q.cod.reason] : null;

  return (
    <div className={page.page}>
      <h1 className={page.title}>Checkout</h1>
      {!c.readyForCheckout ? (
        <p className={s.alert} role="alert">
          Some pieces in your bag need attention first.{" "}
          <Link to="/cart">Review your bag</Link>.
        </p>
      ) : null}
      <div className={s.layout}>
        <form ref={form} className={s.form} onSubmit={onSubmit} noValidate>
          <fieldset className={s.section}>
            <legend>
              <span className={s.step}>1</span> Contact
            </legend>
            <div className={s.grid}>
              {field(
                "contact.email",
                "Email",
                (p) => (
                  <input
                    {...p}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                  />
                ),
                { hint: "For your order confirmation." },
              )}
              {field(
                "contact.phone",
                "Mobile number",
                (p) => (
                  <input
                    {...p}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={16}
                  />
                ),
                { hint: "10 digits. The courier may call this number." },
              )}
            </div>
          </fieldset>

          <fieldset className={s.section}>
            <legend>
              <span className={s.step}>2</span> Delivery address
            </legend>
            {addressFields("shippingAddress", "shipping")}
            <label className={s.check}>
              <input
                type="checkbox"
                checked={sameBilling}
                onChange={(e) => setSameBilling(e.currentTarget.checked)}
              />
              Billing address is the same
            </label>
            {!sameBilling ? addressFields("billingAddress", "billing") : null}
          </fieldset>

          <fieldset className={s.section}>
            <legend>
              <span className={s.step}>3</span> Delivery
            </legend>
            <label className={s.option}>
              <input
                type="radio"
                name="delivery"
                value="STANDARD"
                defaultChecked
              />
              <span>
                <span className={s.optionTitle}>Standard delivery</span>
                {q?.deliveryEstimate ? (
                  <span className={s.muted}> · {q.deliveryEstimate}</span>
                ) : null}
              </span>
              <span>
                {q
                  ? q.shippingPaise === 0
                    ? "Free"
                    : inr(q.shippingPaise)
                  : "…"}
              </span>
            </label>
          </fieldset>

          <fieldset
            className={s.section}
            aria-describedby={
              errors.paymentMethod ? "paymentMethod-error" : undefined
            }
          >
            <legend>
              <span className={s.step}>4</span> Payment
            </legend>
            <div className={s.options}>
              <label className={s.option}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="PREPAID"
                  checked={method === "PREPAID"}
                  disabled={!prepaidOk}
                  aria-invalid={errors.paymentMethod ? true : undefined}
                  onChange={() => setMethod("PREPAID")}
                />
                <span>
                  <span className={s.optionTitle}>Pay online</span>
                  <br />
                  <span className={s.muted}>
                    {prepaidOk
                      ? "On the payment page that opens next."
                      : "Online payment is not available yet."}
                  </span>
                </span>
                <span />
              </label>
              <label className={s.option}>
                <input
                  type="radio"
                  name="paymentMethod"
                  value="COD"
                  checked={method === "COD"}
                  disabled={!codOk}
                  aria-invalid={errors.paymentMethod ? true : undefined}
                  onChange={() => setMethod("COD")}
                />
                <span>
                  <span className={s.optionTitle}>Cash on delivery</span>
                  <br />
                  <span className={s.muted}>
                    {codReason ??
                      "We confirm the order with you before it is packed."}
                  </span>
                </span>
                <span>
                  {q && q.cod.available && method === "COD" && q.codFeePaise > 0
                    ? `+ ${inr(q.codFeePaise)}`
                    : ""}
                </span>
              </label>
            </div>
            {errors.paymentMethod ? (
              <span id="paymentMethod-error" className={s.error}>
                {errors.paymentMethod}
              </span>
            ) : null}
          </fieldset>

          <fieldset className={s.section}>
            <legend>
              <span className={s.step}>5</span> Review and place the order
            </legend>
            <div aria-live="polite">
              {alert ? (
                <p className={s.alert} role="alert">
                  {alert}
                </p>
              ) : null}
            </div>
            <button
              type="submit"
              className={s.button}
              disabled={placing || !q || !c.readyForCheckout}
            >
              {placing
                ? "Placing your order…"
                : q
                  ? `Place order · ${inr(q.totalPaise)}`
                  : "Place order"}
            </button>
            <p className={s.muted}>
              By placing the order you agree to the{" "}
              <Link to="/policies/terms">terms</Link> and the{" "}
              <Link to="/policies/returns">returns policy</Link>.
            </p>
          </fieldset>
        </form>

        <aside className={s.summary} aria-label="Order summary">
          <h2>Your order</h2>
          <ul className={s.items}>
            {c.lines.map((l) => (
              <li key={l.variantId} className={s.item}>
                <span>
                  {l.productName}
                  <br />
                  <span className={s.muted}>
                    {l.colour} / {l.size} · {l.quantity} ×{" "}
                    {inr(l.unitPricePaise)}
                  </span>
                </span>
                <span>{inr(l.lineTotalPaise)}</span>
              </li>
            ))}
          </ul>
          {q ? (
            <div aria-live="polite">
              <p className={s.row}>
                <span>Subtotal</span>
                <span>{inr(q.subtotalPaise)}</span>
              </p>
              <p className={s.row}>
                <span>Delivery</span>
                <span>
                  {q.shippingPaise === 0 ? "Free" : inr(q.shippingPaise)}
                </span>
              </p>
              {q.codFeePaise > 0 ? (
                <p className={s.row}>
                  <span>Cash on delivery fee</span>
                  <span>{inr(q.codFeePaise)}</span>
                </p>
              ) : null}
              <p className={s.total}>
                <span>Total</span>
                <span>{inr(q.totalPaise)}</span>
              </p>
              <p className={s.muted}>
                Prices include GST
                {q.taxPaise > 0 ? ` (${inr(q.taxPaise)})` : ""}.
              </p>
            </div>
          ) : (
            <p role="status">Working out the total…</p>
          )}
        </aside>
      </div>
    </div>
  );
}
