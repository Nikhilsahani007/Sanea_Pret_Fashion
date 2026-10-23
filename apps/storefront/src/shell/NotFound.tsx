// Not found. Links to pages built in Phase 13 (categories, collections,
// products) are real and land here until then, with a "coming soon" note
// (Q11-7, D-098); any other unknown address is simply not found.
import { useEffect } from "react";
import { Link, useLocation } from "react-router";

import s from "../pages/pages.module.css";

const LATER = /^\/(products|categories|collections|shop|new-in)(\/|$)/;

export function NotFound() {
  const later = LATER.test(useLocation().pathname);
  const title = later ? "This page is coming soon" : "Page not found";
  useEffect(() => {
    document.title = `${title} · Sanéa Pret`;
  }, [title]);
  return (
    <section aria-labelledby="nf-title" className={s.notFound}>
      <h1 id="nf-title">{title}</h1>
      <p>
        {later
          ? "It is not on the shop yet."
          : "This address does not match a page on the shop."}{" "}
        <Link to="/search">Search the shop</Link>.
      </p>
    </section>
  );
}
