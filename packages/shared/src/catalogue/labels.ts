import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/**
 * Admin-set product labels (database-design.md §3.1). Release one allows only
 * `NEW` (Q8-8); "Bestseller" or "Trending" need real data (BR-14).
 */
export const ProductLabel = {
  NEW: "NEW",
} as const;

export type ProductLabel = (typeof ProductLabel)[keyof typeof ProductLabel];

export const productLabelSchema = z.enum(ProductLabel, {
  error: requiredOr("INVALID_OPTION"),
});
