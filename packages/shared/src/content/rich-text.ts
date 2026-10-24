import { z } from "zod";

import { unknownFieldError } from "../validation/schema-helpers.ts";

// Structured rich text (system-design.md §7, D-109): stored as JSON and
// rendered by an allow-listed renderer. There is no HTML anywhere in it.

/** No control characters except line feeds inside paragraphs. */
// eslint-disable-next-line no-control-regex -- deliberately matches control characters to reject them
const SAFE_TEXT = /^[^\u0000-\u0009\u000B-\u001F\u007F]*$/;

const text = (max: number) =>
  z
    .string({ error: "INVALID_TYPE" })
    .trim()
    .min(1, { error: "TOO_SHORT" })
    .max(max, { error: "TOO_LONG" })
    .regex(SAFE_TEXT, { error: "TEXT_INVALID_CHARACTERS" });

/**
 * Links are site-relative paths, https URLs, `mailto:` or `tel:`. Anything
 * else, including `javascript:` and `data:`, is rejected.
 */
export const safeHrefSchema = z
  .string({ error: "INVALID_TYPE" })
  .max(500, { error: "TOO_LONG" })
  .refine(
    (v) =>
      /^\/(?!\/)[^\s]*$/.test(v) ||
      /^https:\/\/[^\s/]+[^\s]*$/.test(v) ||
      /^mailto:[^\s@]+@[^\s@]+$/.test(v) ||
      /^tel:\+?[0-9 -]{6,20}$/.test(v),
    { error: "INVALID" },
  );

const strict = <T extends z.ZodRawShape>(shape: T) =>
  z.strictObject(shape, { error: unknownFieldError });

const paragraph = strict({
  type: z.literal("paragraph"),
  text: text(5000),
});
const heading = strict({
  type: z.literal("heading"),
  level: z.union([z.literal(2), z.literal(3)]),
  text: text(200),
});
const list = strict({
  type: z.literal("list"),
  ordered: z.boolean().default(false),
  items: z.array(text(1000)).min(1).max(50),
});
const link = strict({
  type: z.literal("link"),
  text: text(200),
  href: safeHrefSchema,
});
const image = strict({
  type: z.literal("image"),
  mediaAssetId: z.uuid({ error: "INVALID" }),
  alt: text(300),
});

export const richTextBlockSchema = z.discriminatedUnion(
  "type",
  [paragraph, heading, list, link, image],
  { error: "INVALID_OPTION" },
);

export const richTextSchema = strict({
  blocks: z.array(richTextBlockSchema).max(200, { error: "TOO_LONG" }),
});

export type RichTextBlock = z.infer<typeof richTextBlockSchema>;
export type RichText = z.infer<typeof richTextSchema>;
