// Seed guards and sample definitions; no database needed.
import { describe, expect, it } from "vitest";

import { SAMPLE_PRODUCTS, SeedRefused, assertSeedAllowed } from "./seed.ts";

const LOCAL = "postgresql://sanea:x@127.0.0.1:5433/sanea_dev";

describe("assertSeedAllowed", () => {
  it.each([
    [
      "production",
      { NODE_ENV: "production", DATABASE_URL: LOCAL },
      /production/,
    ],
    ["no URL", { NODE_ENV: "development" }, /not set/],
    ["a malformed URL", { DATABASE_URL: "not a url" }, /not a URL/],
    [
      "a remote host",
      { DATABASE_URL: "postgresql://u:p@db.example.test:5432/sanea" },
      /127\.0\.0\.1 or localhost/,
    ],
  ])("refuses %s", (_name, env, message) => {
    expect(() => assertSeedAllowed(env)).toThrow(SeedRefused);
    expect(() => assertSeedAllowed(env)).toThrow(message);
  });

  it.each(["127.0.0.1", "localhost"])("allows a %s database", (host) => {
    const url = `postgresql://u:p@${host}:5433/sanea_dev`;
    expect(
      assertSeedAllowed({ NODE_ENV: "development", DATABASE_URL: url }),
    ).toBe(url);
  });
});

describe("sample products", () => {
  it("are obviously fake and use only approved sizes", () => {
    for (const p of SAMPLE_PRODUCTS) {
      expect(p.name).toMatch(/^Sample /);
      expect(
        p.sizes.every((s) =>
          ["S", "M", "L", "XL", "XXL", "Free Size"].includes(s),
        ),
      ).toBe(true);
      expect(Number.isInteger(p.pricePaise) && p.pricePaise > 0).toBe(true);
      if (p.compareAtPricePaise)
        expect(p.compareAtPricePaise).toBeGreaterThan(p.pricePaise);
      expect(p.stock).toHaveLength(p.sizes.length);
    }
  });
});
