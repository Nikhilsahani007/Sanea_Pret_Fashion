// Colour swatches with visible names and size buttons (design-system.md §6):
// sold-out sizes stay visible, struck through and disabled, with "sold out"
// in their accessible name.
import { stockText, variantFor, type ProductDetail } from "../lib/product.ts";
import s from "./SizePicker.module.css";

export function ColourPicker({
  product,
  colourId,
  onChange,
}: {
  product: ProductDetail;
  colourId: string | null;
  onChange: (id: string) => void;
}) {
  if (product.colours.length < 2) return null;
  const current = product.colours.find((c) => c.id === colourId);
  return (
    <fieldset className={s.group}>
      <legend className={s.legend}>Colour: {current?.name}</legend>
      <div className={s.options}>
        {product.colours.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`${s.option} ${s.swatch}`}
            aria-pressed={c.id === colourId}
            onClick={() => onChange(c.id)}
          >
            <span
              className={s.chip}
              style={{ background: c.swatchHex }}
              aria-hidden="true"
            />
            {c.name}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SizeButtons({
  product,
  colourId,
  sizeId,
  onChange,
}: {
  product: ProductDetail;
  colourId: string | null;
  sizeId: string | null;
  onChange: (id: string) => void;
}) {
  const chosen = sizeId ? variantFor(product, colourId, sizeId) : undefined;
  return (
    <fieldset className={s.group}>
      <legend className={s.legend}>Size</legend>
      <div className={s.options}>
        {product.sizes.map((size) => {
          const v = variantFor(product, colourId, size.id);
          const unavailable = !v || v.availability === "SOLD_OUT";
          return (
            <button
              key={size.id}
              type="button"
              className={s.option}
              aria-pressed={size.id === sizeId}
              disabled={unavailable}
              aria-label={
                unavailable
                  ? `${size.label}, ${v ? "sold out" : "not available in this colour"}`
                  : size.label
              }
              onClick={() => onChange(size.id)}
            >
              {size.label}
            </button>
          );
        })}
      </div>
      <p className={s.note} aria-live="polite">
        {chosen ? stockText(chosen) : "Choose a size."}
      </p>
    </fieldset>
  );
}
