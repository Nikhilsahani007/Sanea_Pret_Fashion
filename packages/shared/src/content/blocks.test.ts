import { describe, expect, it } from "vitest";

import {
  CONTENT_BLOCKS,
  linkTargetSchema,
  storeSettingsSchema,
  targetHref,
} from "./blocks.ts";

const ID = "01920000-0000-7000-8000-000000000000";

describe("content blocks", () => {
  it("accepts a valid hero and fills focal defaults", () => {
    const r = CONTENT_BLOCKS["home.hero"].schema.safeParse({
      slides: [
        {
          desktopImageId: ID,
          alt: "Model in an ivory kurta",
          campaignLine: "TEST line",
          ctaLabel: "Shop the edit",
          ctaTarget: { type: "COLLECTION", slug: "festive" },
        },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success)
      expect(r.data.slides[0]).toMatchObject({ focalX: 50, focalY: 50 });
  });

  it("rejects an announcement over 90 characters, unsafe links and reversed schedules", () => {
    const s = CONTENT_BLOCKS["home.announcement"].schema;
    expect(s.safeParse({ text: "x".repeat(91) }).success).toBe(false);
    expect(
      s.safeParse({
        text: "Hi",
        link: { type: "URL", href: "javascript:alert(1)" },
      }).success,
    ).toBe(false);
    expect(
      s.safeParse({
        text: "Hi",
        startsAt: "2027-01-02T00:00:00.000Z",
        endsAt: "2027-01-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      s.safeParse({
        text: "Free delivery details at checkout",
        link: { type: "PAGE", slug: "shipping" },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown fields such as raw HTML", () => {
    expect(
      CONTENT_BLOCKS["site.footer"].schema.safeParse({
        groups: [],
        html: "<b>x</b>",
      }).success,
    ).toBe(false);
  });

  it("needs two to five tabs", () => {
    const s = CONTENT_BLOCKS["home.tabbed"].schema;
    expect(
      s.safeParse({ tabs: [{ label: "A", source: { type: "NEWEST" } }] })
        .success,
    ).toBe(false);
  });
});

describe("targetHref", () => {
  it.each([
    [{ type: "CATEGORY", slug: "kurtas" }, "/shop/kurtas"],
    [{ type: "COLLECTION", slug: "festive" }, "/collections/festive"],
    [{ type: "PRODUCT", slug: "a" }, "/products/a"],
    [{ type: "PAGE", slug: "about" }, "/about"],
    [{ type: "PAGE", slug: "policy-returns" }, "/policies/returns"],
    [
      { type: "URL", href: "https://wa.me/919876543210" },
      "https://wa.me/919876543210",
    ],
  ])("%j → %s", (target, href) => {
    expect(targetHref(linkTargetSchema.parse(target))).toBe(href);
  });
});

describe("store settings", () => {
  it("defaults to empty values, never invented ones", () => {
    expect(storeSettingsSchema.parse({})).toEqual({
      whatsappNumber: null,
      contactEmail: null,
      contactPhone: null,
      businessAddress: null,
    });
  });
  it("requires an Indian mobile in E.164 for WhatsApp", () => {
    expect(
      storeSettingsSchema.safeParse({ whatsappNumber: "+919876543210" })
        .success,
    ).toBe(true);
    expect(
      storeSettingsSchema.safeParse({ whatsappNumber: "9876543210" }).success,
    ).toBe(false);
  });
});
