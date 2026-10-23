// The cart's lines, subtotal and notices, shared by the drawer and the /cart
// page (phase-11-plan.md §4.6). Prices and totals are the server's. Notices
// are always words, never colour alone. Checkout opens in Phase 15.
import { CartWarning, type CartLine } from "@sanea/shared";
import { Link } from "react-router";

import { items, rupees } from "../lib/format.ts";
import { Picture } from "../ui/Picture.tsx";
import { useCart } from "./CartProvider.tsx";
import s from "./cart.module.css";

const NOTICES: Record<CartWarning, string> = {
  QUANTITY_LIMIT: "That is the most you can add of this item.",
  EXCEEDS_AVAILABLE:
    "Not enough in stock for this quantity. Lower it to check out.",
  UNAVAILABLE: "No longer available. Remove it to check out.",
};

function Stepper({ line, max }: { line: CartLine; max: number }) {
  const { setQuantity, busy } = useCart();
  const name = `${line.productName}, ${line.colour.name}, size ${line.size}`;
  return (
    <div className={s.stepper} role="group" aria-label={`Quantity of ${name}`}>
      <button
        type="button"
        disabled={busy || line.quantity <= 1}
        onClick={() => void setQuantity(line.variantId, line.quantity - 1)}
        aria-label={`One fewer ${name}`}
      >
        −
      </button>
      <output aria-live="off" className="tabular">
        {line.quantity}
      </output>
      <button
        type="button"
        disabled={busy || line.quantity >= max || !line.available}
        onClick={() => void setQuantity(line.variantId, line.quantity + 1)}
        aria-label={`One more ${name}`}
      >
        +
      </button>
    </div>
  );
}

export function CartLines({
  onNavigate,
  max = 10,
}: {
  onNavigate?: () => void;
  max?: number;
}) {
  const { cart, remove, busy, error, ready } = useCart();
  const notices = new Map<string, CartWarning[]>();
  for (const w of cart.warnings)
    notices.set(w.variantId, [...(notices.get(w.variantId) ?? []), w.code]);

  if (!ready) return <p className={s.muted}>Loading your bag…</p>;
  if (cart.lines.length === 0)
    return (
      <div className={s.empty}>
        <p>Your bag is empty.</p>
        <p>
          <Link to="/search" onClick={onNavigate}>
            Search the shop
          </Link>
        </p>
      </div>
    );

  return (
    <div className={s.cart}>
      {error ? (
        <p role="alert" className={s.error}>
          {error.message}
        </p>
      ) : null}
      <ul className={s.lines}>
        {cart.lines.map((line) => (
          <li key={line.variantId} className={s.line}>
            <div className={s.thumb}>
              {line.image ? <Picture image={line.image} sizes="96px" /> : null}
            </div>
            <div className={s.detail}>
              <p className={s.name}>
                <Link to={`/products/${line.productSlug}`} onClick={onNavigate}>
                  {line.productName}
                </Link>
              </p>
              <p className={s.meta}>
                {line.colour.name} · Size {line.size}
              </p>
              {line.stock?.availability === "LOW_STOCK" ? (
                <p className={s.meta}>Only {line.stock.remaining} left</p>
              ) : null}
              {(notices.get(line.variantId) ?? []).map((code) => (
                <p key={code} className={s.notice}>
                  {NOTICES[code]}
                </p>
              ))}
              <div className={s.controls}>
                <Stepper line={line} max={max} />
                <button
                  type="button"
                  className={s.remove}
                  disabled={busy}
                  onClick={() => void remove(line.variantId)}
                  aria-label={`Remove ${line.productName}, ${line.colour.name}, size ${line.size}`}
                >
                  Remove
                </button>
              </div>
            </div>
            <p className={`${s.price} tabular`}>
              {line.lineTotalPaise === null ? "—" : rupees(line.lineTotalPaise)}
            </p>
          </li>
        ))}
      </ul>
      <div className={s.summary}>
        <p className={s.subtotal}>
          <span>Subtotal ({items(cart.itemCount)})</span>
          <span className="tabular">{rupees(cart.subtotalPaise)}</span>
        </p>
        <p className={s.muted}>
          Prices include GST. Shipping is shown at checkout.
        </p>
        <button type="button" className={s.checkout} disabled>
          Checkout opens soon
        </button>
      </div>
    </div>
  );
}
