import type { z } from "zod";

/**
 * Stable validation codes. Schemas in this package put one of these codes in
 * each issue's `message`; `toFieldErrors` turns them into human-readable text.
 */
export const VALIDATION_CODES = {
  REQUIRED: "REQUIRED",
  INVALID_TYPE: "INVALID_TYPE",
  TOO_SHORT: "TOO_SHORT",
  TOO_LONG: "TOO_LONG",
  INVALID_OPTION: "INVALID_OPTION",
  UNKNOWN_FIELD: "UNKNOWN_FIELD",
  INVALID: "INVALID",
  MONEY_NOT_INTEGER: "MONEY_NOT_INTEGER",
  MONEY_UNSAFE: "MONEY_UNSAFE",
  MONEY_NEGATIVE: "MONEY_NEGATIVE",
  MONEY_NOT_POSITIVE: "MONEY_NOT_POSITIVE",
  MONEY_ABOVE_LIMIT: "MONEY_ABOVE_LIMIT",
  RUPEES_INVALID: "RUPEES_INVALID",
  RUPEES_TOO_MANY_DECIMALS: "RUPEES_TOO_MANY_DECIMALS",
  RUPEES_OUT_OF_RANGE: "RUPEES_OUT_OF_RANGE",
  PHONE_INVALID: "PHONE_INVALID",
  PHONE_NOT_MOBILE: "PHONE_NOT_MOBILE",
  PIN_CODE_INVALID: "PIN_CODE_INVALID",
  STATE_INVALID: "STATE_INVALID",
  TEXT_INVALID_CHARACTERS: "TEXT_INVALID_CHARACTERS",
  SLUG_INVALID: "SLUG_INVALID",
  LINK_NOT_INTERNAL: "LINK_NOT_INTERNAL",
} as const;

export type ValidationCode =
  (typeof VALIDATION_CODES)[keyof typeof VALIDATION_CODES];

const MESSAGES: Record<ValidationCode, string> = {
  REQUIRED: "This field is required.",
  INVALID_TYPE: "This value has the wrong type.",
  TOO_SHORT: "This value is too short.",
  TOO_LONG: "This value is too long.",
  INVALID_OPTION: "Choose one of the allowed options.",
  UNKNOWN_FIELD: "This field is not allowed.",
  INVALID: "This value is not valid.",
  MONEY_NOT_INTEGER: "Amounts must be whole paise.",
  MONEY_UNSAFE: "This amount is outside the supported range.",
  MONEY_NEGATIVE: "Amounts cannot be negative.",
  MONEY_NOT_POSITIVE: "Amounts must be greater than zero.",
  MONEY_ABOVE_LIMIT: "This amount is above the allowed limit.",
  RUPEES_INVALID: "Enter an amount in rupees, for example 1299 or 1299.50.",
  RUPEES_TOO_MANY_DECIMALS: "Use at most two decimal places.",
  RUPEES_OUT_OF_RANGE: "This amount is too large.",
  PHONE_INVALID: "Enter a valid Indian mobile number.",
  PHONE_NOT_MOBILE: "Enter a mobile number, not a landline.",
  PIN_CODE_INVALID: "Enter a valid 6-digit PIN code.",
  STATE_INVALID: "Choose a state or union territory from the list.",
  TEXT_INVALID_CHARACTERS: "Remove line breaks and other control characters.",
  SLUG_INVALID:
    "Use lowercase letters and digits, with single hyphens between words.",
  LINK_NOT_INTERNAL: "Links must point to a page on this site.",
};

/** Human-readable English message for a validation code. */
export function validationMessage(code: ValidationCode): string {
  return MESSAGES[code];
}

export type FieldError = {
  /** Dot-separated path, for example `shippingAddress.pinCode`. Empty for the root. */
  readonly path: string;
  readonly code: ValidationCode;
  readonly message: string;
};

const CODE_SET: ReadonlySet<string> = new Set(Object.values(VALIDATION_CODES));

function isValidationCode(value: string): value is ValidationCode {
  return CODE_SET.has(value);
}

function fallbackCode(issueCode: string): ValidationCode {
  switch (issueCode) {
    case "invalid_type":
      return "INVALID_TYPE";
    case "too_small":
      return "TOO_SHORT";
    case "too_big":
      return "TOO_LONG";
    case "invalid_value":
      return "INVALID_OPTION";
    case "unrecognized_keys":
      return "UNKNOWN_FIELD";
    default:
      return "INVALID";
  }
}

function joinPath(path: readonly PropertyKey[]): string {
  return path.map((part) => String(part)).join(".");
}

/**
 * Converts a Zod error into a flat, predictable list of field errors, in the
 * order Zod reports the issues. Unknown keys produce one entry per key.
 */
export function toFieldErrors(error: z.ZodError): FieldError[] {
  const result: FieldError[] = [];
  for (const issue of error.issues) {
    const code = isValidationCode(issue.message)
      ? issue.message
      : fallbackCode(issue.code);
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        result.push({
          path: joinPath([...issue.path, key]),
          code,
          message: MESSAGES[code],
        });
      }
      continue;
    }
    result.push({ path: joinPath(issue.path), code, message: MESSAGES[code] });
  }
  return result;
}
