// The description editor's model against the shared richTextSchema (safeguard 2).
import { richTextSchema } from "@sanea/shared";
import { describe, expect, it } from "vitest";

import {
  blockProblems,
  blocksToDoc,
  docToBlocks,
  parseInline,
  readStored,
  type Block,
} from "./rich-text-blocks.ts";

const b = (kind: Block["kind"], text: string): Block => ({
  id: kind + text,
  kind,
  text,
});

describe("blocks to rich text", () => {
  it("produces schema-valid JSON with words under `text` (R2)", () => {
    const doc = blocksToDoc([
      b("h2", "Fabric and care"),
      b(
        "paragraph",
        "Pure **silk** with _hand_ embroidery. See [the Eid edit](/collections/eid-edit).",
      ),
      b("bulletList", "- Dry clean only\n- Steam, do not iron\n\n"),
      b("orderedList", "1. Unfold\n2) Steam"),
      b("paragraph", "   "),
    ]);
    expect(richTextSchema.safeParse(doc).success).toBe(true);
    expect(doc).toEqual({
      type: "doc",
      content: [
        {
          type: "heading",
          level: 2,
          content: [{ type: "text", text: "Fabric and care" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Pure " },
            { type: "text", text: "silk", marks: ["bold"] },
            { type: "text", text: " with " },
            { type: "text", text: "hand", marks: ["italic"] },
            { type: "text", text: " embroidery. See " },
            {
              type: "link",
              href: "/collections/eid-edit",
              content: [{ type: "text", text: "the Eid edit" }],
            },
            { type: "text", text: "." },
          ],
        },
        {
          type: "bulletList",
          items: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Dry clean only" }],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Steam, do not iron" }],
            },
          ],
        },
        {
          type: "orderedList",
          items: [
            { type: "paragraph", content: [{ type: "text", text: "Unfold" }] },
            { type: "paragraph", content: [{ type: "text", text: "Steam" }] },
          ],
        },
      ],
    });
  });

  it("round-trips through the editor text", () => {
    const blocks = [
      b(
        "paragraph",
        "A **_bold italic_** word and [a link](/products/rose-kurta).",
      ),
      b("h3", "Details"),
      b("bulletList", "One\nTwo"),
    ];
    const again = docToBlocks(blocksToDoc(blocks));
    expect(blocksToDoc(again)).toEqual(blocksToDoc(blocks));
    expect(again.map((x) => [x.kind, x.text])).toEqual([
      [
        "paragraph",
        "A **_bold italic_** word and [a link](/products/rose-kurta).",
      ],
      ["h3", "Details"],
      ["bulletList", "One\nTwo"],
    ]);
  });

  it("joins line breaks inside a paragraph instead of storing control characters", () => {
    const doc = blocksToDoc([b("paragraph", "Line one\nline two")]);
    expect(doc.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Line one line two" }],
    });
  });
});

describe("problems, with the API's own rules", () => {
  it("rejects external and script links, and HTML-like text, per block", () => {
    const problems = blockProblems([
      b("paragraph", "Fine text"),
      b("paragraph", "[shop](https://evil.example)"),
      b("paragraph", "[x](javascript:alert(1))"),
      b("paragraph", "Hello <b>bold</b>"),
    ]);
    expect(problems.get(0)).toBeUndefined();
    expect(problems.get(1)).toMatch(/on this site/);
    expect(problems.get(2)).toBeDefined();
    expect(problems.get(3)).toMatch(/HTML/);
  });

  it("parses only bracket-and-parenthesis links", () => {
    expect(parseInline("plain [not a link] (either)")).toEqual([
      { type: "text", text: "plain [not a link] (either)" },
    ]);
  });
});

describe("stored descriptions", () => {
  it("reads valid documents and refuses unexpected legacy JSON safely", () => {
    expect(readStored({ type: "doc", content: [] })).toEqual({
      ok: true,
      blocks: [],
    });
    expect(
      readStored({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", value: "old" }] },
        ],
      }),
    ).toEqual({ ok: false });
    expect(readStored("<p>html</p>")).toEqual({ ok: false });
    expect(readStored(null)).toEqual({ ok: false });
  });
});
