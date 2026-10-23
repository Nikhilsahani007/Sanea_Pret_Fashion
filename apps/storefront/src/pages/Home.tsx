// "/" in Phase 11: the shell, whose header holds the search (phase-11-plan.md §4.3).
// The landing page (hero, monument wordmark, product rows) replaces it in
// Phase 12; nothing is invented to fill the space until then.
import { useEffect } from "react";

import s from "./pages.module.css";

export function Home() {
  useEffect(() => {
    document.title = "Sanéa Pret";
  }, []);
  return (
    <section aria-labelledby="home-title" className={s.home}>
      <h1 id="home-title">Find something to wear</h1>
      <p>Search the shop above. The full home page is on its way.</p>
    </section>
  );
}
