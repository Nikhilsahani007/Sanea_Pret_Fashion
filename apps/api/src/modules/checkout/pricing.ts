// Server-side pricing (system-design.md §4.2, §4.3). Pure functions: the
// routes load settings and lines, these decide the numbers. Integer paise.
import type {
  CodIneligibleReason,
  CodSettings,
  ShippingSettings,
} from "@sanea/shared";

import {
  lineGst,
  lineGstTotal,
  supplyTypeOf,
  type GstRuleRow,
  type GstSupplyType,
  type LineGst,
} from "./gst.ts";

export type PricedLine = {
  readonly unitPricePaise: number;
  readonly quantity: number;
  readonly hsnCode: string | null;
};

export type Quote = {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: "INR";
  cod: { available: true } | { available: false; reason: CodIneligibleReason };
  /** GST snapshot for the order (D-033); null fields until configured. */
  gst: {
    sellerState: string | null;
    placeOfSupplyState: string | null;
    supplyType: GstSupplyType | null;
    lines: LineGst[];
  };
};

export function priceOrder(input: {
  lines: readonly PricedLine[];
  shipping: ShippingSettings;
  cod: CodSettings;
  gstRules: readonly GstRuleRow[];
  /** The seller's registered state (tax settings; null until entered, B-14). */
  sellerState: string | null;
  /** The delivery state, once the address is known. */
  placeOfSupplyState: string | undefined;
  paymentMethod: "PREPAID" | "COD" | undefined;
  pinCode: string | undefined;
  codRefusals: number;
  now: Date;
}): Quote {
  const subtotalPaise = input.lines.reduce(
    (n, l) => n + l.unitPricePaise * l.quantity,
    0,
  );
  // OD-17: the discount rule exists but is off; no offer at launch.
  const discountPaise = 0;
  const threshold = input.shipping.freeShippingThresholdPaise;
  const shippingPaise =
    threshold !== null && subtotalPaise - discountPaise >= threshold
      ? 0
      : input.shipping.flatFeePaise;
  const beforeCod = subtotalPaise - discountPaise + shippingPaise;

  let cod: Quote["cod"] = { available: true };
  if (!input.cod.enabled) cod = { available: false, reason: "COD_DISABLED" };
  else if (beforeCod + input.cod.feePaise > input.cod.maxOrderPaise)
    cod = { available: false, reason: "OVER_LIMIT" };
  else if (
    input.pinCode &&
    input.cod.excludedPinPrefixes.some((p) => input.pinCode!.startsWith(p))
  )
    cod = { available: false, reason: "PIN_CODE_EXCLUDED" };
  else if (
    input.cod.refusalLimit !== null &&
    input.codRefusals >= input.cod.refusalLimit
  )
    cod = { available: false, reason: "REFUSAL_LIMIT" };

  const codFeePaise = input.paymentMethod === "COD" ? input.cod.feePaise : 0;
  const placeOfSupplyState = input.placeOfSupplyState ?? null;
  const supplyType = supplyTypeOf(input.sellerState, placeOfSupplyState);
  const lines = input.lines.map((l) =>
    lineGst(l, input.gstRules, input.now, supplyType),
  );
  // GST on goods only; how shipping and COD fees are taxed is for the
  // accountant (B-14), so they carry none here.
  const taxPaise = lines.reduce((n, g) => n + lineGstTotal(g), 0);
  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    codFeePaise,
    taxPaise,
    totalPaise: beforeCod + codFeePaise,
    currency: "INR",
    cod,
    gst: {
      sellerState: input.sellerState,
      placeOfSupplyState,
      supplyType,
      lines,
    },
  };
}

/** `SP-YYMM-NNNNNN` with the month in India time (D-115). */
export function orderNumber(now: Date, sequence: number): string {
  const parts = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    year: "2-digit",
    month: "2-digit",
  }).formatToParts(now);
  const yy = parts.find((p) => p.type === "year")!.value;
  const mm = parts.find((p) => p.type === "month")!.value;
  return `SP-${yy}${mm}-${String(sequence).padStart(6, "0")}`;
}
