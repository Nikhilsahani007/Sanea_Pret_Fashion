// Add to bag (phase-11-plan.md §4.5; Q11-6): a sheet fed by the product
// detail. Colours with visible names, then sizes as buttons; sold-out sizes
// are visible, struck through and disabled, with "Sold out" in their name.
// Nothing is added until a size is chosen: never a default size.
import { useState } from "react";

import { api } from "../api/client.ts";
import type { ProductDetail } from "../api/types.ts";
import { useCart } from "../cart/CartProvider.tsx";
import { rupees } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { Sheet } from "../ui/Sheet.tsx";
import ui from "../ui/ui.module.css";
import s from "./product.module.css";

export function SizeSheet({
  slug,
  name,
  open,
  onAdded,
  onClose,
}: {
  slug: string;
  name: string;
  open: boolean;
  onAdded: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={`Add ${name}`}>
      <Choices slug={slug} onAdded={onAdded} />
    </Sheet>
  );
}

function Choices({ slug, onAdded }: { slug: string; onAdded: () => void }) {
  const product = useResource<ProductDetail>(
    (signal) => api.get(`/catalogue/products/${slug}`, signal),
    [slug],
  );
  const { add, busy, error } = useCart();
  const [colourId, setColourId] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<string | null>(null);

  if (product.status === "loading") return <p>Loading sizes…</p>;
  if (product.status === "error")
    return (
      <div className={s.stack}>
        <p role="alert">{product.error.message}</p>
        <button type="button" className={ui.button} onClick={product.reload}>
          Try again
        </button>
      </div>
    );

  const p = product.data;
  const colour = colourId ?? (p.colours.length === 1 ? p.colours[0]!.id : null);
  const variantFor = (size: string) =>
    p.variants.find((v) => v.colourId === colour && v.sizeId === size);
  const chosen = sizeId ? variantFor(sizeId) : undefined;

  return (
    <form
      className={s.stack}
      onSubmit={async (e) => {
        e.preventDefault();
        if (chosen && (await add(chosen.id, 1))) onAdded();
      }}
    >
      <fieldset className={s.fieldset}>
        <legend>Colour</legend>
        <div className={s.options}>
          {p.colours.map((c) => (
            <label key={c.id} className={s.swatch}>
              <input
                type="radio"
                name="colour"
                value={c.id}
                checked={colour === c.id}
                onChange={() => {
                  setColourId(c.id);
                  setSizeId(null);
                }}
              />
              <span
                className={s.chip}
                style={{ backgroundColor: c.swatchHex }}
                aria-hidden="true"
              />
              {c.name}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={s.fieldset} disabled={!colour}>
        <legend>Size</legend>
        {!colour ? <p className={s.hint}>Choose a colour first.</p> : null}
        <div className={s.options}>
          {p.sizes.map((size) => {
            const v = colour ? variantFor(size.id) : undefined;
            const soldOut = !v || v.availability === "SOLD_OUT";
            return (
              <button
                key={size.id}
                type="button"
                className={s.size}
                aria-pressed={sizeId === size.id}
                aria-label={soldOut ? `${size.label}, sold out` : size.label}
                disabled={soldOut}
                onClick={() => setSizeId(size.id)}
              >
                {size.label}
              </button>
            );
          })}
        </div>
        {chosen?.availability === "LOW_STOCK" ? (
          <p className={s.hint}>Only {chosen.remaining} left</p>
        ) : null}
      </fieldset>
      {error ? <p role="alert">{error.message}</p> : null}
      <button type="submit" className={ui.button} disabled={!chosen || busy}>
        {chosen ? `Add to bag · ${rupees(chosen.pricePaise)}` : "Choose a size"}
      </button>
    </form>
  );
}
