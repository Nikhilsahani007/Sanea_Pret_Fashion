import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import { toFieldErrors } from "../validation/errors.ts";
import type { Paise } from "./paise.ts";
import {
  amountPaiseSchema,
  paiseSchema,
  pricePaiseSchema,
  rupeesInputSchema,
} from "./schemas.ts";

function codes(schema: z.ZodType, input: unknown): string[] {
  const result = schema.safeParse(input);
  return result.success ? [] : toFieldErrors(result.error).map((e) => e.code);
}

describe("paiseSchema", () => {
  it("accepts any safe integer and outputs Paise", () => {
    expect(paiseSchema.parse(-500)).toBe(-500);
    expect(paiseSchema.parse(Number.MAX_SAFE_INTEGER)).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(Object.is(paiseSchema.parse(-0), 0)).toBe(true);
    expectTypeOf(paiseSchema.parse(1)).toEqualTypeOf<Paise>();
  });

  it("reports stable codes", () => {
    expect(codes(paiseSchema, 1.5)).toEqual(["MONEY_NOT_INTEGER"]);
    expect(codes(paiseSchema, 2 ** 53)).toEqual(["MONEY_UNSAFE"]);
    expect(codes(paiseSchema, "100")).toEqual(["INVALID_TYPE"]);
    expect(codes(paiseSchema, Number.NaN)).toEqual(["INVALID_TYPE"]);
    expect(codes(paiseSchema, Infinity)).toEqual(["INVALID_TYPE"]);
    expect(codes(paiseSchema, undefined)).toEqual(["REQUIRED"]);
  });
});

describe("amountPaiseSchema (0 to 2,147,483,647)", () => {
  it("accepts the boundaries", () => {
    expect(amountPaiseSchema.parse(0)).toBe(0);
    expect(amountPaiseSchema.parse(2_147_483_647)).toBe(2_147_483_647);
  });

  it("rejects negatives and values above the cap", () => {
    expect(codes(amountPaiseSchema, -1)).toEqual(["MONEY_NEGATIVE"]);
    expect(codes(amountPaiseSchema, 2_147_483_648)).toEqual([
      "MONEY_ABOVE_LIMIT",
    ]);
    expect(codes(amountPaiseSchema, 0.5)).toEqual(["MONEY_NOT_INTEGER"]);
  });
});

describe("pricePaiseSchema (1 to 2,147,483,647)", () => {
  it("accepts positive prices up to the cap", () => {
    expect(pricePaiseSchema.parse(1)).toBe(1);
    expect(pricePaiseSchema.parse(349_900)).toBe(349_900);
  });

  it("rejects zero, negatives and values above the cap", () => {
    expect(codes(pricePaiseSchema, 0)).toEqual(["MONEY_NOT_POSITIVE"]);
    expect(codes(pricePaiseSchema, -100)).toEqual(["MONEY_NOT_POSITIVE"]);
    expect(codes(pricePaiseSchema, 2_147_483_648)).toEqual([
      "MONEY_ABOVE_LIMIT",
    ]);
  });
});

describe("rupeesInputSchema", () => {
  it("parses rupee strings into Paise", () => {
    expect(rupeesInputSchema.parse(" 1299.50 ")).toBe(129_950);
    expect(rupeesInputSchema.parse("21474836.47")).toBe(2_147_483_647);
    expectTypeOf(rupeesInputSchema.parse("1")).toEqualTypeOf<Paise>();
  });

  it("reports stable codes", () => {
    expect(codes(rupeesInputSchema, "")).toEqual(["REQUIRED"]);
    expect(codes(rupeesInputSchema, "   ")).toEqual(["REQUIRED"]);
    expect(codes(rupeesInputSchema, undefined)).toEqual(["REQUIRED"]);
    expect(codes(rupeesInputSchema, "1,299")).toEqual(["RUPEES_INVALID"]);
    expect(codes(rupeesInputSchema, "1.999")).toEqual([
      "RUPEES_TOO_MANY_DECIMALS",
    ]);
    expect(codes(rupeesInputSchema, "21474836.48")).toEqual([
      "MONEY_ABOVE_LIMIT",
    ]);
    expect(codes(rupeesInputSchema, "99999999999999999999")).toEqual([
      "RUPEES_OUT_OF_RANGE",
    ]);
    expect(codes(rupeesInputSchema, 1299)).toEqual(["INVALID_TYPE"]);
  });
});
