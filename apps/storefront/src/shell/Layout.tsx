// The storefront shell (phase-11-plan.md §4.2): skip link, header, main and
// footer landmarks around each route.
import { Link, Outlet } from "react-router";

import { Lockup, Wordmark } from "./Logo.tsx";
import s from "./shell.module.css";

export function Layout() {
  return (
    <>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.header}>
        <div className={s.bar}>
          <Link to="/" className={s.home}>
            <Wordmark />
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className={s.main}>
        <Outlet />
      </main>
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <Lockup />
        </div>
      </footer>
    </>
  );
}
