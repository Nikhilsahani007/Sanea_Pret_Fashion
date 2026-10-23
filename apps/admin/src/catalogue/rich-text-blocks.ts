// The description editor's model (phase-8-ui-plan.md §3.4, safeguard 2): a
// list of blocks edited as plain text, converted to and from the structured
// rich-text JSON (Q8-10, R2: words under `text`). No HTML is produced or read.
// Inline syntax: **bold**, _italic_, [link text](/products/slug).
import {
  richTextSchema,
  toFieldErrors,
  type PageRichText,
} from "@sanea/shared";

export type BlockKind =
  "paragraph" | "h2" | "h3" | "bulletList" | "orderedList" | "image";

/** Text blocks use `text`; image blocks (pages only, Q10-6) use the image fields. */
export type Block = {
  id: string;
  kind: BlockKind;
  text: string;
  mediaAssetId?: string;
  alt?: string;
  caption?: string;
};

export const BLOCK_LABELS: Record<Exclude<BlockKind, "image">, string> = {
  paragraph: "Paragraph",
  h2: "Heading",
  h3: "Subheading",
  bulletList: "Bulleted list",
  orderedList: "Numbered list",
};

/** The page document: rich text plus image blocks. Descriptions never contain images. */
type Doc = PageRichText;
type DocBlock = Doc["content"][number];
type Paragraph = Extract<DocBlock, { type: "paragraph" }>;
type Schema = {
  safeParse: (v: unknown) => {
    success: boolean;
    data?: unknown;
    error?: unknown;
  };
};
type Inline = Paragraph["content"][number];
type TextNode = Extract<Inline, { type: "text" }>;
type Mark = "bold" | "italic";

let counter = 0;
export const newBlockId = () => `b${++counter}`;

function textNode(text: string, marks: Mark[]): TextNode {
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

/** Bold and italic spans in a run of text (no links). */
function parseMarks(source: string, outer: Mark[] = []): TextNode[] {
  const out: TextNode[] = [];
  const pattern = /\*\*(.+?)\*\*|_(.+?)_/g;
  let last = 0;
  for (const m of source.matchAll(pattern)) {
    if (m.index > last) out.push(textNode(source.slice(last, m.index), outer));
    if (m[1] !== undefined)
      out.push(...parseMarks(m[1], [...new Set<Mark>([...outer, "bold"])]));
    else
      out.push(...parseMarks(m[2]!, [...new Set<Mark>([...outer, "italic"])]));
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push(textNode(source.slice(last), outer));
  return out;
}

/** Inline content of one paragraph: text with marks and internal links. */
export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const link = /\[([^\]]+)\]\(([^)\s]*)\)/g;
  let last = 0;
  for (const m of source.matchAll(link)) {
    if (m.index > last) out.push(...parseMarks(source.slice(last, m.index)));
    out.push({ type: "link", href: m[2]!, content: parseMarks(m[1]!) });
    last = m.index + m[0].length;
  }
  if (last < source.length) out.push(...parseMarks(source.slice(last)));
  return out;
}

function markText(node: TextNode): string {
  let t = node.text;
  if (node.marks?.includes("italic")) t = `_${t}_`;
  if (node.marks?.includes("bold")) t = `**${t}**`;
  return t;
}

export function inlineToText(content: readonly Inline[]): string {
  return content
    .map((n) =>
      n.type === "link"
        ? `[${n.content.map(markText).join("")}](${n.href})`
        : markText(n),
    )
    .join("");
}

/** Line breaks are not allowed inside a text node; a new block is used instead. */
const oneLine = (text: string) => text.replace(/\s*\n+\s*/g, " ").trim();

export function blocksToDoc(blocks: readonly Block[]): Doc {
  const content: DocBlock[] = [];
  for (const b of blocks) {
    if (b.kind === "image") {
      if (b.mediaAssetId)
        content.push({
          type: "image",
          mediaAssetId: b.mediaAssetId,
          alt: (b.alt ?? "").trim(),
          ...(b.caption?.trim() ? { caption: b.caption.trim() } : {}),
        });
    } else if (b.kind === "paragraph") {
      const text = oneLine(b.text);
      if (text) content.push({ type: "paragraph", content: parseInline(text) });
    } else if (b.kind === "h2" || b.kind === "h3") {
      const text = oneLine(b.text);
      if (text)
        content.push({
          type: "heading",
          level: b.kind === "h2" ? 2 : 3,
          content: parseMarks(text),
        });
    } else {
      const items = b.text
        .split("\n")
        .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
        .filter(Boolean)
        .map((line) => ({
          type: "paragraph" as const,
          content: parseInline(line),
        }));
      if (items.length) content.push({ type: b.kind, items });
    }
  }
  return { type: "doc", content };
}

export function docToBlocks(doc: Doc): Block[] {
  return doc.content.map((b): Block => {
    if (b.type === "image")
      return {
        id: newBlockId(),
        kind: "image",
        text: "",
        mediaAssetId: b.mediaAssetId,
        alt: b.alt,
        caption: b.caption ?? "",
      };
    if (b.type === "paragraph")
      return {
        id: newBlockId(),
        kind: "paragraph",
        text: inlineToText(b.content),
      };
    if (b.type === "heading")
      return {
        id: newBlockId(),
        kind: b.level === 2 ? "h2" : "h3",
        text: inlineToText(b.content),
      };
    return {
      id: newBlockId(),
      kind: b.type,
      text: b.items.map((i) => inlineToText(i.content)).join("\n"),
    };
  });
}

/**
 * Reads a stored description. Anything that is not valid structured rich text
 * (for example unexpected legacy JSON) is reported instead of being guessed at.
 */
export function readStored(
  value: unknown,
  schema: Schema = richTextSchema,
): { ok: true; blocks: Block[] } | { ok: false } {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, blocks: docToBlocks(parsed.data as Doc) }
    : { ok: false };
}

const PROBLEMS: Record<string, string> = {
  LINK_NOT_INTERNAL:
    "Links must point to a page on this site, such as /products/silk-kurta or /collections/eid.",
  TEXT_INVALID_CHARACTERS: "Remove control characters.",
  TOO_LONG: "This block is too long.",
  INVALID: "Remove anything that looks like HTML, such as <b>.",
  REQUIRED: "Describe the image for people who cannot see it.",
};

/** Problems per block index, using the same schema the API applies. */
export function blockProblems(
  blocks: readonly Block[],
  schema: Schema = richTextSchema,
): Map<number, string> {
  const problems = new Map<number, string>();
  // Map each non-empty block to its position in the document.
  const docIndex: number[] = [];
  blocks.forEach((b, i) => {
    if (b.kind === "image" ? Boolean(b.mediaAssetId) : b.text.trim())
      docIndex.push(i);
  });
  const result = schema.safeParse(blocksToDoc(blocks));
  if (result.success) return problems;
  for (const error of toFieldErrors(result.error as never)) {
    const m = /^content\.(\d+)/.exec(error.path);
    const blockIndex = m ? docIndex[Number(m[1])] : undefined;
    const key = blockIndex ?? -1;
    if (!problems.has(key))
      problems.set(key, PROBLEMS[error.code] ?? "Check this block.");
  }
  return problems;
}
