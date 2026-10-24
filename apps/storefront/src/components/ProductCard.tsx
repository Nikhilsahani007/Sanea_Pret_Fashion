import { Link } from "react-router";

import { inr } from "../lib/money.ts";
import type { ProductSummary } from "../lib/types.ts";
import s from "./ProductCard.module.css";

const LABELS: Record<string, string> = { NEW: "New", LIMITED: "Limited" };

/** 4:5 card; a second image on hover only where one exists (design-system.md §6). */
export function ProductCard({
  product,
  sizes = "(max-width: 40rem) 50vw, 25vw",
  eager = false,
  onAdd,
}: {
  product: ProductSummary;
  sizes?: string;
  eager?: boolean;
  /** Opens the size sheet; nothing is added without a chosen size. */
  onAdd?: (p: ProductSummary) => void;
}) {
  const label =
    product.availability === "SOLD_OUT"
      ? "Sold out"
      : (product.labels.map((l) => LABELS[l]).find(Boolean) ?? null);
  const discounted = product.compareAtPricePaise !== null;
  return (
    <article className={s.card}>
      <div className={s.media}>
        {product.image ? (
          <picture>
            <source
              type="image/avif"
              srcSet={product.image.avifSrcset}
              sizes={sizes}
            />
            <img
              src={product.image.url}
              srcSet={product.image.webpSrcset}
              sizes={sizes}
              alt={product.image.alt}
              width={product.image.width}
              height={product.image.height}
              loading={eager ? "eager" : "lazy"}
              decoding="async"
            />
          </picture>
        ) : (
          <div className={s.placeholder}>Photograph to come</div>
        )}
        {product.hoverImage ? (
          <picture className={s.hover} aria-hidden="true">
            <source
              type="image/avif"
              srcSet={product.hoverImage.avifSrcset}
              sizes={sizes}
            />
            <img
              src={product.hoverImage.url}
              srcSet={product.hoverImage.webpSrcset}
              sizes={sizes}
              alt=""
              loading="lazy"
              decoding="async"
              width={product.hoverImage.width}
              height={product.hoverImage.height}
            />
          </picture>
        ) : null}
        {label ? <span className={s.label}>{label}</span> : null}
      </div>
      <h3 style={{ fontSize: "inherit", letterSpacing: 0, lineHeight: 1.3 }}>
        <Link className={s.name} to={`/products/${product.slug}`}>
          {product.name}
        </Link>
      </h3>
      <div className={s.foot}>
        <p className={s.price}>
          {product.priceVaries ? "From " : ""}
          {inr(product.fromPricePaise)}
          {discounted ? (
            <span className={s.was}>
              <span className="visually-hidden">was </span>
              {inr(product.compareAtPricePaise!)}
            </span>
          ) : null}
        </p>
        {onAdd && product.availability !== "SOLD_OUT" ? (
          <button
            type="button"
            className={s.add}
            onClick={() => onAdd(product)}
            aria-label={`Add ${product.name}: choose a size`}
            aria-haspopup="dialog"
          >
            Add
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function ProductGrid({ products }: { products: ProductSummary[] }) {
  return (
    <ul className={s.grid}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} eager={i < 4} />
        </li>
      ))}
    </ul>
  );
}
