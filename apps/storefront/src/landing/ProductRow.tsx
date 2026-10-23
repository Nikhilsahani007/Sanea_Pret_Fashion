// A horizontal product row (phase-12-plan.md §5.2; design-system.md §3):
// scroll-snap cards, 4.5 visible on desktop and 2.3 on a phone, arrow
// buttons on desktop. Used for New Ins and the second row.
import { useRef } from "react";

import type { ProductRow as Row } from "../api/types.ts";
import { ProductCard } from "../product/ProductCard.tsx";
import s from "./landing.module.css";

export function ProductRow({ row, id }: { row: Row; id: string }) {
  const track = useRef<HTMLUListElement>(null);
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
            aria-label={`Scroll ${row.title} back`}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label={`Scroll ${row.title} forward`}
          >
            →
          </button>
        </div>
      </div>
      <ul ref={track} className={s.track} aria-label={row.title}>
        {row.items.map((p) => (
          <li key={p.id} className={s.cell}>
            <ProductCard product={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}
