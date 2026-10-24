// The landing page (index Phase 12): the mandated Nishorama composition, in
// order — announcement bar, header and category pills (Layout), full-width
// hero with the wordmark, New Ins directly below, a second product row,
// tabbed products, footer (Layout). Sections outside this list stay off
// until you approve them (OD-23).
import { useState } from "react";

import { Hero } from "../components/Hero.tsx";
import { ProductRow } from "../components/ProductRow.tsx";
import { QuickAdd } from "../components/QuickAdd.tsx";
import { TabbedGrid } from "../components/TabbedGrid.tsx";
import { useHome } from "../lib/hooks.ts";
import type { ProductSummary } from "../lib/types.ts";
import { useTitle } from "../lib/title.ts";
import s from "./pages.module.css";

export function Home() {
  useTitle(null);
  const home = useHome();
  const [adding, setAdding] = useState<ProductSummary | null>(null);
  const h = home.data;
  if (home.isPending)
    return (
      <div className={s.heroSkeleton} aria-busy="true" aria-label="Loading" />
    );
  if (!h)
    return (
      <p className={s.page} role="alert">
        The shop could not be loaded. Try again in a moment.
      </p>
    );
  return (
    <>
      {h.hero.length > 0 ? (
        <Hero slides={h.hero} />
      ) : (
        <section className={s.page}>
          <h1 className={s.title}>Sanéa Pret</h1>
          <p className={s.lead}>Effortless Elegance.</p>
        </section>
      )}
      {h.newIns ? (
        <ProductRow
          id="new-ins"
          title={h.newIns.title}
          items={h.newIns.items}
          viewAllHref={h.newIns.viewAllHref}
          onAdd={setAdding}
        />
      ) : null}
      {h.secondRow ? (
        <ProductRow
          id="row-2"
          title={h.secondRow.title}
          items={h.secondRow.items}
          viewAllHref={h.secondRow.viewAllHref}
          onAdd={setAdding}
        />
      ) : null}
      {h.tabbed && h.tabbed.tabs.length > 0 ? (
        <TabbedGrid data={h.tabbed} onAdd={setAdding} />
      ) : null}
      <QuickAdd product={adding} onClose={() => setAdding(null)} />
    </>
  );
}
