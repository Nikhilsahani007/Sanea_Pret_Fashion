// The storefront shell (phase-11-plan.md §4.2): announcement bar, header
// (logo, main links, search, bag), category pills, main and footer. Built
// from published content only: a menu with no public links is not drawn,
// and nothing is invented to fill space.
import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { api } from "../api/client.ts";
import type { Home, MenuLink, Navigation } from "../api/types.ts";
import { CartDrawer } from "../cart/CartDrawer.tsx";
import { useCart } from "../cart/CartProvider.tsx";
import { items } from "../lib/format.ts";
import { useResource } from "../lib/resource.ts";
import { SearchBox } from "../search/SearchBox.tsx";
import { Sheet } from "../ui/Sheet.tsx";
import { Lockup, Wordmark } from "./Logo.tsx";
import s from "./shell.module.css";

const NETWORK_NAMES: Record<string, string> = {
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  YOUTUBE: "YouTube",
  PINTEREST: "Pinterest",
  WHATSAPP: "WhatsApp",
  X: "X",
};

function Links({ links, label }: { links: MenuLink[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ul className={s.links}>
        {links.map((l) => (
          <li key={`${l.href}:${l.label}`}>
            <NavLink to={l.href}>{l.label}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Announcement({ home }: { home: Home | null }) {
  if (!home?.announcement) return null;
  const { text, href } = home.announcement;
  return (
    <div className={s.announcement}>
      <p>{href ? <Link to={href}>{text}</Link> : text}</p>
    </div>
  );
}

function BagButton() {
  const { cart, openDrawer } = useCart();
  return (
    <button type="button" className={s.bag} onClick={openDrawer}>
      <span aria-hidden="true">
        Bag <span className="tabular">({cart.itemCount})</span>
      </span>
      <span className="visually-hidden">Bag, {items(cart.itemCount)}</span>
    </button>
  );
}

export function Layout() {
  const nav = useResource<Navigation>(
    (signal) => api.get("/content/navigation", signal),
    [],
  );
  const home = useResource<Home>(
    (signal) => api.get("/content/home", signal),
    [],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  // On the results page the header box shows the current query.
  const location = useLocation();
  const query =
    location.pathname === "/search"
      ? (new URLSearchParams(location.search).get("q") ?? "")
      : "";
  const { announcement } = useCart();
  const menus = nav.status === "ready" ? nav.data.menus : {};
  const footer = nav.status === "ready" ? nav.data.footer : null;
  const header = menus.HEADER ?? [];
  const pills = menus.CATEGORY_PILLS ?? [];
  const groups = (
    [
      ["Shop", menus.FOOTER_SHOP],
      ["Help", menus.FOOTER_HELP],
      ["About", menus.FOOTER_ABOUT],
    ] as const
  ).filter(([, links]) => links?.length);

  // The shell is drawn once its menus and announcement are known (or have
  // failed), so they never push the page down after the first paint (CLS).
  if (nav.status === "loading" || home.status === "loading")
    return (
      <div className={s.pending} aria-busy="true">
        <span className="visually-hidden">Loading</span>
      </div>
    );

  return (
    <>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <Announcement home={home.status === "ready" ? home.data : null} />
      <header className={s.header}>
        <div className={s.bar}>
          {header.length ? (
            <button
              type="button"
              className={s.menuButton}
              onClick={() => setMenuOpen(true)}
            >
              Menu
            </button>
          ) : null}
          <Link to="/" className={s.home}>
            <Wordmark />
          </Link>
          {header.length ? (
            <div className={s.mainLinks}>
              <Links links={header} label="Main" />
            </div>
          ) : null}
          {/* Search and bag share the right-hand column on desktop; on a
              phone the wrapper dissolves and search takes its own row. */}
          <div className={s.actions}>
            <div className={s.search}>
              <SearchBox id="header-q" initial={query} key={query} />
            </div>
            <BagButton />
          </div>
        </div>
        {pills.length ? (
          <nav aria-label="Categories" className={s.pills}>
            <ul>
              {pills.map((l) => (
                <li key={`${l.href}:${l.label}`}>
                  <NavLink to={l.href}>{l.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Menu"
        side="left"
      >
        <div
          className={s.menuSheet}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest("a")) setMenuOpen(false);
          }}
        >
          <Links links={header} label="Main" />
        </div>
      </Sheet>
      <main
        id="main"
        tabIndex={-1}
        className={`${s.main} ${location.pathname === "/" ? s.wide : ""}`}
      >
        <Outlet />
      </main>
      {/* The footer (phase-12-plan.md §13): the logo with its tagline on the
          left, then the published menus, contact and social links as quiet
          columns. Only what is published is drawn. */}
      <footer className={s.footer}>
        <div className={s.footerInner}>
          <div className={s.footerBrand}>
            <Lockup />
          </div>
          <div className={s.footerCols}>
            {groups.map(([title, links]) => (
              <div key={title}>
                <h2 className={s.groupTitle}>{title}</h2>
                <Links links={links!} label={`${title} links`} />
              </div>
            ))}
            {footer?.contact ? (
              <div>
                <h2 className={s.groupTitle}>Contact</h2>
                <address className={s.contact}>
                  {footer.contact.addressLines?.map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                  {footer.contact.hours ? (
                    <span>{footer.contact.hours}</span>
                  ) : null}
                  {footer.contact.phone ? (
                    <a
                      href={`tel:${footer.contact.phone.replace(/[^+\d]/g, "")}`}
                    >
                      {footer.contact.phone}
                    </a>
                  ) : null}
                  {footer.contact.email ? (
                    <a href={`mailto:${footer.contact.email}`}>
                      {footer.contact.email}
                    </a>
                  ) : null}
                </address>
              </div>
            ) : null}
            {footer?.social?.length ? (
              <div>
                <h2 className={s.groupTitle}>Follow</h2>
                <ul className={s.social} aria-label="Sanéa Pret elsewhere">
                  {footer.social.map((link) => (
                    <li key={link.url}>
                      <a
                        href={link.url}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {NETWORK_NAMES[link.network] ?? link.network}
                        <span className="visually-hidden">
                          {" "}
                          (opens a new tab)
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      </footer>
      <CartDrawer />
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
