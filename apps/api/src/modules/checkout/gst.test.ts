// GST arithmetic on TEST rules with made-up rates, for structure only. Real
// rates, HSN codes and the seller's state come from the accountant (B-14).
import { describe, expect, it } from "vitest";

import {
  NO_GST,
  includedGst,
  lineGst,
  lineGstTotal,
  ruleFor,
  slabFor,
  supplyTypeOf,
  type GstRuleRow,
} from "./gst.ts";

const now = new Date("2026-10-25T10:00:00Z");
const from = new Date("2026-01-01T00:00:00Z");
// TEST values only: not real GST rates.
const rule = (over: Partial<GstRuleRow> = {}): GstRuleRow => ({
  hsnPrefix: "",
  effectiveFrom: from,
  effectiveTo: null,
  slabs: [
    { upToUnitPricePaise: null, cgstBps: 300, sgstBps: 300, igstBps: 600 },
  ],
  ...over,
});
const line = (
  unitPricePaise: number,
  quantity = 1,
  hsnCode: string | null = "99999999",
) => ({
  unitPricePaise,
  quantity,
  hsnCode,
});

describe("supply type", () => {
  it("is intra-state when the states match, inter-state otherwise, unknown without both", () => {
    expect(supplyTypeOf("uttar-pradesh", "uttar-pradesh")).toBe("INTRA_STATE");
    expect(supplyTypeOf("uttar-pradesh", "delhi")).toBe("INTER_STATE");
    expect(supplyTypeOf(null, "delhi")).toBeNull();
    expect(supplyTypeOf("delhi", null)).toBeNull();
  });
});

describe("rule and band selection", () => {
  it("prefers the longest HSN prefix in effect", () => {
    const any = rule();
    const narrow = rule({ hsnPrefix: "9999" });
    expect(ruleFor("99991234", [any, narrow], now)).toBe(narrow);
    expect(ruleFor("1234", [any, narrow], now)).toBe(any);
    expect(ruleFor(null, [narrow], now)).toBeNull();
  });

  it("ignores rules not yet or no longer in effect", () => {
    expect(
      ruleFor(
        "1",
        [rule({ effectiveFrom: new Date("2027-01-01T00:00:00Z") })],
        now,
      ),
    ).toBeNull();
    expect(ruleFor("1", [rule({ effectiveTo: now })], now)).toBeNull();
  });

  it("chooses the lowest band covering the unit price, inclusive", () => {
    const r = rule({
      slabs: [
        { upToUnitPricePaise: null, cgstBps: 200, sgstBps: 200, igstBps: 400 },
        {
          upToUnitPricePaise: 100_000,
          cgstBps: 100,
          sgstBps: 100,
          igstBps: 200,
        },
      ],
    });
    expect(slabFor(r, 100_000)?.igstBps).toBe(200);
    expect(slabFor(r, 100_001)?.igstBps).toBe(400);
    expect(
      slabFor(
        rule({
          slabs: [
            { upToUnitPricePaise: 10, cgstBps: 0, sgstBps: 0, igstBps: 0 },
          ],
        }),
        11,
      ),
    ).toBeNull();
  });
});

describe("GST in a line", () => {
  it("intra-state: CGST and SGST that add up to the contained GST", () => {
    const g = lineGst(line(105_000, 2), [rule()], now, "INTRA_STATE");
    expect(g.igstBps).toBeNull();
    expect(g).toMatchObject({ cgstBps: 300, sgstBps: 300, igstPaise: 0 });
    expect(lineGstTotal(g)).toBe(includedGst(210_000, 600));
    expect(Math.abs(g.cgstPaise - g.sgstPaise)).toBeLessThanOrEqual(1);
  });

  it("inter-state: IGST only", () => {
    const g = lineGst(line(105_000), [rule()], now, "INTER_STATE");
    expect(g).toMatchObject({
      cgstBps: null,
      sgstBps: null,
      igstBps: 600,
      cgstPaise: 0,
      sgstPaise: 0,
    });
    expect(g.igstPaise).toBe(includedGst(105_000, 600));
  });

  it("no GST without a supply type, a rule or a band", () => {
    expect(lineGst(line(1), [rule()], now, null)).toEqual(NO_GST);
    expect(lineGst(line(1), [], now, "INTRA_STATE")).toEqual(NO_GST);
  });

  it("a zero-rated band records rates of 0 and no amount", () => {
    const zero = rule({
      slabs: [{ upToUnitPricePaise: null, cgstBps: 0, sgstBps: 0, igstBps: 0 }],
    });
    expect(lineGst(line(5_000), [zero], now, "INTRA_STATE")).toMatchObject({
      cgstBps: 0,
      sgstBps: 0,
      cgstPaise: 0,
      sgstPaise: 0,
    });
  });

  it("rounds the contained GST half up to the paisa", () => {
    expect(includedGst(10_500, 500)).toBe(500);
    expect(includedGst(100, 1200)).toBe(11);
    expect(includedGst(0, 1800)).toBe(0);
  });
});
