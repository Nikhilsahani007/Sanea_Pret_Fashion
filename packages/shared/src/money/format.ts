import { assertPaise, type Paise } from "./paise.ts";

export type FormatInrOptions = {
  /** `auto` (default) hides `.00` for whole rupees; `always` shows two decimals. */
  readonly decimals?: "auto" | "always";
};

const WHOLE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const WITH_PAISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formats paise as Indian rupees with Indian digit grouping, for example
 * `₹1,29,999` or `₹1,299.50`. The value is passed to Intl as an exact decimal
 * string, so large amounts are never rounded by floating-point conversion.
 */
export function formatInr(
  amount: Paise,
  options: FormatInrOptions = {},
): string {
  const value = BigInt(assertPaise(amount));
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const rupees = magnitude / 100n;
  const fraction = magnitude % 100n;
  const sign = negative ? "-" : "";
  if ((options.decimals ?? "auto") === "auto" && fraction === 0n) {
    return WHOLE.format(`${sign}${rupees}` as Intl.StringNumericLiteral);
  }
  const decimal = `${sign}${rupees}.${fraction.toString().padStart(2, "0")}`;
  return WITH_PAISE.format(decimal as Intl.StringNumericLiteral);
}
