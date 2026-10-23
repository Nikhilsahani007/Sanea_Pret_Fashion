// The cart drawer (phase-11-plan.md §4.6): a right-hand sheet on desktop,
// full height on a phone. Opened by the header's bag button and after an add.
import { Link } from "react-router";

import { Sheet } from "../ui/Sheet.tsx";
import { CartLines } from "./CartLines.tsx";
import { useCart } from "./CartProvider.tsx";
import s from "./cart.module.css";

export function CartDrawer() {
  const { drawerOpen, closeDrawer } = useCart();
  return (
    <Sheet open={drawerOpen} onClose={closeDrawer} title="Your bag">
      <CartLines onNavigate={closeDrawer} />
      <p className={s.pageLink}>
        <Link to="/cart" onClick={closeDrawer}>
          View your bag as a page
        </Link>
      </p>
    </Sheet>
  );
}
