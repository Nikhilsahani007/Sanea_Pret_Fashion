// Allow-listed renderer for structured rich text (D-109). Every block type is
// rendered by name; unknown types render nothing. React escapes all text, and
// there is no HTML input anywhere.
import type { Img } from "../lib/types.ts";

type Block =
  | { type: "paragraph"; text: string }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "link"; text: string; href: string }
  | ({ type: "image"; alt: string } & Img);

const SAFE = /^(\/(?!\/)|https:\/\/|mailto:|tel:)/;

export function RichText({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "paragraph":
            return (
              <p key={i} style={{ whiteSpace: "pre-line" }}>
                {b.text}
              </p>
            );
          case "heading":
            return b.level === 2 ? (
              <h2 key={i}>{b.text}</h2>
            ) : (
              <h3 key={i}>{b.text}</h3>
            );
          case "list": {
            const items = b.items.map((t, j) => <li key={j}>{t}</li>);
            return b.ordered ? (
              <ol key={i}>{items}</ol>
            ) : (
              <ul key={i}>{items}</ul>
            );
          }
          case "link":
            return SAFE.test(b.href) ? (
              <p key={i}>
                <a href={b.href}>{b.text}</a>
              </p>
            ) : null;
          case "image":
            return (
              <picture key={i}>
                <source
                  type="image/avif"
                  srcSet={b.avifSrcset}
                  sizes="(max-width: 48rem) 100vw, 68ch"
                />
                <img
                  src={b.url}
                  srcSet={b.webpSrcset}
                  sizes="(max-width: 48rem) 100vw, 68ch"
                  alt={b.alt}
                  width={b.width}
                  height={b.height}
                  loading="lazy"
                />
              </picture>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
