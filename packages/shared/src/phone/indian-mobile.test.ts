import { describe, expect, it } from "vitest";

import { toFieldErrors } from "../validation/errors.ts";
import {
  formatIndianMobileForDisplay,
  indianMobileSchema,
  normalizeIndianMobile,
} from "./indian-mobile.ts";

const CANONICAL = "+919876543210";

describe("normalizeIndianMobile() accepts and normalises to +91XXXXXXXXXX", () => {
  it.each([
    "9876543210",
    "98765 43210",
    "98765-43210",
    "9876 543 210",
    "+919876543210",
    "+91 98765 43210",
    "+91-98765-43210",
    "+91 9876 543 210",
    "919876543210",
    "91 98765 43210",
    "09876543210",
    "0 98765 43210",
    "00919876543210",
    "0091 98765 43210",
    "  9876543210  ",
    "\t+91 98765 43210\n",
    "98765\u00a043210",
    "\u00a0+91\u00a098765\u00a043210\u00a0",
  ])("%j", (input) => {
    expect(normalizeIndianMobile(input)).toEqual({
      ok: true,
      value: CANONICAL,
    });
  });

  it.each([
    ["6000000000", "+916000000000"],
    ["7012345678", "+917012345678"],
    ["8123456789", "+918123456789"],
    ["9999999999", "+919999999999"],
  ])("accepts numbers starting 6–9: %j", (input, expected) => {
    expect(normalizeIndianMobile(input)).toEqual({ ok: true, value: expected });
  });
});

describe("normalizeIndianMobile() rejects", () => {
  it.each([
    ["5876543210", "PHONE_NOT_MOBILE"],
    ["1234567890", "PHONE_NOT_MOBILE"],
    ["0876543210", "PHONE_NOT_MOBILE"],
    ["011 2345 6789", "PHONE_NOT_MOBILE"], // Delhi landline after trunk 0
    ["+91 22 1234 5678", "PHONE_NOT_MOBILE"], // Mumbai landline with country code
    ["910987654321", "PHONE_NOT_MOBILE"],
  ])("%j as %s", (input, code) => {
    expect(normalizeIndianMobile(input)).toEqual({ ok: false, code });
  });

  it.each([
    "",
    "   ",
    "987654321", // 9 digits
    "98765432101", // 11 digits without leading 0
    "987654321012", // 12 digits without 91
    "+9109876543210", // trunk 0 after country code
    "+91987654321", // too short after +91
    "+1 202 555 0123", // other country
    "+44 7911 123456",
    "9876O43210", // letter O
    "98765.43210", // dot separator
    "98765/43210",
    "(+91) 98765 43210", // parentheses
    "+91 (987) 654 3210",
    "++919876543210",
    "+ 91 98765 43210", // space after plus
    "91+9876543210", // plus not first
    "98765  43210", // double separator
    "98765 -43210",
    "-9876543210", // leading separator
    "9876543210-",
    "9876543210 ext 12",
    "9876543210, 9123456789", // two numbers
    "9876543210 9123456789",
    "९८७६५४३२१०", // Devanagari digits
    "９８７６５４３２１０", // full-width digits
  ])("%j as PHONE_INVALID", (input) => {
    expect(normalizeIndianMobile(input)).toEqual({
      ok: false,
      code: "PHONE_INVALID",
    });
  });

  it("rejects non-string input", () => {
    expect(normalizeIndianMobile(9876543210 as unknown as string)).toEqual({
      ok: false,
      code: "PHONE_INVALID",
    });
  });
});

describe("formatIndianMobileForDisplay()", () => {
  it("formats the canonical form as +91 98765 43210", () => {
    expect(formatIndianMobileForDisplay("+919876543210")).toBe(
      "+91 98765 43210",
    );
  });

  it("rejects non-canonical input", () => {
    expect(() => formatIndianMobileForDisplay("+91987654321")).toThrow(
      TypeError,
    );
    expect(() => formatIndianMobileForDisplay("+915876543210")).toThrow(
      TypeError,
    );
  });
});

describe("indianMobileSchema", () => {
  it("outputs the canonical form", () => {
    expect(indianMobileSchema.parse("098765-43210")).toBe(CANONICAL);
  });

  it.each([
    [undefined, "REQUIRED"],
    ["", "REQUIRED"],
    ["  ", "REQUIRED"],
    [9876543210, "INVALID_TYPE"],
    ["12345", "PHONE_INVALID"],
    ["5876543210", "PHONE_NOT_MOBILE"],
  ])("%j → %s", (input, code) => {
    const result = indianMobileSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(toFieldErrors(result.error).map((e) => e.code)).toEqual([code]);
  });
});

describe("normalizeIndianMobile() separator regression (review fix)", () => {
  it.each([
    "98765\t43210",
    "98765\n43210",
    "98765\r\n43210",
    "98765\u300043210",
    "98765\u202843210",
    "98765\u200943210",
    "+91\t98765 43210",
  ])(
    "rejects %j: only space, non-breaking space or hyphen may separate digits",
    (input) => {
      expect(normalizeIndianMobile(input)).toEqual({
        ok: false,
        code: "PHONE_INVALID",
      });
    },
  );

  it.each(["98765\u00a043210", "\t98765 43210\n", "98765-43210"])(
    "still accepts %j",
    (input) => {
      expect(normalizeIndianMobile(input)).toEqual({
        ok: true,
        value: CANONICAL,
      });
    },
  );
});
