// A horizontal product row (phase-12-plan.md §5.2, §12, §13): scroll-snap
// cards that run past the right-hand gutter to the edge of the screen, so the
// partly shown card reads as "more this way", not as a clipped box. Arrow
// buttons on desktop, each disabled at its end. Used for New Ins and the
// second row.
import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductRow as Row } from "../api/types.ts";
import { ProductCard } from "../product/ProductCard.tsx";
import s from "./landing.module.css";

export function ProductRow({ row, id }: { row: Row; id: string }) {
  const track = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const scroll = (direction: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({
      left: direction * el.clientWidth * 0.8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };

  return (
    <section className={s.row} aria-labelledby={id} data-reveal>
      <div className={s.rowHead}>
        <h2 id={id} className={s.rowTitle}>
          {row.title}
        </h2>
        <div className={s.arrows}>
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={edges.start}
            aria-label={`Scroll ${row.title} back`}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={edges.end}
            aria-label={`Scroll ${row.title} forward`}
          >
            →
          </button>
        </div>
      </div>
      <ul
        ref={track}
        className={s.track}
        aria-label={row.title}
        onScroll={measure}
      >
        {row.items.map((p) => (
          <li key={p.id} className={s.cell}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
