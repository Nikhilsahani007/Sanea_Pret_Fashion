// Cart state for the whole storefront (D-099; phase-11-plan.md §4.5, §4.6).
// The server is the only source of prices and totals: every change returns
// the whole cart, which replaces the local copy. Changes are announced in a
// polite live region as complete phrases.
import { EMPTY_CART, type CartView } from "@sanea/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { api, toApiError, type ApiError } from "../api/client.ts";
import { items } from "../lib/format.ts";

type Cart = {
  cart: CartView;
  ready: boolean;
  error: ApiError | null;
  busy: boolean;
  drawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  add: (variantId: string, quantity: number) => Promise<boolean>;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  reload: () => void;
  announcement: string;
};

const CartContext = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartView>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .get<CartView>("/cart", controller.signal)
      .then((c) => {
        setCart(c);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(toApiError(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });
    return () => controller.abort();
  }, [version]);

  const change = useCallback(
    async (fn: () => Promise<CartView>, said: (c: CartView) => string) => {
      setBusy(true);
      setError(null);
      try {
        const next = await fn();
        setCart(next);
        setAnnouncement(said(next));
        return true;
      } catch (e) {
        const err = toApiError(e);
        setError(err);
        setAnnouncement(err.message);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const value = useMemo<Cart>(
    () => ({
      cart,
      ready,
      error,
      busy,
      drawerOpen,
      announcement,
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false),
      reload: () => setVersion((v) => v + 1),
      add: async (variantId, quantity) => {
        const ok = await change(
          () => api.post<CartView>("/cart/items", { variantId, quantity }),
          (c) => `Added to your bag. Bag, ${items(c.itemCount)}.`,
        );
        return ok;
      },
      setQuantity: async (variantId, quantity) => {
        await change(
          () => api.patch<CartView>(`/cart/items/${variantId}`, { quantity }),
          (c) => `Quantity updated. Bag, ${items(c.itemCount)}.`,
        );
      },
      remove: async (variantId) => {
        await change(
          () => api.delete<CartView>(`/cart/items/${variantId}`),
          (c) => `Removed from your bag. Bag, ${items(c.itemCount)}.`,
        );
      },
    }),
    [cart, ready, error, busy, drawerOpen, announcement, change],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): Cart {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart outside CartProvider");
  return value;
}
