// Server-side pricing (system-design.md §4.2, §4.3). Pure functions: the
// routes load settings and lines, these decide the numbers. Integer paise.
import type {
  CodIneligibleReason,
  CodSettings,
  ShippingSettings,
} from "@sanea/shared";

export type PricedLine = {
  readonly unitPricePaise: number;
  readonly quantity: number;
  readonly hsnCode: string | null;
};

export type GstRuleRow = {
  readonly hsnPrefix: string;
  readonly thresholdPaise: number | null;
  readonly rateBpsAtOrBelow: number;
  readonly rateBpsAbove: number | null;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
};

/**
 * The GST rate for a line (D-033): the effective rule with the longest
 * matching HSN prefix, the rate chosen by unit price against its threshold.
 * Null when no rule applies; no rate is ever assumed (B-14).
 */
export function gstRateBps(
  line: Pick<PricedLine, "unitPricePaise" | "hsnCode">,
  rules: readonly GstRuleRow[],
  now: Date,
): number | null {
  const hsn = line.hsnCode ?? "";
  const rule = rules
    .filter(
      (r) =>
        r.effectiveFrom <= now &&
        (r.effectiveTo === null || r.effectiveTo > now) &&
        hsn.startsWith(r.hsnPrefix),
    )
    .sort((a, b) => b.hsnPrefix.length - a.hsnPrefix.length)[0];
  if (!rule) return null;
  if (rule.thresholdPaise === null || rule.rateBpsAbove === null)
    return rule.rateBpsAtOrBelow;
  return line.unitPricePaise <= rule.thresholdPaise
    ? rule.rateBpsAtOrBelow
    : rule.rateBpsAbove;
}

/** GST contained in a GST-inclusive amount (D-030), rounded half up to the paisa. */
export function includedGst(amountPaise: number, rateBps: number): number {
  return Math.floor(
    (amountPaise * rateBps * 2 + (10_000 + rateBps)) / (2 * (10_000 + rateBps)),
  );
}

export type Quote = {
  subtotalPaise: number;
  discountPaise: number;
  shippingPaise: number;
  codFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: "INR";
  cod: { available: true } | { available: false; reason: CodIneligibleReason };
  lineRates: (number | null)[];
};

export function priceOrder(input: {
  lines: readonly PricedLine[];
  shipping: ShippingSettings;
  cod: CodSettings;
  gstRules: readonly GstRuleRow[];
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
  const lineRates = input.lines.map((l) =>
    gstRateBps(l, input.gstRules, input.now),
  );
  // GST on goods only; how shipping and COD fees are taxed is for the
  // accountant (B-14), so they carry none here.
  const taxPaise = input.lines.reduce(
    (n, l, i) =>
      n +
      (lineRates[i] === null
        ? 0
        : includedGst(l.unitPricePaise * l.quantity, lineRates[i]!)),
    0,
  );
  return {
    subtotalPaise,
    discountPaise,
    shippingPaise,
    codFeePaise,
    taxPaise,
    totalPaise: beforeCod + codFeePaise,
    currency: "INR",
    cod,
    lineRates,
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
