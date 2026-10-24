import { Link } from "react-router";

import { useTitle } from "../lib/title.ts";
import s from "./pages.module.css";

export function NotFound() {
  useTitle("Not found");
  return (
    <div className={s.page}>
      <h1 className={s.title}>Not found</h1>
      <p className={s.lead}>
        This page does not exist, or it is not published yet.
      </p>
      <p>
        <Link to="/">Back to the shop</Link> or <Link to="/search">search</Link>
        .
      </p>
    </div>
  );
}
