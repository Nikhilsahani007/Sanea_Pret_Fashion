// "/" (phase-12-plan.md; index Phase 12; D-012): after the shell's
// announcement, header and pills come the hero with the monument, New Ins
// immediately below, the second row, and the tabbed products; then the
// footer. Only published blocks are drawn; an empty block is not drawn. The
// editorial band and the Rehma Foundation teaser are off (OD-23). If the
// content cannot be loaded, the monument still stands and a quiet notice
// offers to try again; nothing is invented in its place.
import { useEffect } from "react";

import { api } from "../api/client.ts";
import type { Home } from "../api/types.ts";
import { useResource } from "../lib/resource.ts";
import { BRAND_NAME, TAGLINE } from "../shell/Logo.tsx";
import { Hero } from "./Hero.tsx";
import { ProductRow } from "./ProductRow.tsx";
import { TabbedGrid } from "./TabbedGrid.tsx";
import { useReveal } from "./useReveal.ts";
import s from "./landing.module.css";

export function Landing() {
  const home = useResource<Home>(
    (signal) => api.get("/content/home", signal),
    [],
  );
  useEffect(() => {
    document.title = `${BRAND_NAME} · ${TAGLINE}`;
  }, []);
  useReveal(home.status === "ready");

  if (home.status === "loading")
    return (
      <div className={s.pending} aria-busy="true">
        <span className="visually-hidden">Loading</span>
      </div>
    );
  // On an error the page still stands: the monument without sections.
  const data = home.status === "ready" ? home.data : null;
  const tabs = data?.tabbedGrid?.tabs ?? [];
  return (
    <div className={s.landing}>
      <h1 className="visually-hidden">Sanéa Pret</h1>
      <Hero slides={data?.hero?.slides ?? []} />
      {home.status === "error" ? (
        <div className={s.inner}>
          <p className={s.notice} role="status">
            Part of this page could not be loaded.{" "}
            <button type="button" className={s.retry} onClick={home.reload}>
              Try again
            </button>
          </p>
        </div>
      ) : null}
      {data?.newIns ? (
        <div className={s.inner}>
          <ProductRow row={data.newIns} id="new-ins" />
        </div>
      ) : null}
      {data?.row2 ? (
        <div className={s.inner}>
          <ProductRow row={data.row2} id="row-2" />
        </div>
      ) : null}
      {tabs.length ? (
        <div className={s.inner}>
          <TabbedGrid tabs={tabs} />
        </div>
      ) : null}
    </div>
  );
}
