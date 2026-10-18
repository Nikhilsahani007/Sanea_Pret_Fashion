import { describe, expect, it } from "vitest";

import { formatInr } from "./format.ts";
import { MoneyError, paise, type Paise } from "./paise.ts";

describe("formatInr() with Indian digit grouping", () => {
  it.each([
    [0, "₹0"],
    [1, "₹0.01"],
    [50, "₹0.50"],
    [100, "₹1"],
    [129_900, "₹1,299"],
    [129_950, "₹1,299.50"],
    [12_999_900, "₹1,29,999"],
    [10_000_000, "₹1,00,000"],
    [1_000_000_000, "₹1,00,00,000"],
    [1_234_567_890, "₹1,23,45,678.90"],
    [-129_900, "-₹1,299"],
    [-1, "-₹0.01"],
  ])("%d paise → %s", (amount, expected) => {
    expect(formatInr(paise(amount))).toBe(expected);
  });

  it("formats the largest safe amount exactly, without float rounding", () => {
    expect(formatInr(paise(Number.MAX_SAFE_INTEGER))).toBe(
      "₹9,00,71,99,25,47,409.91",
    );
    expect(formatInr(paise(Number.MAX_SAFE_INTEGER - 91))).toBe(
      "₹9,00,71,99,25,47,409",
    );
  });

  it("shows two decimals with decimals: 'always'", () => {
    expect(formatInr(paise(129_900), { decimals: "always" })).toBe("₹1,299.00");
    expect(formatInr(paise(0), { decimals: "always" })).toBe("₹0.00");
    expect(formatInr(paise(129_950), { decimals: "always" })).toBe("₹1,299.50");
  });

  it("rejects invalid input", () => {
    expect(() => formatInr(1.5 as Paise)).toThrow(MoneyError);
    expect(() => formatInr((2 ** 53) as Paise)).toThrow(MoneyError);
  });
});
