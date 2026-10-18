import { describe, expect, it } from "vitest";

import { parseRupeesToPaise } from "./parse.ts";

describe("parseRupeesToPaise() accepts", () => {
  it.each([
    ["1299", 129_900],
    ["1299.5", 129_950],
    ["1299.50", 129_950],
    ["1299.05", 129_905],
    ["0.01", 1],
    ["0", 0],
    ["0.00", 0],
    ["  1299  ", 129_900],
    ["\u00a01299\u00a0", 129_900],
    ["007", 700],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("%j as %d paise", (input, expected) => {
    expect(parseRupeesToPaise(input)).toEqual({ ok: true, value: expected });
  });
});

describe("parseRupeesToPaise() rejects", () => {
  it.each(["1299.505", "0.001", "1.999"])(
    "%j with RUPEES_TOO_MANY_DECIMALS",
    (input) => {
      expect(parseRupeesToPaise(input)).toEqual({
        ok: false,
        code: "RUPEES_TOO_MANY_DECIMALS",
      });
    },
  );

  it.each([
    "",
    "   ",
    "1,299",
    "1,29,999.00",
    "₹1299",
    "Rs 1299",
    "-5",
    "+5",
    "1e3",
    ".5",
    "5.",
    "12 99",
    "१२९९",
    "1299.5.0",
    "NaN",
    "Infinity",
    "abc",
  ])("%j with RUPEES_INVALID", (input) => {
    expect(parseRupeesToPaise(input)).toEqual({
      ok: false,
      code: "RUPEES_INVALID",
    });
  });

  it("rejects values above the safe range with RUPEES_OUT_OF_RANGE", () => {
    expect(parseRupeesToPaise("90071992547409.92")).toEqual({
      ok: false,
      code: "RUPEES_OUT_OF_RANGE",
    });
    expect(parseRupeesToPaise("99999999999999999999")).toEqual({
      ok: false,
      code: "RUPEES_OUT_OF_RANGE",
    });
  });

  it("rejects non-string input with RUPEES_INVALID", () => {
    expect(parseRupeesToPaise(1299 as unknown as string)).toEqual({
      ok: false,
      code: "RUPEES_INVALID",
    });
  });
});
