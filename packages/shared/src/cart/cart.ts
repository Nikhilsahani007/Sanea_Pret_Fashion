// The guest cart contract (D-099; api-specification.md §3 Cart;
// phase-11-plan.md §5). Shared by the API and the storefront.
import { z } from "zod";

import type { VariantAvailability } from "../catalogue/availability.ts";

/** The database ceiling for one line (CHECK; D-115). */
export const CART_LINE_CEILING = 10;
/** Distinct lines per cart (`409 CART_FULL` beyond it). */
export const CART_MAX_LINES = 30;
export const CART_CURRENCY = "INR";

/**
 * Request schemas, built for the configured line limit (1 to 10). Strict:
 * prices, totals and any other field are refused (T11-1).
 */
export function cartItemAddSchema(limit: number = CART_LINE_CEILING) {
  return z.strictObject({
    variantId: z.uuid(),
    quantity: z.int().min(1).max(limit),
  });
}

export function cartItemUpdateSchema(limit: number = CART_LINE_CEILING) {
  return z.strictObject({ quantity: z.int().min(0).max(limit) });
}

/**
 * Per-line notices, always shown with text:
 * - `QUANTITY_LIMIT`: an add was capped at the line limit;
 * - `EXCEEDS_AVAILABLE`: more than can be bought now; checkout refuses it;
 * - `UNAVAILABLE`: the variant or its product is no longer on sale.
 */
export const CartWarning = {
  QUANTITY_LIMIT: "QUANTITY_LIMIT",
  EXCEEDS_AVAILABLE: "EXCEEDS_AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;
export type CartWarning = (typeof CartWarning)[keyof typeof CartWarning];

export type CartImage = {
  readonly url: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  /** Derivatives only (AVIF and WebP widths), never the original. */
  readonly sources: readonly {
    readonly format: string;
    readonly width: number;
    readonly height: number;
    readonly url: string;
  }[];
};

export type CartLine = {
  readonly variantId: string;
  readonly productSlug: string;
  readonly productName: string;
  readonly colour: { readonly name: string; readonly swatchHex: string };
  readonly size: string;
  readonly quantity: number;
  /** False when the variant is inactive or its product is not visible. */
  readonly available: boolean;
  /** Null when unavailable: such a line has no price and no total. */
  readonly unitPricePaise: number | null;
  readonly lineTotalPaise: number | null;
  /** The public stock state (D-082): exact counts only with LOW_STOCK. */
  readonly stock: VariantAvailability | null;
  readonly image: CartImage | null;
};

export type CartView = {
  readonly lines: readonly CartLine[];
  /** Available lines only. */
  readonly subtotalPaise: number;
  readonly currency: typeof CART_CURRENCY;
  /** Units across all lines, for the bag count. */
  readonly itemCount: number;
  readonly warnings: readonly {
    readonly variantId: string;
    readonly code: CartWarning;
  }[];
};

export const EMPTY_CART: CartView = {
  lines: [],
  subtotalPaise: 0,
  currency: CART_CURRENCY,
  itemCount: 0,
  warnings: [],
};
