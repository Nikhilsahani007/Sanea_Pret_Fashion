// The size sheet opened by "Add" on a product card: choose colour and size,
// then add. A modal <dialog>; Escape closes and focus returns to the card.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import { ApiError, get } from "../lib/api.ts";
import { useCartActions } from "../lib/hooks.ts";
import { inr } from "../lib/money.ts";
import {
  defaultColour,
  variantFor,
  type ProductDetail,
} from "../lib/product.ts";
import type { ProductSummary } from "../lib/types.ts";
import { cartStyles } from "./CartLines.tsx";
import s from "./Drawer.module.css";
import { CloseIcon } from "./Icons.tsx";
import { openBag } from "./Layout.tsx";
import { ColourPicker, SizeButtons } from "./SizePicker.tsx";

export function QuickAdd({
  product,
  onClose,
}: {
  product: ProductSummary | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const detail = useQuery({
    queryKey: ["product", product?.slug],
    queryFn: () =>
      get<{ product: ProductDetail }>(
        `/catalogue/products/${product!.slug}`,
      ).then((r) => r.product),
    enabled: Boolean(product),
  });
  const [colourId, setColourId] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<string | null>(null);
  const { add } = useCartActions();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (product && !d.open) {
      opener.current = document.activeElement;
      setSizeId(null);
      setColourId(null);
      add.reset();
      d.showModal();
    }
    if (!product && d.open) d.close();
  }, [product]); // open and close only when the product changes

  const p = detail.data;
  const colour = colourId ?? (p ? defaultColour(p) : null);
  const variant = p && sizeId ? variantFor(p, colour, sizeId) : undefined;
  const close = () => {
    onClose();
    (opener.current as HTMLElement | null)?.focus();
  };

  return (
    <dialog
      ref={ref}
      className={s.drawer}
      aria-labelledby="quick-add-title"
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
    >
      <div className={s.head}>
        <h2 id="quick-add-title">{product?.name}</h2>
        <button
          type="button"
          className={s.close}
          onClick={close}
          aria-label="Close size choice"
        >
          <CloseIcon />
        </button>
      </div>
      <div
        className={s.body}
        style={{
          display: "grid",
          gap: "var(--sp-space-5)",
          alignContent: "start",
        }}
      >
        {detail.isPending ? <p role="status">Loading sizes…</p> : null}
        {detail.isError ? (
          <p role="alert">
            This piece could not be loaded. Try again in a moment.
          </p>
        ) : null}
        {p ? (
          <>
            <p style={{ fontVariantNumeric: "tabular-nums" }}>
              {inr(variant?.pricePaise ?? p.fromPricePaise)}
            </p>
            <ColourPicker
              product={p}
              colourId={colour}
              onChange={(id) => {
                setColourId(id);
                setSizeId(null);
              }}
            />
            <SizeButtons
              product={p}
              colourId={colour}
              sizeId={sizeId}
              onChange={setSizeId}
            />
            <Link to={`/products/${p.slug}`} onClick={close}>
              See full details
            </Link>
          </>
        ) : null}
      </div>
      <div className={s.foot}>
        {add.error ? (
          <p className={cartStyles.warning} role="alert">
            {add.error instanceof ApiError && add.error.code === "OUT_OF_STOCK"
              ? "That size has just sold out."
              : "It could not be added. Try again."}
          </p>
        ) : null}
        <button
          type="button"
          className={cartStyles.button}
          disabled={!variant || add.isPending}
          aria-disabled={!variant}
          onClick={() =>
            variant &&
            add.mutate(
              { variantId: variant.id, quantity: 1 },
              {
                onSuccess: () => {
                  onClose();
                  openBag();
                },
              },
            )
          }
        >
          {variant ? "Add to bag" : "Choose a size"}
        </button>
      </div>
    </dialog>
  );
}
