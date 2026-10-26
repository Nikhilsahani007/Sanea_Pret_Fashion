// The signed-in shell: skip link, header with the admin's name, role and
// sign-out, role-based navigation, and the page outlet. Unauthenticated
// visitors go to sign-in, keeping the page they asked for.
import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";

import { toApiError, type ApiError } from "../api/client.ts";
import { useAdmin, useSession } from "../auth/session.tsx";
import { ErrorState, Loading, Notice } from "../ui/feedback.tsx";
import { ROLE_LABELS, navFor } from "./nav.ts";
import s from "./shell.module.css";

/** Guards the signed-in routes. */
export function RequireSession() {
  const { state, reload } = useSession();
  const location = useLocation();
  if (state.status === "loading")
    return <Loading label="Checking your session…" />;
  if (state.status === "error")
    return (
      <main className={s.main} id="main">
        <ErrorState error={state.error} onRetry={reload} />
      </main>
    );
  if (state.status === "signed-out")
    return (
      <Navigate
        to="/sign-in"
        replace
        state={{
          from: `${location.pathname}${location.search}`,
          expired: state.expired,
        }}
      />
    );
  return <AppShell />;
}

function AppShell() {
  const admin = useAdmin();
  const { signOut } = useSession();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<ApiError | null>(null);
  const items = navFor(admin.role);

  // Close the mobile menu after navigating.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await signOut();
    } catch (error) {
      setSignOutError(toApiError(error));
      setSigningOut(false);
    }
  }

  return (
    <>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <header className={s.header}>
        <Link to="/" className={s.brand}>
          Sanéa Pret <span className="visually-hidden">admin home</span>
        </Link>
        <div className={s.account}>
          <span>
            {admin.name} · {ROLE_LABELS[admin.role]}
          </span>
          <button
            type="button"
            className={s.menuButton}
            aria-expanded={menuOpen}
            aria-controls="admin-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </button>
          <button
            type="button"
            className={s.headerButton}
            onClick={handleSignOut}
            disabled={signingOut}
            aria-busy={signingOut || undefined}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </header>
      <div className={s.layout}>
        <nav
          id="admin-nav"
          className={s.nav}
          aria-label="Admin"
          data-open={menuOpen}
        >
          <ul className={s.navList}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end} className={s.navLink}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className={s.main} id="main" tabIndex={-1}>
          {signOutError ? (
            <Notice tone="error" title="Sign-out did not complete">
              <p>{signOutError.message}</p>
            </Notice>
          ) : null}
          <Outlet />
        </main>
      </div>
    </>
  );
}
