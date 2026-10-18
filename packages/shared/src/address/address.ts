import { z } from "zod";

import { indianMobileSchema } from "../phone/indian-mobile.ts";
import { requiredOr, unknownFieldError } from "../validation/schema-helpers.ts";
import { indianStateSchema } from "./indian-states.ts";
import { pinCodeSchema } from "./pin-code.ts";

// C0 and C1 control characters, including CR, LF, tab and NUL.
// eslint-disable-next-line no-control-regex -- deliberately matches control characters to reject them
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// Zero-width characters, word joiner and byte-order mark.
const INVISIBLE_ONLY = /^[\u200b-\u200d\u2060\ufeff]+$/;

function rejectControl(value: string, ctx: z.RefinementCtx): void {
  if (CONTROL.test(value)) {
    ctx.addIssue({ code: "custom", message: "TEXT_INVALID_CHARACTERS" });
  }
}

// Required text: control characters are rejected; invisible-only text is blank.
function checkRequiredText(value: string, ctx: z.RefinementCtx): void {
  rejectControl(value, ctx);
  if (!CONTROL.test(value) && INVISIBLE_ONLY.test(value)) {
    ctx.addIssue({ code: "custom", message: "REQUIRED" });
  }
}

function requiredText(max: number) {
  return z
    .string({ error: requiredOr("INVALID_TYPE") })
    .trim()
    .superRefine(checkRequiredText)
    .min(1, { error: "REQUIRED" })
    .max(max, { error: "TOO_LONG" });
}

function optionalText(max: number) {
  return (
    z
      .string({ error: requiredOr("INVALID_TYPE") })
      .trim()
      .superRefine(rejectControl)
      .max(max, { error: "TOO_LONG" })
      .optional()
      // Empty or invisible-only optional text becomes absent.
      .transform((value) =>
        value === undefined || value === "" || INVISIBLE_ONLY.test(value)
          ? undefined
          : value,
      )
  );
}

/**
 * An Indian shipping or billing address. Text is trimmed, empty optional
 * fields become absent, phone and PIN code are normalised, and unknown keys
 * are rejected. The country is always India, so it is not a field.
 */
export const addressSchema = z.strictObject(
  {
    fullName: requiredText(100),
    phone: indianMobileSchema,
    line1: requiredText(200),
    line2: optionalText(200),
    landmark: optionalText(200),
    city: requiredText(100),
    state: indianStateSchema,
    pinCode: pinCodeSchema,
  },
  { error: unknownFieldError },
);

/** Address as accepted from a form or request, before normalisation. */
export type AddressInput = z.input<typeof addressSchema>;
/** Address after validation and normalisation. */
export type Address = z.output<typeof addressSchema>;
