// Not found: an unknown address, or a product, category, collection or page
// that is not public. The same answer for each, so nothing is revealed.
import { useEffect } from "react";
import { Link } from "react-router";

import s from "../pages/pages.module.css";

export function NotFound() {
  useEffect(() => {
    document.title = "Page not found · Sanéa Pret";
  }, []);
  return (
    <section aria-labelledby="nf-title" className={s.notFound}>
      <h1 id="nf-title">Page not found</h1>
      <p>
        This address does not match a page on the shop.{" "}
        <Link to="/shop">Shop all</Link> or{" "}
        <Link to="/search">search the shop</Link>.
      </p>
    </section>
  );
}
