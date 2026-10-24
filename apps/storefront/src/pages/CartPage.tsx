import { Link } from "react-router";

import {
  CartLines,
  CartSummary,
  cartStyles,
} from "../components/CartLines.tsx";
import { useCart } from "../lib/hooks.ts";
import { useTitle } from "../lib/title.ts";
import s from "./pages.module.css";

export function CartPage() {
  useTitle("Bag");
  const cart = useCart();
  const c = cart.data;
  return (
    <div className={s.page}>
      <h1 className={s.title}>Bag</h1>
      {cart.isPending ? <p role="status">Loading your bag…</p> : null}
      {c && c.lines.length === 0 ? (
        <p>
          Your bag is empty. <Link to="/">Continue shopping</Link>
        </p>
      ) : null}
      {c && c.lines.length > 0 ? (
        <div className={s.cartLayout}>
          <CartLines cart={c} />
          <aside className={s.summary} aria-label="Order summary">
            <CartSummary cart={c} />
            {/* Checkout arrives in Phase 15. */}
            <span
              className={cartStyles.button}
              aria-disabled="true"
              role="link"
            >
              Checkout opens soon
            </span>
            {!c.readyForCheckout ? (
              <p className={cartStyles.warning}>
                Fix the items marked above before checking out.
              </p>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
