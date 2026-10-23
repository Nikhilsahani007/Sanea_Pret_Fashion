// The block editor for product descriptions and pages: plain text areas, one
// per block, with move up, move down and remove buttons (no dragging), and a
// preview built from React elements through an allow-list (never HTML
// strings). With `media`, pages also get image blocks (Q10-6).
import { Fragment, type ReactNode } from "react";

import type { MediaAsset } from "../api/types.ts";
import { Button, SelectField, TextArea, TextField } from "../ui/controls.tsx";
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

type Schema = Parameters<typeof blockProblems>[1];

type Props = {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  disabled?: boolean;
  serverError?: string | undefined;
  /** Pages: the images that image blocks may use. Omitted for descriptions. */
  media?: MediaAsset[];
  schema?: Schema;
};

/** A small WebP thumbnail of an uploaded image, if one exists. */
export const thumbOf = (asset: MediaAsset | undefined) =>
  asset?.derivatives.find((d) => d.format === "webp" && d.width >= 300) ??
  asset?.derivatives.find((d) => d.format === "webp");

export function RichTextEditor({
  blocks,
  onChange,
  disabled,
  serverError,
  media,
  schema,
}: Props) {
  const problems = blockProblems(blocks, schema);
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
        <p className={ui.muted}>Nothing written yet. Add a block to start.</p>
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
                {media ? <option value="image">Image</option> : null}
              </SelectField>
              {b.kind === "image" ? (
                <ImageFields
                  block={b}
                  index={i}
                  media={media ?? []}
                  disabled={disabled}
                  error={problems.get(i)}
                  onChange={(patch) => update(i, patch)}
                />
              ) : (
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
              )}
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
          {media ? (
            <Button
              variant="secondary"
              size="small"
              onClick={() => add("image")}
            >
              Add image
            </Button>
          ) : null}
        </Cluster>
      )}
      <details className={s.preview}>
        <summary>Preview</summary>
        <RichTextPreview blocks={blocks} media={media} />
      </details>
    </Stack>
  );
}

function ImageFields({
  block,
  index,
  media,
  disabled,
  error,
  onChange,
}: {
  block: Block;
  index: number;
  media: MediaAsset[];
  disabled: boolean | undefined;
  error: string | undefined;
  onChange: (patch: Partial<Block>) => void;
}) {
  const thumb = thumbOf(media.find((m) => m.id === block.mediaAssetId));
  return (
    <Stack gap="3">
      <SelectField
        label={`Block ${index + 1} image`}
        hint="From the media library. Upload new images on a product's Images section."
        value={block.mediaAssetId ?? ""}
        disabled={disabled}
        onChange={(e) =>
          onChange({ mediaAssetId: e.target.value || undefined })
        }
      >
        <option value="">Choose an image</option>
        {media.map((m) => (
          <option key={m.id} value={m.id}>
            {m.width} × {m.height} px, uploaded{" "}
            {new Date(m.createdAt).toLocaleDateString("en-IN")}
          </option>
        ))}
      </SelectField>
      {thumb ? (
        <img
          className={s.thumb}
          src={thumb.url}
          alt=""
          width={96}
          height={120}
        />
      ) : null}
      <TextField
        label={`Block ${index + 1} alt text`}
        value={block.alt ?? ""}
        maxLength={200}
        disabled={disabled}
        onChange={(e) => onChange({ alt: e.target.value })}
        error={error}
      />
      <TextField
        label={`Block ${index + 1} caption`}
        optional
        value={block.caption ?? ""}
        maxLength={200}
        disabled={disabled}
        onChange={(e) => onChange({ caption: e.target.value })}
      />
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

export function RichTextPreview({
  blocks,
  media,
}: {
  blocks: Block[];
  media?: MediaAsset[] | undefined;
}) {
  const doc = blocksToDoc(blocks);
  if (doc.content.length === 0)
    return <p className={ui.muted}>Nothing to preview.</p>;
  return (
    <div className={s.previewBody}>
      {doc.content.map((b, i) => {
        if (b.type === "image") {
          const thumb = thumbOf(media?.find((m) => m.id === b.mediaAssetId));
          return (
            <figure key={i}>
              {thumb ? (
                <img className={s.thumb} src={thumb.url} alt={b.alt} />
              ) : (
                <p className={ui.muted}>Image: {b.alt}</p>
              )}
              {b.caption ? <figcaption>{b.caption}</figcaption> : null}
            </figure>
          );
        }
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
