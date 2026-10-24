// The bag: a modal <dialog> sheet. The browser traps focus and closes it on
// Escape; focus returns to the bag button (design-system.md §6).
import { useEffect, useRef } from "react";
import { Link } from "react-router";

import { useCart } from "../lib/hooks.ts";
import { CartLines, CartSummary, cartStyles } from "./CartLines.tsx";
import s from "./Drawer.module.css";
import { CloseIcon } from "./Icons.tsx";

export function CartDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cart = useCart();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const c = cart.data;
  return (
    <dialog
      ref={ref}
      className={s.drawer}
      aria-labelledby="bag-title"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className={s.head}>
        <h2 id="bag-title">
          Bag{c && c.itemCount > 0 ? ` (${c.itemCount})` : ""}
        </h2>
        <button
          type="button"
          className={s.close}
          onClick={onClose}
          aria-label="Close bag"
        >
          <CloseIcon />
        </button>
      </div>
      <div className={s.body}>
        {cart.isPending ? <p role="status">Loading your bag…</p> : null}
        {c && c.lines.length === 0 ? <p>Your bag is empty.</p> : null}
        {c && c.lines.length > 0 ? (
          <CartLines cart={c} onNavigate={onClose} />
        ) : null}
      </div>
      {c && c.lines.length > 0 ? (
        <div className={s.foot}>
          <CartSummary cart={c} />
          <Link to="/cart" className={cartStyles.button} onClick={onClose}>
            View bag and check out
          </Link>
        </div>
      ) : null}
    </dialog>
  );
}
