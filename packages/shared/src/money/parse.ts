import { fail, ok, type Result } from "../validation/result.ts";
import type { Paise } from "./paise.ts";

export type RupeeParseErrorCode =
  "RUPEES_INVALID" | "RUPEES_TOO_MANY_DECIMALS" | "RUPEES_OUT_OF_RANGE";

const RUPEES = /^([0-9]+)(?:\.([0-9]{1,2}))?$/;
const TOO_MANY_DECIMALS = /^[0-9]+\.[0-9]{3,}$/;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * Parses a rupee amount typed by a person, such as "1299" or "1299.50", into
 * paise. Outer whitespace is trimmed. Rejects grouping commas, currency
 * symbols, signs, exponents, leading dots, internal spaces, non-ASCII digits
 * and more than two decimal places. Never uses floating-point parsing.
 */
export function parseRupeesToPaise(
  input: string,
): Result<Paise, RupeeParseErrorCode> {
  if (typeof input !== "string") return fail("RUPEES_INVALID");
  const text = input.trim();
  if (TOO_MANY_DECIMALS.test(text)) return fail("RUPEES_TOO_MANY_DECIMALS");
  const match = RUPEES.exec(text);
  if (!match) return fail("RUPEES_INVALID");
  const rupees = BigInt(match[1] ?? "0");
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const total = rupees * 100n + fraction;
  if (total > MAX_SAFE) return fail("RUPEES_OUT_OF_RANGE");
  return ok(Number(total) as Paise);
}
