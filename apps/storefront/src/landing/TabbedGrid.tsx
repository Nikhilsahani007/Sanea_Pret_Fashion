// Tabbed products (phase-12-plan.md §5.3): tabs as text buttons over a grid,
// 4 columns on desktop and 2 on a phone. WAI-ARIA tabs: arrow keys, Home and
// End move between tabs, and the chosen tab's panel follows.
import { useId, useRef, useState } from "react";

import type { Home } from "../api/types.ts";
import { ProductCard } from "../product/ProductCard.tsx";
import grid from "../product/product.module.css";
import s from "./landing.module.css";

type Tabs = NonNullable<Home["tabbedGrid"]>["tabs"];

export function TabbedGrid({ tabs }: { tabs: Tabs }) {
  const [active, setActive] = useState(0);
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (to: number) => {
    const next = (to + tabs.length) % tabs.length;
    setActive(next);
    refs.current[next]?.focus();
  };
  return (
    <section className={s.tabbed} aria-label="Shop by edit" data-reveal>
      <div role="tablist" aria-label="Edits" className={s.tablist}>
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            className={s.tab}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          hidden={i !== active}
        >
          <ul className={grid.grid}>
            {tab.items.map((p) => (
              <li key={p.id}>
                <ProductCard product={p} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
