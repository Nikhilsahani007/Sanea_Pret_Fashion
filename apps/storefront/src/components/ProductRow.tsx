// A horizontal scroll-snap row of product cards with arrow buttons on wide
// screens; swipe or scroll elsewhere. Each card offers "Add", which opens the
// size sheet; nothing is added without a chosen size.
import { useEffect, useRef, useState } from "react";

import { useInView } from "../lib/reveal.ts";
import type { ProductSummary } from "../lib/types.ts";
import { SmartLink } from "./Layout.tsx";
import { ProductCard } from "./ProductCard.tsx";
import s from "./Rows.module.css";

export function ProductRow({
  id,
  title,
  items,
  viewAllHref,
  onAdd,
}: {
  id: string;
  title: string;
  items: ProductSummary[];
  viewAllHref: string | null;
  onAdd: (p: ProductSummary) => void;
}) {
  const track = useRef<HTMLUListElement>(null);
  const [inViewRef, inView] = useInView<HTMLElement>();
  const [edge, setEdge] = useState({ start: true, end: false });

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdge({
        start: el.scrollLeft < 8,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [items.length]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollBy({
      left: dir * el.clientWidth * 0.8,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <section
      ref={inViewRef}
      className={s.section}
      aria-labelledby={`${id}-title`}
    >
      <div className={s.head}>
        <h2 id={`${id}-title`} className={s.title}>
          {title}
        </h2>
        <div className={s.tools}>
          {viewAllHref ? (
            <SmartLink href={viewAllHref} className={s.viewAll}>
              View all<span className="visually-hidden"> {title}</span>
            </SmartLink>
          ) : null}
          <button
            type="button"
            className={s.arrow}
            onClick={() => page(-1)}
            disabled={edge.start}
            aria-label={`Previous ${title}`}
            aria-controls={`${id}-track`}
          >
            ←
          </button>
          <button
            type="button"
            className={s.arrow}
            onClick={() => page(1)}
            disabled={edge.end}
            aria-label={`Next ${title}`}
            aria-controls={`${id}-track`}
          >
            →
          </button>
        </div>
      </div>
      <ul id={`${id}-track`} ref={track} className={s.track}>
        {items.map((p, i) => (
          <li
            key={p.id}
            className={inView ? s.reveal : s.waiting}
            style={{ transitionDelay: `${Math.min(i, 5) * 70}ms` }}
          >
            <ProductCard
              product={p}
              sizes="(max-width: 40rem) 44vw, 22vw"
              eager={id === "new-ins" && i < 4}
              onAdd={onAdd}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
