// Checkout settings and requests (system-design.md §4, OD-07, OD-08, OD-17).
// The defaults are the proposed answers in open-decisions.md (B-07): no
// shipping fee until one is set, COD up to ₹15,000 with no fee, all valid
// PIN codes, auto-cancel after 48 hours. None of them is a decision yet.
import { z } from "zod";

import { addressSchema } from "../address/address.ts";
import { paymentMethodSchema } from "../enums/payment-method.ts";
import { indianMobileSchema } from "../phone/indian-mobile.ts";

const money = (max = 100_000_000) => z.number().int().min(0).max(max);

/** Admin settings group `shipping` (OD-08). Off until the Owner sets values. */
export const shippingSettingsSchema = z.strictObject({
  flatFeePaise: money(1_000_000).default(0),
  /** Orders whose subtotal is at least this ship free; null = no threshold. */
  freeShippingThresholdPaise: money().nullable().default(null),
  /** Shown at checkout, e.g. "3 to 7 working days"; null shows nothing. */
  deliveryEstimate: z.string().trim().min(1).max(80).nullable().default(null),
});
export type ShippingSettings = z.infer<typeof shippingSettingsSchema>;

/** Admin settings group `cod` (OD-07). */
export const codSettingsSchema = z.strictObject({
  enabled: z.boolean().default(true),
  maxOrderPaise: money().default(1_500_000),
  feePaise: money(100_000).default(0),
  /** PIN code prefixes (1 to 6 digits) where COD is not offered. */
  excludedPinPrefixes: z
    .array(z.string().regex(/^[1-9][0-9]{0,5}$/))
    .max(500)
    .default([]),
  /** COD is not offered to a phone number with this many refused COD orders; null = off. */
  refusalLimit: z.number().int().min(1).max(20).nullable().default(null),
  /** Unconfirmed COD orders are cancelled after this many hours. */
  confirmWithinHours: z.number().int().min(1).max(168).default(48),
});
export type CodSettings = z.infer<typeof codSettingsSchema>;

export const DeliveryMethod = { STANDARD: "STANDARD" } as const;
export const deliveryMethodSchema = z.enum(DeliveryMethod);

export const checkoutContactSchema = z.strictObject({
  email: z.email({ error: "EMAIL_INVALID" }).max(254),
  phone: indianMobileSchema,
});

/** `POST /checkout/quote`: no side effects. */
export const checkoutQuoteSchema = z.strictObject({
  shippingAddress: addressSchema.optional(),
  deliveryMethod: deliveryMethodSchema.default("STANDARD"),
  paymentMethod: paymentMethodSchema.optional(),
});

/** `POST /checkout/orders`: the server re-prices and compares with `expectedTotalPaise`. */
export const placeOrderSchema = z.strictObject({
  contact: checkoutContactSchema,
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  deliveryMethod: deliveryMethodSchema,
  paymentMethod: paymentMethodSchema,
  expectedTotalPaise: z.number().int().min(1),
  notes: z.string().trim().max(500).optional(),
});
export type PlaceOrderInput = z.input<typeof placeOrderSchema>;

/** Why COD is not offered, in the order checked. */
export type CodIneligibleReason =
  "COD_DISABLED" | "OVER_LIMIT" | "PIN_CODE_EXCLUDED" | "REFUSAL_LIMIT";
