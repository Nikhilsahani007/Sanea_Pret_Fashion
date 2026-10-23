// Content block, navigation and page rich-text schemas (Phase 10, D-093).
import { describe, expect, it } from "vitest";

import {
  pageRichTextSchema,
  plainTextSchema,
  richTextSchema,
} from "../catalogue/rich-text.ts";
import { toFieldErrors } from "../validation/errors.ts";
import {
  CONTENT_BLOCKS,
  CONTENT_BLOCK_KEYS,
  NAV_MENUS,
  isAllowedSocialUrl,
  isContentBlockKey,
  isNavMenu,
  navMenuSchema,
} from "./blocks.ts";

const ID = "0192f0e2-0000-7000-8000-000000000001";
const codes = (
  schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } },
  value: unknown,
) => {
  const r = schema.safeParse(value);
  return r.success
    ? []
    : toFieldErrors(r.error as never).map((e) => `${e.path}:${e.code}`);
};
const schemaOf = (key: keyof typeof CONTENT_BLOCKS) =>
  CONTENT_BLOCKS[key].schema;

const slide = {
  desktopImageId: ID,
  mobileImageId: ID,
  alt: "TEST model in an ivory kurta",
  ctaLabel: "Shop the edit",
  ctaTarget: { kind: "COLLECTION", id: ID },
};

describe("registry (Q10-1)", () => {
  it("has exactly the approved keys and types; no CATEGORY_PILLS block (Q10-3)", () => {
    expect(
      Object.fromEntries(
        CONTENT_BLOCK_KEYS.map((k) => [k, CONTENT_BLOCKS[k].type]),
      ),
    ).toEqual({
      "site.announcement": "ANNOUNCEMENT_BAR",
      "home.hero": "HERO_SLIDE",
      "home.newIns": "PRODUCT_ROW",
      "home.row2": "PRODUCT_ROW",
      "home.tabbedGrid": "TABBED_GRID",
      "home.editorial": "EDITORIAL_BAND",
      "site.footer": "FOOTER",
    });
    expect(isContentBlockKey("home.hero")).toBe(true);
    for (const bad of [
      "home.pills",
      "constructor",
      "__proto__",
      "toString",
      "",
    ])
      expect(isContentBlockKey(bad)).toBe(false);
  });
});

describe("announcement", () => {
  it("accepts plain text up to 90 characters with an internal link and a window", () => {
    expect(
      codes(schemaOf("site.announcement"), {
        text: "Free shipping across India",
        link: { kind: "PATH", path: "/collections/eid-edit" },
        startsAt: "2026-11-01T00:00:00+05:30",
        endsAt: "2026-11-15T00:00:00+05:30",
      }),
    ).toEqual([]);
  });

  it("refuses HTML, control characters, long text, external links and a reversed window", () => {
    const s = schemaOf("site.announcement");
    expect(codes(s, { text: "<b>Sale</b>" })).toEqual(["text:INVALID"]);
    expect(codes(s, { text: "Sale\nnow" })).toEqual([
      "text:TEXT_INVALID_CHARACTERS",
    ]);
    expect(codes(s, { text: "x".repeat(91) })).toEqual(["text:TOO_LONG"]);
    expect(codes(s, { text: "  " })).toEqual(["text:REQUIRED"]);
    expect(
      codes(s, {
        text: "Sale",
        link: { kind: "PATH", path: "https://evil.example" },
      }),
    ).toEqual(["link.path:LINK_NOT_INTERNAL"]);
    expect(
      codes(s, {
        text: "Sale",
        startsAt: "2026-11-02T00:00:00Z",
        endsAt: "2026-11-01T00:00:00Z",
      }),
    ).toEqual(["endsAt:INVALID"]);
    expect(codes(s, { text: "Sale", extra: 1 })).toEqual([
      "extra:UNKNOWN_FIELD",
    ]);
  });
});

describe("hero (Q10-2)", () => {
  it("accepts 1 to 5 ordered slides", () => {
    expect(codes(schemaOf("home.hero"), { slides: [slide] })).toEqual([]);
    expect(
      codes(schemaOf("home.hero"), { slides: Array(5).fill(slide) }),
    ).toEqual([]);
  });

  it("refuses no slides, six slides, a missing alt and a bad focal point", () => {
    const s = schemaOf("home.hero");
    expect(codes(s, { slides: [] })).toEqual(["slides:TOO_SHORT"]);
    expect(codes(s, { slides: Array(6).fill(slide) })).toEqual([
      "slides:TOO_LONG",
    ]);
    expect(codes(s, { slides: [{ ...slide, alt: "" }] })).toEqual([
      "slides.0.alt:REQUIRED",
    ]);
    expect(
      codes(s, { slides: [{ ...slide, focalPoint: { x: 2, y: 0 } }] }),
    ).toHaveLength(1);
    expect(
      codes(s, {
        slides: [{ ...slide, ctaTarget: { kind: "URL", url: "/x" } }],
      }),
    ).toHaveLength(1);
  });
});

