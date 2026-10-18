import { describe, expect, it } from "vitest";
import { z } from "zod";

import { addressSchema } from "../address/address.ts";
import {
  toFieldErrors,
  VALIDATION_CODES,
  validationMessage,
} from "./errors.ts";

describe("toFieldErrors()", () => {
  it("builds dot-separated paths for nested schemas", () => {
    const order = z.strictObject({ shippingAddress: addressSchema });
    const result = order.safeParse({
      shippingAddress: {
        fullName: "Sample",
        phone: "9876543210",
        line1: "Line 1",
        city: "Pune",
        state: "maharashtra",
        pinCode: "41100",
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)).toEqual([
        {
          path: "shippingAddress.pinCode",
          code: "PIN_CODE_INVALID",
          message: "Enter a valid 6-digit PIN code.",
        },
      ]);
    }
  });

  it("maps built-in Zod issues to stable codes when no code was set", () => {
    const plain = z.object({
      a: z.string(),
      b: z.string().min(3),
      c: z.string().max(1),
      d: z.enum(["x"]),
    });
    const result = plain.safeParse({ a: 1, b: "x", c: "yy", d: "z" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).map((e) => [e.path, e.code])).toEqual([
        ["a", "INVALID_TYPE"],
        ["b", "TOO_SHORT"],
        ["c", "TOO_LONG"],
        ["d", "INVALID_OPTION"],
      ]);
    }
  });

  it("falls back to INVALID for other issues", () => {
    const result = z.string().email().safeParse("nope");
    expect(result.success).toBe(false);
    if (!result.success)
      expect(toFieldErrors(result.error).map((e) => e.code)).toEqual([
        "INVALID",
      ]);
  });

  it("returns the same result for the same input (stable order)", () => {
    const input = { fullName: "", phone: "x", extra: 1 };
    const first = addressSchema.safeParse(input);
    const second = addressSchema.safeParse(input);
    if (!first.success && !second.success) {
      expect(toFieldErrors(first.error)).toEqual(toFieldErrors(second.error));
    }
  });
});

describe("validation codes and messages", () => {
  it("has a non-empty English message for every code", () => {
    for (const code of Object.values(VALIDATION_CODES)) {
      expect(validationMessage(code).length).toBeGreaterThan(0);
    }
  });

  it("keys equal values", () => {
    for (const [key, value] of Object.entries(VALIDATION_CODES))
      expect(key).toBe(value);
  });
});
