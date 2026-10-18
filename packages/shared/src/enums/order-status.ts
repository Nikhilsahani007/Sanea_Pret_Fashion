import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/** Order lifecycle states (`system-design.md` §5). `needsAttention` is a flag, not a status. */
export const OrderStatus = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  CONFIRMED: "CONFIRMED",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  RETURN_TO_ORIGIN: "RETURN_TO_ORIGIN",
  RETURN_REQUESTED: "RETURN_REQUESTED",
  RETURNED: "RETURNED",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const orderStatusSchema = z.enum(OrderStatus, {
  error: requiredOr("INVALID_OPTION"),
});
