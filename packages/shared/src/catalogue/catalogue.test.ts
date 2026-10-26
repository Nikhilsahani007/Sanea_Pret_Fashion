import { describe, expect, it } from "vitest";

import { toFieldErrors } from "../validation/errors.ts";
import { availabilityOf } from "./availability.ts";
import { productLabelSchema } from "./labels.ts";
import { isInternalLink, richTextSchema } from "./rich-text.ts";
import { slugSchema } from "./slug.ts";

const codes = (
  schema: { safeParse: (v: unknown) => unknown },
  value: unknown,
) => {
  const r = schema.safeParse(value) as {
    success: boolean;
    error?: Parameters<typeof toFieldErrors>[0];
  };
  return r.success ? [] : toFieldErrors(r.error!).map((e) => e.code);
};

describe("slugSchema", () => {
  it.each(["kurta", "ivory-anarkali-2", "a1"])("accepts %s", (s) => {
    expect(slugSchema.safeParse(s).success).toBe(true);
  });
  it.each([
    "Kurta",
    "-kurta",
    "kurta-",
    "ivory--anarkali",
    "kurta set",
    "kürta",
    "",
  ])("rejects %j", (s) => {
    expect(codes(slugSchema, s)).toContain("SLUG_INVALID");
  });
  it("rejects slugs over 100 characters", () => {
    expect(codes(slugSchema, "a".repeat(101))).toContain("TOO_LONG");
  });
});

describe("productLabelSchema", () => {
  it("accepts NEW only (Q8-8)", () => {
    expect(productLabelSchema.safeParse("NEW").success).toBe(true);
    for (const v of ["BESTSELLER", "TRENDING", "new", ""])
      expect(productLabelSchema.safeParse(v).success).toBe(false);
  });
});

describe("availabilityOf (D-082, Q8-2)", () => {
  const t = 2;
  it.each([
    [0, 0, { availability: "SOLD_OUT" }],
    [3, 3, { availability: "SOLD_OUT" }],
    [1, 0, { availability: "LOW_STOCK", remaining: 1 }],
    [2, 0, { availability: "LOW_STOCK", remaining: 2 }],
    [5, 3, { availability: "LOW_STOCK", remaining: 2 }],
    [3, 0, { availability: "IN_STOCK" }],
    [100, 1, { availability: "IN_STOCK" }],
  ])("onHand %i, reserved %i", (onHand, reserved, expected) => {
    expect(availabilityOf({ onHand, reserved, lowStockThreshold: t })).toEqual(
      expected,
    );
  });
  it("never exposes a count above the threshold", () => {
    expect(
      availabilityOf({ onHand: 50, reserved: 0, lowStockThreshold: 2 }),
    ).not.toHaveProperty("remaining");
  });
});

const doc = (content: unknown[]) => ({ type: "doc", content });
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string) => ({ type: "text", text: t });
const link = (href: string) => ({ type: "link", href, content: [text("see")] });

describe("richTextSchema (Q8-10, R2, safeguard 2)", () => {
  it("accepts paragraphs, headings, lists, marks and internal links", () => {
    const value = doc([
      { type: "heading", level: 2, content: [text("Fabric")] },
      para(
        { type: "text", text: "Hand-block printed", marks: ["bold"] },
        link("/collections/summer-edit"),
      ),
      {
        type: "bulletList",
        items: [para(text("Cotton")), para(text("Mulmul"))],
      },
    ]);
    expect(richTextSchema.safeParse(value).success).toBe(true);
  });

  it("stores words under `text` (R2)", () => {
    const parsed = richTextSchema.parse(doc([para(text("Chikankari"))]));
    expect(parsed.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Chikankari" }],
    });
  });

  it.each([
    "/",
    "/products/ivory-anarkali",
    "/collections/summer-edit",
    "/categories/kurtas",
    "/shop",
    "/shop/kurtas",
    "/new-in",
    "/pages/rehma-foundation",
    "/search",
    "/search?q=anarkali",
  ])("allows internal link %s", (href) => {
    expect(isInternalLink(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>",
    "vbscript:msgbox",
    "http://example.com",
    "https://example.com",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil",
    "/products/../admin",
    "/products/ivory\nanarkali",
    "/products/ivory%0aanarkali",
    "/admin",
    "products/kurta",
    " /products/kurta",
    "",
  ])("rejects link %j", (href) => {
    expect(isInternalLink(href)).toBe(false);
    expect(codes(richTextSchema, doc([para(link(href))]))).toContain(
      href.length > 200 ? "TOO_LONG" : "LINK_NOT_INTERNAL",
    );
  });

  it.each([
    "<script>alert(1)</script>",
    "a <b>bold</b>",
    "<img src=x>",
    "</p>",
    "<!-- c -->",
  ])("rejects HTML-like text %j", (t) => {
    expect(richTextSchema.safeParse(doc([para(text(t))])).success).toBe(false);
  });

  it("allows a plain less-than sign in prose", () => {
    expect(
      richTextSchema.safeParse(doc([para(text("size < 40 in"))])).success,
    ).toBe(true);
  });

  it.each(["line\nbreak", "tab\there", "nul\u0000", "c1\u0085"])(
    "rejects control characters %j",
    (t) => {
      expect(codes(richTextSchema, doc([para(text(t))]))).toContain(
        "TEXT_INVALID_CHARACTERS",
      );
    },
  );

  it("rejects unknown node types and unknown fields", () => {
    expect(
      richTextSchema.safeParse(doc([{ type: "html", value: "<b>x</b>" }]))
        .success,
    ).toBe(false);
    expect(
      codes(richTextSchema, doc([para({ ...text("x"), style: "color:red" })])),
    ).toContain("UNKNOWN_FIELD");
    expect(
      richTextSchema.safeParse({ type: "doc", content: [], html: "<b>" })
        .success,
    ).toBe(false);
  });

  it("enforces size limits", () => {
    expect(
      richTextSchema.safeParse(doc([para(text("x".repeat(2001)))])).success,
    ).toBe(false);
    expect(
      richTextSchema.safeParse(doc(Array.from({ length: 201 }, () => para())))
        .success,
    ).toBe(false);
  });

  it("rejects the Phase 6 seed's old `blocks` shape", () => {
    expect(
      richTextSchema.safeParse({ blocks: [{ type: "paragraph", text: "x" }] })
        .success,
    ).toBe(false);
  });
});
