import { codSettingsSchema, shippingSettingsSchema } from "@sanea/shared";
import { describe, expect, it } from "vitest";

import { NO_GST, type GstRuleRow } from "./gst.ts";
import { orderNumber, priceOrder } from "./pricing.ts";

const now = new Date("2026-10-24T10:00:00Z");
const lines = [
  { unitPricePaise: 349_900, quantity: 2, hsnCode: "62114210" },
  { unitPricePaise: 99_900, quantity: 1, hsnCode: null },
];
const base = {
  lines,
  shipping: shippingSettingsSchema.parse({}),
  cod: codSettingsSchema.parse({}),
  gstRules: [] as GstRuleRow[],
  sellerState: null,
  placeOfSupplyState: "uttar-pradesh",
  paymentMethod: undefined,
  pinCode: "226001",
  codRefusals: 0,
  now,
};

describe("priceOrder", () => {
  it("sums lines with no shipping, fee or tax by default", () => {
    const q = priceOrder(base);
    expect(q).toMatchObject({
      subtotalPaise: 799_700,
      discountPaise: 0,
      shippingPaise: 0,
      codFeePaise: 0,
      taxPaise: 0,
      totalPaise: 799_700,
      cod: { available: true },
    });
  });

  it("charges the flat fee below the free-shipping threshold only", () => {
    const shipping = {
      flatFeePaise: 9_900,
      freeShippingThresholdPaise: 800_000,
      deliveryEstimate: null,
    };
    expect(priceOrder({ ...base, shipping }).shippingPaise).toBe(9_900);
    expect(
      priceOrder({
        ...base,
        shipping: { ...shipping, freeShippingThresholdPaise: 799_700 },
      }).shippingPaise,
    ).toBe(0);
  });

  it("adds the COD fee only when COD is chosen, and the total equation holds", () => {
    const cod = { ...base.cod, feePaise: 5_000 };
    const q = priceOrder({ ...base, cod, paymentMethod: "COD" });
    expect(q.codFeePaise).toBe(5_000);
    expect(q.totalPaise).toBe(
      q.subtotalPaise - q.discountPaise + q.shippingPaise + q.codFeePaise,
    );
    expect(
      priceOrder({ ...base, cod, paymentMethod: "PREPAID" }).codFeePaise,
    ).toBe(0);
  });

  it("COD eligibility: limit, PIN prefix, refusals, off switch", () => {
    expect(
      priceOrder({ ...base, cod: { ...base.cod, maxOrderPaise: 799_699 } }).cod,
    ).toEqual({ available: false, reason: "OVER_LIMIT" });
    expect(
      priceOrder({ ...base, cod: { ...base.cod, maxOrderPaise: 799_700 } }).cod,
    ).toEqual({ available: true });
    expect(
      priceOrder({ ...base, cod: { ...base.cod, excludedPinPrefixes: ["22"] } })
        .cod,
    ).toEqual({ available: false, reason: "PIN_CODE_EXCLUDED" });
    expect(
      priceOrder({
        ...base,
        cod: { ...base.cod, refusalLimit: 2 },
        codRefusals: 2,
      }).cod,
    ).toEqual({ available: false, reason: "REFUSAL_LIMIT" });
    expect(
      priceOrder({ ...base, cod: { ...base.cod, enabled: false } }).cod,
    ).toEqual({ available: false, reason: "COD_DISABLED" });
  });

  it("carries no GST until a rule and the seller's state exist (B-14)", () => {
    expect(priceOrder(base).gst).toEqual({
      sellerState: null,
      placeOfSupplyState: "uttar-pradesh",
      supplyType: null,
      lines: [NO_GST, NO_GST],
    });
  });
});

describe("orderNumber", () => {
  it("uses the month in India time", () => {
    expect(orderNumber(new Date("2026-10-31T19:00:00Z"), 42)).toBe(
      "SP-2611-000042",
    );
    expect(orderNumber(now, 1)).toBe("SP-2610-000001");
  });
});
