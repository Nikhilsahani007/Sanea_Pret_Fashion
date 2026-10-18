import { describe, expect, it } from "vitest";

import { toFieldErrors } from "../validation/errors.ts";
import { normalizePinCode, pinCodeSchema } from "./pin-code.ts";

describe("normalizePinCode()", () => {
  it.each([
    ["110001", "110001"],
    [" 110001 ", "110001"],
    ["110 001", "110001"],
    ["  560 001\t", "560001"],
    ["999999", "999999"],
    ["100000", "100000"],
  ])("accepts %j as %s", (input, expected) => {
    expect(normalizePinCode(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    "",
    "   ",
    "010001", // leading zero
    "11001", // 5 digits
    "1100011", // 7 digits
    "11000A",
    "110-001",
    "1100 01", // space in the wrong place
    "110  001", // two spaces
    "1 10001",
    "110\u00a0001", // non-breaking space inside
    "११०००१", // Devanagari digits
  ])("rejects %j with PIN_CODE_INVALID", (input) => {
    expect(normalizePinCode(input)).toEqual({
      ok: false,
      code: "PIN_CODE_INVALID",
    });
  });

  it("rejects non-string input", () => {
    expect(normalizePinCode(110001 as unknown as string)).toEqual({
      ok: false,
      code: "PIN_CODE_INVALID",
    });
  });
});

describe("pinCodeSchema", () => {
  it("outputs the normalised PIN code", () => {
    expect(pinCodeSchema.parse("110 001")).toBe("110001");
  });

  it.each([
    [undefined, "REQUIRED"],
    ["", "REQUIRED"],
    [110001, "INVALID_TYPE"],
    ["010001", "PIN_CODE_INVALID"],
  ])("%j → %s", (input, code) => {
    const result = pinCodeSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(toFieldErrors(result.error).map((e) => e.code)).toEqual([code]);
  });
});
