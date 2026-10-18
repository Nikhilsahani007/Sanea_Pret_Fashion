import { describe, expect, it } from "vitest";

import { isPaise, MAX_AMOUNT_PAISE, MoneyError, paise } from "./paise.ts";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return undefined;
}

describe("paise()", () => {
  it.each([
    0,
    1,
    129_999,
    -500,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ])("accepts the safe integer %d", (value) => {
    expect(paise(value)).toBe(value);
  });

  it("normalises -0 to 0", () => {
    expect(Object.is(paise(-0), 0)).toBe(true);
  });

  it.each([1.5, 0.1, -2.25, Number.NaN, Infinity, -Infinity])(
    "rejects the non-integer %d with MONEY_NOT_INTEGER",
    (value) => {
      expect(codeOf(() => paise(value))).toBe("MONEY_NOT_INTEGER");
    },
  );

  it.each([2 ** 53, Number.MAX_SAFE_INTEGER + 1, -(2 ** 53), 1e20])(
    "rejects the unsafe integer %d with MONEY_UNSAFE",
    (value) => {
      expect(codeOf(() => paise(value))).toBe("MONEY_UNSAFE");
    },
  );

  it.each(["100", null, undefined, {}])(
    "rejects the non-number %s with MONEY_INVALID_TYPE",
    (value) => {
      expect(codeOf(() => paise(value as unknown as number))).toBe(
        "MONEY_INVALID_TYPE",
      );
    },
  );

  it("throws MoneyError instances with a name and code", () => {
    try {
      paise(1.5);
    } catch (error) {
      expect(error).toBeInstanceOf(MoneyError);
      expect((error as MoneyError).name).toBe("MoneyError");
      expect((error as MoneyError).message).toBe("MONEY_NOT_INTEGER");
    }
  });
});

describe("isPaise()", () => {
  it("is true only for safe integers", () => {
    expect(isPaise(0)).toBe(true);
    expect(isPaise(-1)).toBe(true);
    expect(isPaise(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isPaise(1.5)).toBe(false);
    expect(isPaise(2 ** 53)).toBe(false);
    expect(isPaise("1")).toBe(false);
    expect(isPaise(Number.NaN)).toBe(false);
  });
});

describe("MAX_AMOUNT_PAISE", () => {
  it("is the PostgreSQL integer maximum (temporary cap, D-040)", () => {
    expect(MAX_AMOUNT_PAISE).toBe(2_147_483_647);
  });
});
