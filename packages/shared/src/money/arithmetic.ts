import { assertPaise, checkedResult, MoneyError, type Paise } from "./paise.ts";

/** a + b. Throws MONEY_OVERFLOW if the result leaves the safe-integer range. */
export function addPaise(a: Paise, b: Paise): Paise {
  return checkedResult(assertPaise(a) + assertPaise(b));
}

/** a − b. The result may be negative (for example a refund delta). */
export function subtractPaise(a: Paise, b: Paise): Paise {
  return checkedResult(assertPaise(a) - assertPaise(b));
}

/** amount × quantity, where quantity is a non-negative safe integer. */
export function multiplyPaise(amount: Paise, quantity: number): Paise {
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new MoneyError("QUANTITY_INVALID");
  return checkedResult(assertPaise(amount) * quantity);
}

/** Sum of a list of amounts. An empty list sums to 0. */
export function sumPaise(amounts: readonly Paise[]): Paise {
  let total = 0 as Paise;
  for (const amount of amounts) total = addPaise(total, amount);
  return total;
}
