import { Link } from "react-router";

import { ApiError } from "../lib/api.ts";
import { useCartActions } from "../lib/hooks.ts";
import { inr } from "../lib/money.ts";
import type { Cart, CartLine } from "../lib/types.ts";
import s from "./CartLines.module.css";

function warningText(line: CartLine): string | null {
  const w = line.warning;
  if (!w) return null;
  if (w.code === "UNAVAILABLE")
    return "No longer available. Remove it to continue.";
  if (w.code === "SOLD_OUT") return "Sold out. Remove it to continue.";
  return `Only ${w.available} left. Lower the quantity to continue.`;
}

export function CartLines({
  cart,
  onNavigate,
}: {
  cart: Cart;
  onNavigate?: () => void;
}) {
  const { set, remove } = useCartActions();
  const error = set.error ?? remove.error;
  return (
    <>
      {error ? (
        <p className={s.warning} role="alert">
          {error instanceof ApiError && error.code === "OUT_OF_STOCK"
            ? "There is not enough stock for that quantity."
            : "That change did not save. Try again."}
        </p>
      ) : null}
      <ul className={s.list}>
        {cart.lines.map((line) => {
          const warning = warningText(line);
          const busy =
            (set.isPending && set.variables?.variantId === line.variantId) ||
            (remove.isPending && remove.variables === line.variantId);
          return (
            <li key={line.variantId} className={s.line}>
              {line.image ? (
                <picture>
                  <source
                    type="image/avif"
                    srcSet={line.image.avifSrcset}
                    sizes="88px"
                  />
                  <img
                    className={s.thumb}
                    src={line.image.url}
                    srcSet={line.image.webpSrcset}
                    sizes="88px"
                    alt=""
                    width={88}
                    height={110}
                    loading="lazy"
                  />
                </picture>
              ) : (
                <div className={s.thumb} aria-hidden="true" />
              )}
              <div>
                <Link
                  className={s.name}
                  to={`/products/${line.productSlug}`}
                  onClick={onNavigate}
                >
                  {line.productName}
                </Link>
                <p className={s.meta}>
                  {line.colour} · {line.size}
                </p>
                <p className={s.price}>{inr(line.lineTotalPaise)}</p>
                {warning ? <p className={s.warning}>{warning}</p> : null}
                <div className={s.controls}>
                  <div
                    className={s.qty}
                    role="group"
                    aria-label={`Quantity of ${line.productName}, ${line.size}`}
                  >
                    <button
                      type="button"
                      aria-label="One fewer"
                      disabled={busy || line.quantity <= 1}
                      onClick={() =>
                        set.mutate({
                          variantId: line.variantId,
                          quantity: line.quantity - 1,
                        })
                      }
                    >
                      −
                    </button>
                    <output aria-live="polite">{line.quantity}</output>
                    <button
                      type="button"
                      aria-label="One more"
                      disabled={
                        busy || line.quantity >= 10 || line.warning !== null
                      }
                      onClick={() =>
                        set.mutate({
                          variantId: line.variantId,
                          quantity: line.quantity + 1,
                        })
                      }
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    className={s.remove}
                    disabled={busy}
                    onClick={() => remove.mutate(line.variantId)}
                  >
                    Remove
                    <span className="visually-hidden"> {line.productName}</span>
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function CartSummary({ cart }: { cart: Cart }) {
  return (
    <>
      <p className={s.row}>
        <span>Subtotal</span>
        <strong>{inr(cart.subtotalPaise)}</strong>
      </p>
      <p className={s.meta}>
        Prices include GST. Delivery is worked out at checkout.
      </p>
    </>
  );
}

export { s as cartStyles };
