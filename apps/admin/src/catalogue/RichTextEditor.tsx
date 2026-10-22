// The description block editor: plain text areas, one per block, with
// move up, move down and remove buttons (no dragging), and a preview built
// from React elements through an allow-list (never HTML strings).
import { Fragment, type ReactNode } from "react";

import { Button, SelectField, TextArea } from "../ui/controls.tsx";
import { Cluster, Stack, ui } from "../ui/feedback.tsx";
import {
  BLOCK_LABELS,
  blockProblems,
  blocksToDoc,
  newBlockId,
  type Block,
  type BlockKind,
} from "./rich-text-blocks.ts";
import s from "./catalogue.module.css";

type Props = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabled?: boolean;
  serverError?: string | undefined;
};

export function RichTextEditor({
  blocks,
  onChange,
  disabled,
  serverError,
}: Props) {
  const problems = blockProblems(blocks);
  const update = (i: number, patch: Partial<Block>) =>
    onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...blocks];
    const [b] = next.splice(i, 1);
    next.splice(i + by, 0, b!);
    onChange(next);
  };
  const add = (kind: BlockKind) =>
    onChange([...blocks, { id: newBlockId(), kind, text: "" }]);

  return (
    <Stack gap="4">
      <p className={ui.hint} id="rte-help">
        Write each paragraph, heading or list in its own block. For lists, put
        each item on its own line. Formatting: **bold**, _italic_ and [link
        text](/products/web-address). Links can only point to pages on this
        site.
      </p>
      {serverError ? <p className={ui.error}>{serverError}</p> : null}
      {problems.get(-1) ? <p className={ui.error}>{problems.get(-1)}</p> : null}
      {blocks.length === 0 ? (
        <p className={ui.muted}>No description yet. Add a block to start.</p>
      ) : null}
      <ol className={s.blocks}>
        {blocks.map((b, i) => (
          <li key={b.id} className={s.block}>
            <Stack gap="3">
              <SelectField
                label={`Block ${i + 1} type`}
                value={b.kind}
                disabled={disabled}
                onChange={(e) =>
                  update(i, { kind: e.target.value as BlockKind })
                }
              >
                {Object.entries(BLOCK_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextArea
                label={`Block ${i + 1} text`}
                value={b.text}
                disabled={disabled}
                rows={b.kind === "h2" || b.kind === "h3" ? 1 : 4}
                onChange={(e) => update(i, { text: e.target.value })}
                error={problems.get(i)}
                optional
                aria-describedby="rte-help"
              />
              {disabled ? null : (
                <Cluster gap="2">
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={`Move block ${i + 1} up`}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={i === blocks.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={`Move block ${i + 1} down`}
                  >
                    Move down
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    onClick={() => onChange(blocks.filter((_, j) => j !== i))}
                    aria-label={`Remove block ${i + 1}`}
                  >
                    Remove
                  </Button>
                </Cluster>
              )}
            </Stack>
          </li>
        ))}
      </ol>
      {disabled ? null : (
        <Cluster gap="2">
          <Button
            variant="secondary"
            size="small"
            onClick={() => add("paragraph")}
          >
            Add paragraph
          </Button>
          <Button variant="secondary" size="small" onClick={() => add("h2")}>
            Add heading
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={() => add("bulletList")}
          >
            Add list
          </Button>
        </Cluster>
      )}
      <details className={s.preview}>
        <summary>Preview</summary>
        <RichTextPreview blocks={blocks} />
      </details>
    </Stack>
  );
}

type Inline =
  | { type: "text"; text: string; marks?: string[] }
  | {
      type: "link";
      href: string;
      content: { type: "text"; text: string; marks?: string[] }[];
    };

function renderText(
  n: { text: string; marks?: string[] },
  key: number,
): ReactNode {
  let node: ReactNode = n.text;
  if (n.marks?.includes("italic")) node = <em>{node}</em>;
  if (n.marks?.includes("bold")) node = <strong>{node}</strong>;
  return <Fragment key={key}>{node}</Fragment>;
}

function renderInline(content: readonly Inline[]): ReactNode[] {
  return content.map((n, i) =>
    n.type === "link" ? (
      // Shown, not followed: the admin has no storefront pages.
      <span key={i} className={s.previewLink}>
        {n.content.map(renderText)}
      </span>
    ) : (
      renderText(n, i)
    ),
  );
}

export function RichTextPreview({ blocks }: { blocks: Block[] }) {
  const doc = blocksToDoc(blocks);
  if (doc.content.length === 0)
    return <p className={ui.muted}>Nothing to preview.</p>;
  return (
    <div className={s.previewBody}>
      {doc.content.map((b, i) => {
        if (b.type === "paragraph")
          return <p key={i}>{renderInline(b.content)}</p>;
        if (b.type === "heading")
          return b.level === 2 ? (
            <h3 key={i}>{renderInline(b.content)}</h3>
          ) : (
            <h4 key={i}>{renderInline(b.content)}</h4>
          );
        const items = b.items.map((it, j) => (
          <li key={j}>{renderInline(it.content)}</li>
        ));
        return b.type === "orderedList" ? (
          <ol key={i}>{items}</ol>
        ) : (
          <ul key={i}>{items}</ul>
        );
      })}
    </div>
  );
}
