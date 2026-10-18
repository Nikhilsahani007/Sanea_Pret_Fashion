import { describe, expect, it } from "vitest";

import {
  addPaise,
  multiplyPaise,
  subtractPaise,
  sumPaise,
} from "./arithmetic.ts";
import { MoneyError, paise, type Paise } from "./paise.ts";

const MAX = Number.MAX_SAFE_INTEGER;

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return undefined;
}

describe("addPaise()", () => {
  it("adds exactly", () => {
    expect(addPaise(paise(129_900), paise(50))).toBe(129_950);
    expect(addPaise(paise(MAX - 1), paise(1))).toBe(MAX);
  });

  it("rejects results above the safe range with MONEY_OVERFLOW", () => {
    expect(codeOf(() => addPaise(paise(MAX), paise(1)))).toBe("MONEY_OVERFLOW");
  });

  it("re-validates inputs that bypassed the type system", () => {
    expect(codeOf(() => addPaise(1.5 as Paise, paise(1)))).toBe(
      "MONEY_NOT_INTEGER",
    );
    expect(codeOf(() => addPaise(paise(1), (2 ** 53) as Paise))).toBe(
      "MONEY_UNSAFE",
    );
  });
});

describe("subtractPaise()", () => {
  it("subtracts exactly and may go negative", () => {
    expect(subtractPaise(paise(1000), paise(250))).toBe(750);
    expect(subtractPaise(paise(250), paise(1000))).toBe(-750);
  });

  it("returns 0, not -0, for equal values", () => {
    expect(Object.is(subtractPaise(paise(5), paise(5)), 0)).toBe(true);
  });

  it("rejects results below the safe range with MONEY_OVERFLOW", () => {
    expect(codeOf(() => subtractPaise(paise(-MAX), paise(1)))).toBe(
      "MONEY_OVERFLOW",
    );
  });
});

describe("multiplyPaise()", () => {
  it("multiplies by a whole quantity", () => {
    expect(multiplyPaise(paise(349_900), 3)).toBe(1_049_700);
    expect(multiplyPaise(paise(349_900), 0)).toBe(0);
  });

  it.each([1.5, -1, Number.NaN, Infinity, 2 ** 53])(
    "rejects the quantity %d with QUANTITY_INVALID",
    (quantity) => {
      expect(codeOf(() => multiplyPaise(paise(100), quantity))).toBe(
        "QUANTITY_INVALID",
      );
    },
  );

  it("rejects products above the safe range with MONEY_OVERFLOW", () => {
    expect(codeOf(() => multiplyPaise(paise(MAX), 2))).toBe("MONEY_OVERFLOW");
    expect(codeOf(() => multiplyPaise(paise(2 ** 30), 2 ** 24))).toBe(
      "MONEY_OVERFLOW",
    );
  });
});

describe("sumPaise()", () => {
  it("sums a list exactly; an empty list is 0", () => {
    expect(sumPaise([])).toBe(0);
    expect(sumPaise([paise(100), paise(250), paise(-50)])).toBe(300);
  });

  it("rejects overflow part-way through", () => {
    expect(codeOf(() => sumPaise([paise(MAX), paise(1), paise(-5)]))).toBe(
      "MONEY_OVERFLOW",
    );
  });
});
