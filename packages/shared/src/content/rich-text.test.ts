import { describe, expect, it } from "vitest";

import { richTextSchema, safeHrefSchema } from "./rich-text.ts";

describe("richTextSchema", () => {
  it("accepts every block type", () => {
    const result = richTextSchema.safeParse({
      blocks: [
        { type: "heading", level: 2, text: "Care" },
        { type: "paragraph", text: "Dry clean only." },
        { type: "list", items: ["Cotton", "Hand finished"] },
        { type: "link", text: "Size guide", href: "/pages/size-guide" },
        {
          type: "image",
          mediaAssetId: "01920000-0000-7000-8000-000000000000",
          alt: "Detail of the hem",
        },
      ],
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.blocks[2]).toHaveProperty("ordered", false);
  });

  it("rejects HTML-like or unknown blocks and fields", () => {
    for (const blocks of [
      [{ type: "html", html: "<script>alert(1)</script>" }],
      [{ type: "paragraph", text: "x", html: "<b>x</b>" }],
      [{ type: "heading", level: 1, text: "Too big" }],
      [{ type: "paragraph", text: "bell\u0007" }],
      [{ type: "paragraph", text: "   " }],
    ]) {
      expect(richTextSchema.safeParse({ blocks }).success).toBe(false);
    }
  });

  it("treats script text as inert text, not markup", () => {
    const parsed = richTextSchema.parse({
      blocks: [{ type: "paragraph", text: "<script>alert(1)</script>" }],
    });
    expect(parsed.blocks[0]).toEqual({
      type: "paragraph",
      text: "<script>alert(1)</script>",
    });
  });
});

describe("safeHrefSchema", () => {
  it.each([
    "/collections/festive",
    "https://wa.me/919876543210",
    "mailto:care@example.test",
    "tel:+91 98765 43210",
  ])("accepts %s", (href) => {
    expect(safeHrefSchema.safeParse(href).success).toBe(true);
  });
  it.each([
    "javascript:alert(1)",
    "data:text/html,x",
    "//evil.example",
    "http://insecure.example",
    "JaVaScRiPt:alert(1)",
    "/a b",
  ])("rejects %s", (href) => {
    expect(safeHrefSchema.safeParse(href).success).toBe(false);
  });
});
