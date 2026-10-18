import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/** How an order is paid (`system-design.md` §4). */
export const PaymentMethod = {
  PREPAID: "PREPAID",
  COD: "COD",
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const paymentMethodSchema = z.enum(PaymentMethod, {
  error: requiredOr("INVALID_OPTION"),
});