describe("product rows and the tabbed grid", () => {
  it("New Ins is always the newest products", () => {
    expect(
      codes(schemaOf("home.newIns"), {
        title: "New Ins",
        source: { kind: "NEWEST" },
        maxItems: 12,
      }),
    ).toEqual([]);
    expect(
      codes(schemaOf("home.newIns"), {
        title: "New Ins",
        source: { kind: "COLLECTION", id: ID },
        maxItems: 12,
      }),
    ).not.toEqual([]);
  });

  it("accepts each source; manual lists are unique and bounded", () => {
    for (const source of [
      { kind: "NEWEST" },
      { kind: "COLLECTION", id: ID },
      { kind: "CATEGORY", id: ID },
      { kind: "MANUAL", productIds: [ID] },
    ])
      expect(
        codes(schemaOf("home.row2"), { title: "Festive", source, maxItems: 8 }),
        JSON.stringify(source),
      ).toEqual([]);
    expect(
      codes(schemaOf("home.row2"), {
        title: "x",
        source: { kind: "MANUAL", productIds: [ID, ID] },
        maxItems: 8,
      }),
    ).toEqual(["source.productIds:INVALID"]);
    expect(
      codes(schemaOf("home.row2"), {
        title: "x",
        source: { kind: "NEWEST" },
        maxItems: 3,
      }),
    ).toEqual(["maxItems:TOO_SHORT"]);
  });

  it("needs 2 to 5 tabs", () => {
    const tab = { label: "Kurtas", source: { kind: "CATEGORY", id: ID } };
    expect(
      codes(schemaOf("home.tabbedGrid"), { tabs: [tab, tab], maxItems: 8 }),
    ).toEqual([]);
    expect(
      codes(schemaOf("home.tabbedGrid"), { tabs: [tab], maxItems: 8 }),
    ).toEqual(["tabs:TOO_SHORT"]);
  });
});

describe("footer and social links (Q10-3, Q10-4)", () => {
  it("accepts contact details and allow-listed https social links", () => {
    expect(
      codes(schemaOf("site.footer"), {
        contact: {
          addressLines: ["TEST address line"],
          hours: "10 am to 7 pm",
          email: "hello@example.test",
        },
        social: [
          { network: "INSTAGRAM", url: "https://www.instagram.com/example" },
          { network: "WHATSAPP", url: "https://wa.me/910000000000" },
        ],
      }),
    ).toEqual([]);
  });

  it("refuses http, other hosts, user info, ports, look-alike hosts and link groups", () => {
    for (const url of [
      "http://instagram.com/x",
      "https://evil.example/x",
      "https://instagram.com@evil.example/",
      "https://instagram.com:8443/x",
      "https://instagram.com.evil.example/x",
      "https://instagram.com/x#frag",
      "javascript:alert(1)",
    ])
      expect(isAllowedSocialUrl("INSTAGRAM", url), url).toBe(false);
    expect(isAllowedSocialUrl("FACEBOOK", "https://www.instagram.com/x")).toBe(
      false,
    );
    expect(codes(schemaOf("site.footer"), { linkGroups: [] })).toEqual([
      "linkGroups:UNKNOWN_FIELD",
    ]);
  });
});

describe("navigation (Q10-3)", () => {
  it("allow-lists the menus with their limits", () => {
    expect(Object.keys(NAV_MENUS)).toEqual([
      "HEADER",
      "CATEGORY_PILLS",
      "FOOTER_SHOP",
      "FOOTER_HELP",
      "FOOTER_ABOUT",
    ]);
    expect(isNavMenu("HEADER")).toBe(true);
    expect(isNavMenu("SIDEBAR")).toBe(false);
  });

  it("accepts entity targets and internal paths; refuses external URLs and too many items", () => {
    const s = navMenuSchema("HEADER");
    expect(
      codes(s, {
        items: [
          { label: "Kurtas", target: { kind: "CATEGORY", id: ID } },
          { label: "Search", target: { kind: "URL", url: "/search" } },
        ],
      }),
    ).toEqual([]);
    expect(
      codes(s, {
        items: [
          { label: "Evil", target: { kind: "URL", url: "//evil.example" } },
        ],
      }),
    ).toEqual(["items.0.target.url:LINK_NOT_INTERNAL"]);
    expect(
      codes(s, {
        items: Array(13).fill({ label: "x", target: { kind: "PAGE", id: ID } }),
      }),
    ).toEqual(["items:TOO_LONG"]);
    expect(
      codes(navMenuSchema("CATEGORY_PILLS"), {
        items: Array(20).fill({ label: "x", target: { kind: "PAGE", id: ID } }),
      }),
    ).toEqual([]);
  });
});

describe("page rich text (Q10-6)", () => {
  const image = { type: "image", mediaAssetId: ID, alt: "TEST image" };

  it("pages accept images with alt text; product descriptions do not", () => {
    expect(
      pageRichTextSchema.safeParse({ type: "doc", content: [image] }).success,
    ).toBe(true);
    expect(
      richTextSchema.safeParse({ type: "doc", content: [image] }).success,
    ).toBe(false);
    expect(
      codes(pageRichTextSchema, {
        type: "doc",
        content: [{ ...image, alt: "" }],
      }),
    ).toEqual(["content.0.alt:REQUIRED"]);
    expect(
      pageRichTextSchema.safeParse({
        type: "doc",
        content: [{ ...image, src: "https://x" }],
      }).success,
    ).toBe(false);
  });

  it("plain text refuses markup and control characters", () => {
    expect(plainTextSchema(1, 10).safeParse("<img src=x>").success).toBe(false);
    expect(plainTextSchema(1, 10).safeParse("ok\u0000").success).toBe(false);
    expect(plainTextSchema(0, 10).safeParse("").success).toBe(true);
  });
});
