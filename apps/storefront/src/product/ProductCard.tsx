// A product card (design-system.md §6; redesigned, phase-12-plan.md §12): the
// 4:5 picture leads, square corners; the name and price sit quietly beside
// each other under it. The name is a level-2 heading by default; inside a
// titled section (a landing row) it is level 3. "Add" opens the size sheet;
// it never adds a default size. A product without photographs keeps an
// empty well: no stock photography stands in (D-120).
import { useRef, useState } from "react";
import { Link } from "react-router";

import type { ProductSummary } from "../api/types.ts";
import { useCart } from "../cart/CartProvider.tsx";
import { rupees } from "../lib/format.ts";
import { Picture } from "../ui/Picture.tsx";
import { SizeSheet } from "./SizeSheet.tsx";
import s from "./product.module.css";

export function ProductCard({
  product,
  headingLevel = 2,
}: {
  product: ProductSummary;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const [open, setOpen] = useState(false);
  const added = useRef(false);
  const { openDrawer } = useCart();
  return (
    <article className={s.card} aria-labelledby={`p-${product.id}`}>
      <Link
        to={`/products/${product.slug}`}
        className={s.well}
        tabIndex={-1}
        aria-hidden="true"
      >
        {product.primaryImage ? (
          <Picture
            image={product.primaryImage}
            sizes="(min-width: 64rem) 28vw, (min-width: 48rem) 40vw, 62vw"
          />
        ) : null}
        {product.labels.includes("NEW") ? (
          <span className={s.label}>New</span>
        ) : product.soldOut ? (
          <span className={s.label}>Sold out</span>
        ) : null}
      </Link>
      <div className={s.meta}>
        <Heading id={`p-${product.id}`} className={s.cardName}>
          <Link to={`/products/${product.slug}`}>{product.name}</Link>
        </Heading>
        <p className={`${s.cardPrice} tabular`}>
          {/* The lowest price among the variants on sale. */}
          <span className={s.from}>From </span>
          {rupees(product.fromPricePaise)}
        </p>
      </div>
      <button
        type="button"
        className={s.add}
        disabled={product.soldOut}
        onClick={() => setOpen(true)}
        aria-label={
          product.soldOut
            ? `Sold out: ${product.name}`
            : `Add ${product.name} to bag`
        }
      >
        {product.soldOut ? "Sold out" : "Add"}
      </button>
      <SizeSheet
        slug={product.slug}
        name={product.name}
        open={open}
        onAdded={() => {
          added.current = true;
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
          // Opened only once the sheet has closed and focus is back on
          // "Add", so closing the bag returns focus there.
          if (added.current) {
            added.current = false;
            openDrawer();
          }
        }}
      />
    </article>
  );
}
