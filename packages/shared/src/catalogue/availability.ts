/**
 * Public stock state of a variant (api-specification.md §6). Exact counts are
 * shown only at or below the low-stock threshold ("Only 2 left").
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

/** `onHand − reserved`, compared with the variant's low-stock threshold. */
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
