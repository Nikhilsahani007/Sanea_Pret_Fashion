// Not found, and the destination of links to pages built in Phase 13
// (Q11-7, D-098): the links are real; the pages arrive later.
import { Link } from "react-router";

export function NotFound() {
  return (
    <section aria-labelledby="nf-title">
      <h1 id="nf-title">This page is coming soon</h1>
      <p>
        It is not on the shop yet. <Link to="/search">Search the shop</Link>.
      </p>
    </section>
  );
}
