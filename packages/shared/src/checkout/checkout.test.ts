import { describe, expect, it } from "vitest";

import {
  codSettingsSchema,
  placeOrderSchema,
  shippingSettingsSchema,
} from "./checkout.ts";

const address = {
  fullName: "TEST Shopper",
  phone: "98765 43210",
  line1: "TEST 1 Example Road",
  city: "Lucknow",
  state: "uttar-pradesh",
  pinCode: "226001",
};

describe("checkout settings defaults (proposed, B-07)", () => {
  it("shipping is off until set", () => {
    expect(shippingSettingsSchema.parse({})).toEqual({
      flatFeePaise: 0,
      freeShippingThresholdPaise: null,
      deliveryEstimate: null,
    });
  });

  it("COD defaults follow OD-07", () => {
    expect(codSettingsSchema.parse({})).toEqual({
      enabled: true,
      maxOrderPaise: 1_500_000,
      feePaise: 0,
      excludedPinPrefixes: [],
      refusalLimit: null,
      confirmWithinHours: 48,
    });
  });

  it("rejects unknown keys and bad PIN prefixes", () => {
    expect(codSettingsSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(
      codSettingsSchema.safeParse({ excludedPinPrefixes: ["0123"] }).success,
    ).toBe(false);
  });
});

describe("placeOrderSchema", () => {
  it("normalises the contact phone and the address", () => {
    const r = placeOrderSchema.parse({
      contact: { email: "shopper@example.test", phone: "9876543210" },
      shippingAddress: address,
      deliveryMethod: "STANDARD",
      paymentMethod: "COD",
      expectedTotalPaise: 349900,
    });
    expect(r.contact.phone).toBe("+919876543210");
    expect(r.shippingAddress.phone).toBe("+919876543210");
  });

  it("refuses a client price, an unknown method and extra fields", () => {
    const base = {
      contact: { email: "shopper@example.test", phone: "9876543210" },
      shippingAddress: address,
      deliveryMethod: "STANDARD",
      paymentMethod: "COD",
      expectedTotalPaise: 349900,
    };
    expect(placeOrderSchema.safeParse({ ...base, totalPaise: 1 }).success).toBe(
      false,
    );
    expect(
      placeOrderSchema.safeParse({ ...base, paymentMethod: "UPI" }).success,
    ).toBe(false);
    expect(
      placeOrderSchema.safeParse({ ...base, expectedTotalPaise: 0 }).success,
    ).toBe(false);
  });
});
