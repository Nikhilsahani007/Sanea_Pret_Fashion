import { z } from "zod";

import { unknownFieldError } from "../validation/schema-helpers.ts";

/**
 * Structured rich text (Q8-10) for product descriptions and, from Phase 10,
 * pages. Stored as JSON and rendered through an allow-list renderer; never
 * HTML (security-design.md §3).
 *
 * Contract (R2, 2026-10-22): text nodes store their words as a string under
 * the key `text`. Search indexes exactly those values
 * (`product_search_document` in the catalogue_search migration).
 *
 * Links are internal only (Phase 8 safeguard 2): a path on this site from the
 * allowed patterns below. Schemes (`javascript:`, `data:`, `http:` and all
 * others), protocol-relative `//host`, backslashes and control characters
 * cannot match.
 */
export const INTERNAL_LINK_PATTERN =
  /^\/(?:(?:products|collections|categories|shop|pages)\/[a-z0-9]+(?:-[a-z0-9]+)*|shop|new-in|search(?:\?q=[a-z0-9+%-]{1,100})?)?$/;

export const RICH_TEXT_LIMITS = {
  /** Characters in one text node. */
  text: 2000,
  /** Inline nodes in one paragraph or heading, items in one list. */
  inline: 200,
  /** Blocks in a document. */
  blocks: 200,
} as const;

/** Rejects markup-looking text: no HTML is accepted or stored. */
const HTML_LIKE = /<\s*[a-zA-Z!/?]/;
// Tab, line breaks and other C0/C1 controls; paragraphs separate lines instead.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export function isInternalLink(href: string): boolean {
  return INTERNAL_LINK_PATTERN.test(href);
}

const strict = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, { error: unknownFieldError });

const textNode = strict({
  type: z.literal("text"),
  text: z
    .string()
    .min(1, { error: "TOO_SHORT" })
    .max(RICH_TEXT_LIMITS.text, { error: "TOO_LONG" })
    .refine((t) => !CONTROL.test(t), { error: "TEXT_INVALID_CHARACTERS" })
    .refine((t) => !HTML_LIKE.test(t), { error: "INVALID" }),
  marks: z
    .array(z.enum(["bold", "italic"]))
    .max(2)
    .refine((m) => new Set(m).size === m.length, { error: "INVALID" })
    .optional(),
});

const linkNode = strict({
  type: z.literal("link"),
  href: z
    .string()
    .max(200, { error: "TOO_LONG" })
    .refine(isInternalLink, { error: "LINK_NOT_INTERNAL" }),
  content: z.array(textNode).min(1).max(RICH_TEXT_LIMITS.inline),
});

const inline = z.discriminatedUnion("type", [textNode, linkNode]);

const paragraph = strict({
  type: z.literal("paragraph"),
  content: z.array(inline).max(RICH_TEXT_LIMITS.inline),
});

const heading = strict({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3)]),
  content: z.array(textNode).min(1).max(RICH_TEXT_LIMITS.inline),
});

const list = strict({
  type: z.enum(["bulletList", "orderedList"]),
  items: z.array(paragraph).min(1).max(RICH_TEXT_LIMITS.inline),
});

const block = z.union([paragraph, heading, list]);

export const richTextSchema = strict({
  type: z.literal("doc"),
  content: z.array(block).max(RICH_TEXT_LIMITS.blocks),
});

export type RichText = z.infer<typeof richTextSchema>;

/** An empty document, for new products. */
export const EMPTY_RICH_TEXT: RichText = { type: "doc", content: [] };

/**
 * Pages only (Phase 10, Q10-6): an image block referencing a media asset, with
 * required alt text. Product descriptions keep refusing images.
 */
const imageBlock = strict({
  type: z.literal("image"),
  mediaAssetId: z.uuid({ error: "INVALID" }),
  alt: z
    .string()
    .trim()
    .min(1, { error: "REQUIRED" })
    .max(200, { error: "TOO_LONG" })
    .refine((t) => !CONTROL.test(t), { error: "TEXT_INVALID_CHARACTERS" })
    .refine((t) => !HTML_LIKE.test(t), { error: "INVALID" }),
  caption: z
    .string()
    .trim()
    .max(200, { error: "TOO_LONG" })
    .refine((t) => !CONTROL.test(t), { error: "TEXT_INVALID_CHARACTERS" })
    .refine((t) => !HTML_LIKE.test(t), { error: "INVALID" })
    .optional(),
});

export const pageRichTextSchema = strict({
  type: z.literal("doc"),
  content: z
    .array(z.union([paragraph, heading, list, imageBlock]))
    .max(RICH_TEXT_LIMITS.blocks),
});

export type PageRichText = z.infer<typeof pageRichTextSchema>;

/**
 * Plain text for content fields (labels, campaign lines): trimmed, bounded,
 * never markup or control characters, the same refusals as rich text.
 */
export function plainTextSchema(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, { error: min > 0 ? "REQUIRED" : "TOO_SHORT" })
    .max(max, { error: "TOO_LONG" })
    .refine((t) => !CONTROL.test(t), { error: "TEXT_INVALID_CHARACTERS" })
    .refine((t) => !HTML_LIKE.test(t), { error: "INVALID" });
}
