import { describe, expect, it } from "vitest";

import { MoneyError, paise } from "./paise.ts";
import { percentageOfPaise } from "./percentage.ts";

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return undefined;
}

describe("percentageOfPaise() rounding: half away from zero", () => {
  it.each([
    [999, 5000, 500], // 499.5 → 500 (exact half rounds up)
    [1, 5000, 1], // 0.5 → 1
    [49, 100, 0], // 0.49 → 0
    [50, 100, 1], // 0.5 → 1
    [51, 100, 1], // 0.51 → 1
    [149, 100, 1], // 1.49 → 1
    [150, 100, 2], // 1.5 → 2
    [3, 3333, 1], // 0.9999 → 1
    [100, 1, 0], // 0.01 → 0
    [129_900, 1000, 12_990], // 10% exact
    [129_999, 1500, 19_500], // 19499.85 → 19500
    [0, 5000, 0],
    [12_345, 0, 0],
    [12_345, 10_000, 12_345], // 100%
  ])("%d paise at %d bps = %d", (amount, bps, expected) => {
    expect(percentageOfPaise(paise(amount), bps)).toBe(expected);
  });

  it.each([
    [-50, 100, -1], // -0.5 → -1 (away from zero)
    [-49, 100, 0], // -0.49 → 0
    [-999, 5000, -500], // -499.5 → -500
    [-150, 100, -2], // -1.5 → -2
  ])(
    "is symmetric for negative amounts: %d at %d bps = %d",
    (amount, bps, expected) => {
      expect(Object.is(percentageOfPaise(paise(amount), bps), expected)).toBe(
        true,
      );
    },
  );

  it("stays exact at the top of the safe range (BigInt intermediate)", () => {
    const max = Number.MAX_SAFE_INTEGER;
    expect(percentageOfPaise(paise(max), 10_000)).toBe(max);
    // 9007199254740991 × 0.5 = 4503599627370495.5 → 4503599627370496
    expect(percentageOfPaise(paise(max), 5000)).toBe(4_503_599_627_370_496);
    expect(percentageOfPaise(paise(max), 1)).toBe(900_719_925_474);
  });
});

describe("percentageOfPaise() inputs", () => {
  it.each([-1, 10_001, 12.5, Number.NaN, Infinity])(
    "rejects bps %d with BPS_INVALID",
    (bps) => {
      expect(codeOf(() => percentageOfPaise(paise(100), bps))).toBe(
        "BPS_INVALID",
      );
    },
  );

  it("re-validates the amount", () => {
    expect(codeOf(() => percentageOfPaise(1.5 as never, 100))).toBe(
      "MONEY_NOT_INTEGER",
    );
  });
});
