import { assertPaise, checkedResult, MoneyError, type Paise } from "./paise.ts";

const BPS_PER_WHOLE = 10_000n;

/**
 * Percentage of an amount, in basis points (10,000 bps = 100%).
 *
 * Exact value: amount × bps / 10,000, rounded to the nearest paise with halves
 * rounded away from zero (D-040). Uses BigInt, so there is no float error or
 * intermediate overflow. Not for GST, which has its own rules (D-030, D-033).
 */
export function percentageOfPaise(amount: Paise, bps: number): Paise {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000)
    throw new MoneyError("BPS_INVALID");
  const product = BigInt(assertPaise(amount)) * BigInt(bps);
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  let quotient = magnitude / BPS_PER_WHOLE;
  const remainder = magnitude % BPS_PER_WHOLE;
  if (remainder * 2n >= BPS_PER_WHOLE) quotient += 1n;
  return checkedResult(Number(negative ? -quotient : quotient));
}
