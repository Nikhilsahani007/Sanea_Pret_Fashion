import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";

import { useCart, useHome, useMenus, useSettings } from "../lib/hooks.ts";
import { CartDrawer } from "./CartDrawer.tsx";
import { BagIcon, CloseIcon, MenuIcon, SearchIcon } from "./Icons.tsx";
import { SearchBox } from "./SearchBox.tsx";
import s from "./Shell.module.css";

/** Internal paths become router links; anything else a normal link. */
export function SmartLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return href.startsWith("/") ? (
    <NavLink to={href} className={className} end>
      {children}
    </NavLink>
  ) : (
    <a
      href={href}
      className={className}
      rel="noopener noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

export function Layout() {
  const home = useHome();
  const menus = useMenus();
  const cart = useCart();
  const location = useLocation();
  const [bagOpen, setBagOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bagButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const previous = useRef(location.pathname);

  // New page: close panels and move focus to the content (not on first load).
  useEffect(() => {
    if (previous.current === location.pathname) return;
    previous.current = location.pathname;
    setMenuOpen(false);
    setSearchOpen(false);
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const count = cart.data?.itemCount ?? 0;
  const announcement = home.data?.announcement;
  const header = menus.data?.menus.HEADER ?? [];
  const pills = home.data?.pills ?? [];

  return (
    <>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      {announcement ? (
        <p className={s.announcement}>
          {announcement.href ? (
            <SmartLink href={announcement.href}>{announcement.text}</SmartLink>
          ) : (
            announcement.text
          )}
        </p>
      ) : null}
      <header className={s.header}>
        <div className={s.bar}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-space-4)",
            }}
          >
            <button
              type="button"
              className={`${s.action} ${s.menuButton}`}
              aria-expanded={menuOpen}
              aria-controls="main-nav"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
              <span className="visually-hidden">Menu</span>
            </button>
            <nav aria-label="Main">
              <ul id="main-nav" className={s.nav} data-open={menuOpen}>
                {header.map((l) => (
                  <li key={l.href}>
                    <SmartLink href={l.href}>{l.label}</SmartLink>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
          <Link to="/" className={s.wordmark} aria-label="Sanéa Pret, home">
            SANÉA PRET
          </Link>
          <div className={s.actions}>
            <button
              type="button"
              className={s.action}
              aria-expanded={searchOpen}
              aria-controls="search-panel"
              onClick={() => setSearchOpen((o) => !o)}
            >
              <SearchIcon />
              <span className={s.actionText}>Search</span>
            </button>
            <button
              ref={bagButton}
              type="button"
              className={s.action}
              aria-haspopup="dialog"
              aria-label={`Bag, ${count === 1 ? "1 item" : `${count} items`}`}
              onClick={() => setBagOpen(true)}
            >
              <BagIcon />
              <span className={s.actionText}>Bag</span>
              <span className={s.count} aria-hidden="true">
                {count}
              </span>
            </button>
          </div>
        </div>
        {searchOpen ? (
          <div
            id="search-panel"
            className="wrap"
            style={{ paddingBlock: "var(--sp-space-4) var(--sp-space-6)" }}
          >
            <SearchBox onDone={() => setSearchOpen(false)} />
          </div>
        ) : null}
        {pills.length > 0 ? (
          <nav aria-label="Categories">
            <ul className={s.pills}>
              {pills.map((p) => (
                <li key={p.href}>
                  <SmartLink href={p.href}>{p.label}</SmartLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </header>
      <main id="main" ref={main} tabIndex={-1} className={s.main}>
        <Outlet />
      </main>
      <Footer />
      <CartDrawer
        open={bagOpen}
        onClose={() => {
          setBagOpen(false);
          bagButton.current?.focus();
        }}
      />
      <BagOpener onOpen={() => setBagOpen(true)} />
    </>
  );
}

/** Lets other components open the bag after "Add to bag". */
function BagOpener({ onOpen }: { onOpen: () => void }) {
  useEffect(() => {
    const open = () => onOpen();
    window.addEventListener("sp:open-bag", open);
    return () => window.removeEventListener("sp:open-bag", open);
  }, [onOpen]);
  return null;
}
export const openBag = () => window.dispatchEvent(new Event("sp:open-bag"));

function Footer() {
  const home = useHome();
  const menus = useMenus();
  const settings = useSettings();
  const footer = home.data?.footer;
  const st = settings.data;
  const groups = [
    ...(footer?.groups ?? []),
    ...(menus.data?.menus.FOOTER_SHOP?.length
      ? [{ title: "Shop", links: menus.data.menus.FOOTER_SHOP }]
      : []),
    ...(menus.data?.menus.FOOTER_HELP?.length
      ? [{ title: "Help", links: menus.data.menus.FOOTER_HELP }]
      : []),
  ];
  const hasContact =
    st &&
    (st.contactEmail ||
      st.contactPhone ||
      st.whatsappNumber ||
      st.businessAddress);
  return (
    <footer className={s.footer}>
      <div className={s.footerGrid}>
        {groups.map((g) => (
          <section key={g.title}>
            <h2>{g.title}</h2>
            <ul>
              {g.links.map((l) => (
                <li key={l.href + l.label}>
                  <SmartLink href={l.href}>{l.label}</SmartLink>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {hasContact ? (
          <section>
            <h2>Contact</h2>
            <ul>
              {st.whatsappNumber ? (
                <li>
                  <a
                    href={`https://wa.me/${st.whatsappNumber.replace("+", "")}`}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    WhatsApp
                  </a>
                </li>
              ) : null}
              {st.contactPhone ? (
                <li>
                  <a href={`tel:${st.contactPhone}`}>
                    {st.contactPhone.replace(
                      /^\+91(\d{5})(\d{5})$/,
                      "+91 $1 $2",
                    )}
                  </a>
                </li>
              ) : null}
              {st.contactEmail ? (
                <li>
                  <a href={`mailto:${st.contactEmail}`}>{st.contactEmail}</a>
                </li>
              ) : null}
              {st.businessAddress ? (
                <li style={{ whiteSpace: "pre-line" }}>{st.businessAddress}</li>
              ) : null}
            </ul>
          </section>
        ) : null}
        {footer?.social.length ? (
          <section>
            <h2>Follow</h2>
            <ul>
              {footer.social.map((l) => (
                <li key={l.href}>
                  <a href={l.href} rel="noopener noreferrer" target="_blank">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
      <p className={s.legal}>
        © {new Date().getFullYear()} Sanéa Pret. Effortless Elegance.
      </p>
      <p className={s.footerWordmark} aria-hidden="true">
        SANÉA PRET
      </p>
    </footer>
  );
}
