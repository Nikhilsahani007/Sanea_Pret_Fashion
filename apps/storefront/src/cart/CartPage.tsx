// /cart: the drawer's content as a full page (phase-11-plan.md §4.3).
import { useEffect } from "react";

import { CartLines } from "./CartLines.tsx";
import s from "./cart.module.css";

export function CartPage() {
  useEffect(() => {
    document.title = "Your bag · Sanéa Pret";
  }, []);
  return (
    <section aria-labelledby="cart-title" className={s.page}>
      <h1 id="cart-title">Your bag</h1>
      <CartLines />
    </section>
  );
}
