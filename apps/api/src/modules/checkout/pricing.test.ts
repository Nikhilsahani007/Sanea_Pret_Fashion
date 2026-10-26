import { codSettingsSchema, shippingSettingsSchema } from "@sanea/shared";
import { describe, expect, it } from "vitest";

import {
  gstRateBps,
  includedGst,
  orderNumber,
  priceOrder,
  type GstRuleRow,
} from "./pricing.ts";

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
  paymentMethod: undefined,
  pinCode: "226001",
  codRefusals: 0,
  now,
};

// TEST rules with made-up rates, for arithmetic only. Real rates come from
// the Owner after accountant verification (B-14).
const rule = (over: Partial<GstRuleRow> = {}): GstRuleRow => ({
  hsnPrefix: "",
  thresholdPaise: null,
  rateBpsAtOrBelow: 1000,
  rateBpsAbove: null,
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveTo: null,
  ...over,
});

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
      lineRates: [null, null],
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

  it("reports the GST contained in inclusive prices from TEST rules", () => {
    const q = priceOrder({
      ...base,
      gstRules: [rule({ hsnPrefix: "6211", rateBpsAtOrBelow: 500 })],
    });
    expect(q.lineRates).toEqual([500, null]);
    expect(q.taxPaise).toBe(includedGst(699_800, 500));
    expect(q.totalPaise).toBe(799_700); // inclusive: the total does not change
  });
});

describe("gstRateBps", () => {
  it("prefers the longest prefix and applies the price threshold", () => {
    const rules = [
      rule({ rateBpsAtOrBelow: 100 }),
      rule({
        hsnPrefix: "6211",
        thresholdPaise: 250_000,
        rateBpsAtOrBelow: 200,
        rateBpsAbove: 300,
      }),
    ];
    expect(
      gstRateBps({ unitPricePaise: 250_000, hsnCode: "62114210" }, rules, now),
    ).toBe(200);
    expect(
      gstRateBps({ unitPricePaise: 250_001, hsnCode: "62114210" }, rules, now),
    ).toBe(300);
    expect(gstRateBps({ unitPricePaise: 1, hsnCode: "6104" }, rules, now)).toBe(
      100,
    );
  });

  it("ignores rules not in effect", () => {
    expect(
      gstRateBps(
        { unitPricePaise: 1, hsnCode: null },
        [
          rule({ effectiveFrom: new Date("2027-01-01T00:00:00Z") }),
          rule({ effectiveTo: now }),
        ],
        now,
      ),
    ).toBeNull();
  });
});

describe("includedGst", () => {
  it("rounds half up", () => {
    expect(includedGst(10_500, 500)).toBe(500);
    expect(includedGst(0, 1800)).toBe(0);
    expect(includedGst(100, 1200)).toBe(11); // 10.71 → 11
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
