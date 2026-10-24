import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { get, send } from "./api.ts";
import type { Cart, Home, Link, Settings } from "./types.ts";

export const useHome = () =>
  useQuery({
    queryKey: ["home"],
    queryFn: () => get<Home>("/content/home"),
    staleTime: 60_000,
  });
export const useMenus = () =>
  useQuery({
    queryKey: ["menus"],
    queryFn: () =>
      get<{ menus: Record<string, Link[]> }>("/content/navigation"),
    staleTime: 60_000,
  });
export const useSettings = () =>
  useQuery({
    queryKey: ["settings"],
    queryFn: () => get<Settings>("/content/settings/public"),
    staleTime: 60_000,
  });
export const useCart = () =>
  useQuery({
    queryKey: ["cart"],
    queryFn: () => get<{ cart: Cart }>("/cart").then((r) => r.cart),
  });

/** Cart changes: the server answers with the whole re-priced cart. */
export function useCartActions() {
  const qc = useQueryClient();
  const done = (cart: Cart) => qc.setQueryData(["cart"], cart);
  return {
    add: useMutation({
      mutationFn: (v: { variantId: string; quantity: number }) =>
        send<{ cart: Cart }>("POST", "/cart/items", v).then((r) => r.cart),
      onSuccess: done,
    }),
    set: useMutation({
      mutationFn: (v: { variantId: string; quantity: number }) =>
        send<{ cart: Cart }>("PATCH", `/cart/items/${v.variantId}`, {
          quantity: v.quantity,
        }).then((r) => r.cart),
      onSuccess: done,
    }),
    remove: useMutation({
      mutationFn: (variantId: string) =>
        send<{ cart: Cart }>("DELETE", `/cart/items/${variantId}`).then(
          (r) => r.cart,
        ),
      onSuccess: done,
    }),
  };
}
