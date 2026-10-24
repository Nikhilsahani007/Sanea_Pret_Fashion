// Tabbed products (design-system.md §3): tabs as text buttons over a grid,
// four columns on desktop and two on phones. ARIA tabs with arrow keys.
import { useId, useRef, useState, type KeyboardEvent } from "react";

import { useInView } from "../lib/reveal.ts";
import type { Home, ProductSummary } from "../lib/types.ts";
import { ProductCard } from "./ProductCard.tsx";
import s from "./Rows.module.css";

export function TabbedGrid({
  data,
  onAdd,
}: {
  data: NonNullable<Home["tabbed"]>;
  onAdd: (p: ProductSummary) => void;
}) {
  const id = useId();
  const [inViewRef, inView] = useInView<HTMLElement>();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const n = data.tabs.length;
    const next =
      e.key === "ArrowRight"
        ? (active + 1) % n
        : e.key === "ArrowLeft"
          ? (active + n - 1) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };
  const tab = data.tabs[active];
  if (!tab) return null;
  return (
    <section
      ref={inViewRef}
      className={s.section}
      aria-labelledby={`${id}-title`}
    >
      <div className={s.head}>
        <h2 id={`${id}-title`} className={s.title}>
          {data.title ?? "Shop by piece"}
        </h2>
      </div>
      <div
        role="tablist"
        aria-labelledby={`${id}-title`}
        className={s.tabs}
        onKeyDown={onKey}
      >
        {data.tabs.map((t, i) => (
          <button
            key={t.label}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel`}
            tabIndex={i === active ? 0 : -1}
            className={s.tab}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${active}`}
        tabIndex={0}
        className={s.panel}
      >
        <ul className={s.grid} key={active}>
          {tab.items.map((p, i) => (
            <li
              key={p.id}
              className={inView ? s.reveal : s.waiting}
              style={{ transitionDelay: `${Math.min(i, 7) * 50}ms` }}
            >
              <ProductCard
                product={p}
                sizes="(max-width: 40rem) 50vw, 25vw"
                onAdd={onAdd}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
