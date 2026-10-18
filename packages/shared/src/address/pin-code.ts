import { z } from "zod";

import { fail, ok, type Result } from "../validation/result.ts";
import { requiredOr } from "../validation/schema-helpers.ts";

/** A normalised 6-digit Indian PIN code. */
export type PinCode = string & { readonly __brand: "PinCode" };

const PIN = /^([1-9][0-9]{2}) ?([0-9]{3})$/;

/**
 * Validates an Indian PIN code: 6 ASCII digits, first digit 1–9. Outer
 * whitespace is trimmed and one ASCII space after the third digit is allowed
 * and removed ("110 001" → "110001"). Does not check delivery serviceability.
 */
export function normalizePinCode(
  input: string,
): Result<PinCode, "PIN_CODE_INVALID"> {
  if (typeof input !== "string") return fail("PIN_CODE_INVALID");
  const match = PIN.exec(input.trim());
  if (!match) return fail("PIN_CODE_INVALID");
  return ok(`${match[1]}${match[2]}` as PinCode);
}

/** String schema that outputs the normalised 6-digit PIN code. Strings only. */
export const pinCodeSchema = z
  .string({ error: requiredOr("INVALID_TYPE") })
  .transform((value, ctx): PinCode => {
    if (value.trim() === "") {
      ctx.addIssue({ code: "custom", message: "REQUIRED" });
      return z.NEVER;
    }
    const result = normalizePinCode(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.code });
      return z.NEVER;
    }
    return result.value;
  });
