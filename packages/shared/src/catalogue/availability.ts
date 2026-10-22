/**
 * Stock shown to shoppers (D-082 as amended by Q8-2). Exact counts are never
 * exposed, except `remaining` with `LOW_STOCK`.
 */
export const Availability = {
  IN_STOCK: "IN_STOCK",
  LOW_STOCK: "LOW_STOCK",
  SOLD_OUT: "SOLD_OUT",
} as const;

export type Availability = (typeof Availability)[keyof typeof Availability];

export type VariantAvailability =
  | { readonly availability: "IN_STOCK" }
  | { readonly availability: "LOW_STOCK"; readonly remaining: number }
  | { readonly availability: "SOLD_OUT" };

/**
 * Maps stock to the public state. Available is on hand minus reserved;
 * `LOW_STOCK` when 0 < available ≤ threshold, with the real number.
 */
export function availabilityOf(stock: {
  readonly onHand: number;
  readonly reserved: number;
  readonly lowStockThreshold: number;
}): VariantAvailability {
  const available = stock.onHand - stock.reserved;
  if (available <= 0) return { availability: Availability.SOLD_OUT };
  if (available <= stock.lowStockThreshold)
    return { availability: Availability.LOW_STOCK, remaining: available };
  return { availability: Availability.IN_STOCK };
}
