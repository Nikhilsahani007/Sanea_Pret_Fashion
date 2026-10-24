import { describe, expect, it } from "vitest";

import { availabilityOf } from "./availability.ts";
import { slugSchema, slugify } from "./slug.ts";

describe("slugify", () => {
  it.each([
    ["Sample Kurta A", "sample-kurta-a"],
    ["Sanéa Prét — Festive '26", "sanea-pret-festive-26"],
    ["  --Co-ord  sets-- ", "co-ord-sets"],
    ["!!!", ""],
  ])("%s → %s", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("never ends with a hyphen after truncation", () => {
    const slug = slugify(`${"a".repeat(119)} b`);
    expect(slug.length).toBeLessThanOrEqual(120);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugSchema", () => {
  it.each(["kurtas", "co-ord-sets", "a1"])("accepts %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });
  it.each(["Kurtas", "a--b", "-a", "a-", "a b", "", "é"])("rejects %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(false);
  });
});

describe("availabilityOf", () => {
  it("is sold out when nothing is free", () => {
    expect(
      availabilityOf({ onHand: 3, reserved: 3, lowStockThreshold: 2 }),
    ).toEqual({ availability: "SOLD_OUT" });
    expect(
      availabilityOf({ onHand: 0, reserved: 0, lowStockThreshold: 0 }),
    ).toEqual({ availability: "SOLD_OUT" });
  });
  it("shows the real remaining count at or below the threshold", () => {
    expect(
      availabilityOf({ onHand: 5, reserved: 3, lowStockThreshold: 2 }),
    ).toEqual({ availability: "LOW_STOCK", remaining: 2 });
  });
  it("hides counts above the threshold", () => {
    expect(
      availabilityOf({ onHand: 9, reserved: 1, lowStockThreshold: 2 }),
    ).toEqual({ availability: "IN_STOCK" });
  });
});
