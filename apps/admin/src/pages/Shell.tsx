import type { Permission } from "@sanea/shared";
import { useEffect, useRef } from "react";
import { NavLink, Outlet, useLocation } from "react-router";

import { ROLE_LABELS, useAuth } from "../auth.tsx";
import s from "./shell.module.css";

const NAV: {
  to: string;
  label: string;
  permission: Permission;
  end?: boolean;
}[] = [
  { to: "/", label: "Overview", permission: "products.view", end: true },
  { to: "/products", label: "Products", permission: "products.view" },
  { to: "/categories", label: "Categories", permission: "products.view" },
  { to: "/collections", label: "Collections", permission: "products.view" },
  { to: "/colours", label: "Colours", permission: "products.view" },
  { to: "/media", label: "Media", permission: "products.editContent" },
];

export function Shell() {
  const { state, signOut, can } = useAuth();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const previous = useRef(location.pathname);

  // Move focus to the content after each navigation (screen readers,
  // keyboards), but not on the first load.
  useEffect(() => {
    if (previous.current === location.pathname) return;
    previous.current = location.pathname;
    main.current?.focus();
  }, [location.pathname]);

  if (state.status !== "signedIn") return null;
  return (
    <>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <div className={s.layout}>
        <nav className={s.nav} aria-label="Admin">
          <NavLink to="/" className={s.brand}>
            SANÉA PRET<span>Admin</span>
          </NavLink>
          <ul className={s.links}>
            {NAV.filter((n) => can(n.permission)).map((n) => (
              <li key={n.to}>
                <NavLink to={n.to} end={n.end ?? false}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className={s.account}>
            <span>
              {state.admin.name}
              <br />
              {ROLE_LABELS[state.admin.role]}
            </span>
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        </nav>
        <main id="main" ref={main} tabIndex={-1} className={s.main}>
          <Outlet />
        </main>
      </div>
    </>
  );
}
