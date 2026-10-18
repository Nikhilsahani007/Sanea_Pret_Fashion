import { describe, expect, expectTypeOf, it } from "vitest";

import type { IndianMobile } from "../phone/indian-mobile.ts";
import { toFieldErrors } from "../validation/errors.ts";
import { addressSchema, type Address, type AddressInput } from "./address.ts";
import type { IndianState } from "./indian-states.ts";
import type { PinCode } from "./pin-code.ts";

const valid = {
  fullName: "  Sample Customer  ",
  phone: "098765 43210",
  line1: " Flat 4B, Sample Residency ",
  line2: "",
  landmark: "Near Sample Park",
  city: " Mumbai ",
  state: "maharashtra",
  pinCode: "400 001",
};

describe("addressSchema", () => {
  it("validates and normalises a full address", () => {
    expect(addressSchema.parse(valid)).toEqual({
      fullName: "Sample Customer",
      phone: "+919876543210",
      line1: "Flat 4B, Sample Residency",
      line2: undefined,
      landmark: "Near Sample Park",
      city: "Mumbai",
      state: "maharashtra",
      pinCode: "400001",
    });
  });

  it("allows the optional fields to be omitted", () => {
    const required: Record<string, string> = { ...valid };
    delete required.line2;
    delete required.landmark;
    const result = addressSchema.parse(required);
    expect(Object.keys(required)).not.toContain("line2");
    expect(result.line2).toBeUndefined();
    expect(result.landmark).toBeUndefined();
  });

  it("reports every missing required field as REQUIRED, in schema order", () => {
    const result = addressSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).map((e) => [e.path, e.code])).toEqual([
        ["fullName", "REQUIRED"],
        ["phone", "REQUIRED"],
        ["line1", "REQUIRED"],
        ["city", "REQUIRED"],
        ["state", "REQUIRED"],
        ["pinCode", "REQUIRED"],
      ]);
    }
  });

  it("reports blank text, long text, bad values and unknown keys with stable codes", () => {
    const result = addressSchema.safeParse({
      ...valid,
      fullName: "   ",
      line1: "x".repeat(201),
      phone: "12345",
      state: "Maharashtra",
      pinCode: "010001",
      country: "IN",
      notes: "leave at door",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).map((e) => [e.path, e.code])).toEqual([
        ["fullName", "REQUIRED"],
        ["phone", "PHONE_INVALID"],
        ["line1", "TOO_LONG"],
        ["state", "STATE_INVALID"],
        ["pinCode", "PIN_CODE_INVALID"],
        ["country", "UNKNOWN_FIELD"],
        ["notes", "UNKNOWN_FIELD"],
      ]);
    }
  });

  it("rejects wrong types and non-object input", () => {
    const wrongTypes = addressSchema.safeParse({ ...valid, city: 42 });
    expect(wrongTypes.success).toBe(false);
    if (!wrongTypes.success) {
      expect(toFieldErrors(wrongTypes.error)).toEqual([
        {
          path: "city",
          code: "INVALID_TYPE",
          message: "This value has the wrong type.",
        },
      ]);
    }
    const notObject = addressSchema.safeParse("not an address");
    expect(notObject.success).toBe(false);
    if (!notObject.success) {
      expect(
        toFieldErrors(notObject.error).map((e) => [e.path, e.code]),
      ).toEqual([["", "INVALID_TYPE"]]);
    }
  });

  it("infers input and output types", () => {
    expectTypeOf<Address>().toEqualTypeOf<{
      fullName: string;
      phone: IndianMobile;
      line1: string;
      line2: string | undefined;
      landmark: string | undefined;
      city: string;
      state: IndianState;
      pinCode: PinCode;
    }>();
    expectTypeOf<AddressInput["phone"]>().toEqualTypeOf<string>();
    expectTypeOf<AddressInput["pinCode"]>().toEqualTypeOf<string>();
  });
});

describe("addressSchema text characters (review fix)", () => {
  const codesFor = (patch: Record<string, unknown>) => {
    const result = addressSchema.safeParse({ ...valid, ...patch });
    return result.success
      ? []
      : toFieldErrors(result.error).map((e) => [e.path, e.code]);
  };

  it.each([
    ["fullName", "Sam\u0000ple"],
    ["fullName", "Sample\nCustomer"],
    ["line1", "X\r\nBcc: someone@example.com"],
    ["line1", "Flat 4B\tBlock C"],
    ["city", "Mum\u007fbai"],
    ["landmark", "Near\u0085park"],
  ])("rejects control characters in %s", (field, value) => {
    expect(codesFor({ [field]: value })).toEqual([
      [field, "TEXT_INVALID_CHARACTERS"],
    ]);
  });

  it("treats zero-width-only text as blank", () => {
    expect(codesFor({ fullName: "\u200b\u200d" })).toEqual([
      ["fullName", "REQUIRED"],
    ]);
    const optional = addressSchema.parse({
      ...valid,
      line2: "\u200b",
      landmark: "\ufeff",
    });
    expect(optional.line2).toBeUndefined();
    expect(optional.landmark).toBeUndefined();
  });

  it("still accepts outer line breaks, accents and joiners inside words", () => {
    const result = addressSchema.parse({
      ...valid,
      fullName: "\n Sanéa Customer \n",
      city: "क्\u200dष",
    });
    expect(result.fullName).toBe("Sanéa Customer");
    expect(result.city).toBe("क्\u200dष");
  });
});
