import { z } from "zod";

import { fail, ok, type Result } from "../validation/result.ts";
import { requiredOr } from "../validation/schema-helpers.ts";

/** Canonical Indian mobile number in E.164 form, for example `+919876543210`. */
export type IndianMobile = `+91${string}`;

export type PhoneErrorCode = "PHONE_INVALID" | "PHONE_NOT_MOBILE";

const ALLOWED_CHARACTERS = /^[0-9+ \u00a0-]+$/;
// Digit groups separated by one ASCII space, non-breaking space or hyphen;
// an optional leading '+'. Tabs, newlines and other Unicode spaces are rejected.
const GROUPS = /^\+?[0-9]+(?:[ \u00a0-][0-9]+)*$/;
const MOBILE = /^[6-9][0-9]{9}$/;
const TEN_DIGITS = /^[0-9]{10}$/;
const CANONICAL = /^\+91[6-9][0-9]{9}$/;

/**
 * Validates an Indian mobile number and normalises it to `+91XXXXXXXXXX`.
 *
 * Accepted after trimming, with single spaces or hyphens between digit groups:
 * 10 digits; `0` + 10 digits; `91` + 10 digits; `+91` + 10 digits;
 * `0091` + 10 digits. The 10-digit number must start with 6, 7, 8 or 9.
 * Nothing is guessed: anything else is rejected.
 */
export function normalizeIndianMobile(
  input: string,
): Result<IndianMobile, PhoneErrorCode> {
  if (typeof input !== "string") return fail("PHONE_INVALID");
  const text = input.trim();
  if (text === "" || !ALLOWED_CHARACTERS.test(text))
    return fail("PHONE_INVALID");
  if (!GROUPS.test(text)) return fail("PHONE_INVALID");
  if (text.startsWith("+") && !text.startsWith("+91"))
    return fail("PHONE_INVALID");

  const digits = text.replace(/[^0-9]/g, "");
  let national: string;
  if (text.startsWith("+")) {
    if (digits.length !== 12) return fail("PHONE_INVALID");
    national = digits.slice(2);
  } else if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    national = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    national = digits.slice(2);
  } else if (digits.length === 14 && digits.startsWith("0091")) {
    national = digits.slice(4);
  } else {
    return fail("PHONE_INVALID");
  }

  if (MOBILE.test(national)) return ok<IndianMobile>(`+91${national}`);
  return fail(TEN_DIGITS.test(national) ? "PHONE_NOT_MOBILE" : "PHONE_INVALID");
}

/** Formats a canonical number for display: `+91 98765 43210`. */
export function formatIndianMobileForDisplay(mobile: IndianMobile): string {
  if (!CANONICAL.test(mobile))
    throw new TypeError("Expected a canonical +91 mobile number");
  return `+91 ${mobile.slice(3, 8)} ${mobile.slice(8)}`;
}

/** String schema that outputs the canonical `+91XXXXXXXXXX` form. */
export const indianMobileSchema = z
  .string({ error: requiredOr("INVALID_TYPE") })
  .transform((value, ctx): IndianMobile => {
    if (value.trim() === "") {
      ctx.addIssue({ code: "custom", message: "REQUIRED" });
      return z.NEVER;
    }
    const result = normalizeIndianMobile(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.code });
      return z.NEVER;
    }
    return result.value;
  });
