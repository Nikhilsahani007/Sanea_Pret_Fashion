// Product detail shape (api-specification.md §6) and colour/size helpers
// shared by the size sheet and the product page.
import type { Img } from "./types.ts";

export type VariantView = {
  id: string;
  colourId: string;
  sizeId: string;
  sku: string;
  pricePaise: number;
  compareAtPricePaise: number | null;
  availability: "IN_STOCK" | "LOW_STOCK" | "SOLD_OUT";
  remaining?: number;
};
export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  fromPricePaise: number;
  compareAtPricePaise: number | null;
  currency: "INR";
  shortDescription: string;
  description: { blocks: { type: string; [k: string]: unknown }[] };
  fabric: string | null;
  care: string | null;
  fit: string | null;
  labels: string[];
  category: { slug: string; name: string };
  collections: { slug: string; name: string }[];
  sizeChart: {
    name: string;
    unit: "CM" | "IN";
    rows: { size: string; measurements: Record<string, number> }[];
  } | null;
  colours: { id: string; slug: string; name: string; swatchHex: string }[];
  sizes: { id: string; label: string }[];
  variants: VariantView[];
  images: (Img & {
    colourId: string | null;
    role: "PRIMARY" | "HOVER" | "GALLERY";
    alt: string;
  })[];
  seoTitle: string | null;
  seoDescription: string | null;
};

export function variantFor(
  p: ProductDetail,
  colourId: string | null,
  sizeId: string | null,
): VariantView | undefined {
  return p.variants.find((v) => v.colourId === colourId && v.sizeId === sizeId);
}

/** The first colour with stock, else the first colour. */
export function defaultColour(p: ProductDetail): string | null {
  return (
    (
      p.colours.find((c) =>
        p.variants.some(
          (v) => v.colourId === c.id && v.availability !== "SOLD_OUT",
        ),
      ) ?? p.colours[0]
    )?.id ?? null
  );
}

export function stockText(v: VariantView | undefined): string {
  if (!v) return "Not made in this combination";
  if (v.availability === "SOLD_OUT") return "Sold out";
  if (v.availability === "LOW_STOCK") return `Only ${v.remaining} left`;
  return "In stock";
}
