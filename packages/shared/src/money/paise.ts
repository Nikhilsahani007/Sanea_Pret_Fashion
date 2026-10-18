/** An amount of money in integer paise (₹1 = 100 paise). Create values with `paise()`. */
export type Paise = number & { readonly __brand: "Paise" };

export type MoneyErrorCode =
  | "MONEY_INVALID_TYPE"
  | "MONEY_NOT_INTEGER"
  | "MONEY_UNSAFE"
  | "MONEY_OVERFLOW"
  | "QUANTITY_INVALID"
  | "BPS_INVALID";

/** Thrown when money functions are called with invalid arguments or would overflow. */
export class MoneyError extends Error {
  readonly code: MoneyErrorCode;

  constructor(code: MoneyErrorCode) {
    super(code);
    this.name = "MoneyError";
    this.code = code;
  }
}

/**
 * Temporary upper limit for amount and price schemas: the PostgreSQL `integer`
 * maximum, until Phase 6 confirms the column types (D-040).
 */
export const MAX_AMOUNT_PAISE = 2_147_483_647;

/** Checks a value is a safe integer and brands it as `Paise`. `-0` becomes `0`. */
export function paise(value: number): Paise {
  if (typeof value !== "number") throw new MoneyError("MONEY_INVALID_TYPE");
  if (!Number.isInteger(value)) throw new MoneyError("MONEY_NOT_INTEGER");
  if (!Number.isSafeInteger(value)) throw new MoneyError("MONEY_UNSAFE");
  return (value === 0 ? 0 : value) as Paise;
}

/** True when the value is a safe integer, so it can be used as `Paise`. */
export function isPaise(value: unknown): value is Paise {
  return typeof value === "number" && Number.isSafeInteger(value);
}

/** Internal: re-validates a value typed as Paise, in case types were bypassed. */
export function assertPaise(value: number): Paise {
  return paise(value);
}

/** Internal: brands a computed result, rejecting anything outside the safe range. */
export function checkedResult(value: number): Paise {
  if (!Number.isSafeInteger(value)) throw new MoneyError("MONEY_OVERFLOW");
  return (value === 0 ? 0 : value) as Paise;
}
