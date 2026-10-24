// Search with suggestions: an ARIA 1.2 combobox. Arrow keys move through the
// suggestions, Enter opens one or searches for the text, Escape closes.
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useNavigate } from "react-router";

import { get } from "../lib/api.ts";
import s from "./Search.module.css";

type Suggestion = { href: string; label: string; kind: "Product" | "Category" };

export function SearchBox({
  onDone,
  initial = "",
}: {
  onDone?: () => void;
  initial?: string;
}) {
  const navigate = useNavigate();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);

  useEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      get<{
        products: { slug: string; name: string }[];
        categories: { slug: string; name: string }[];
      }>("/search/suggest", { q: term })
        .then((r) => {
          if (controller.signal.aborted) return;
          setItems([
            ...r.categories.map((c) => ({
              href: `/shop/${c.slug}`,
              label: c.name,
              kind: "Category" as const,
            })),
            ...r.products.map((p) => ({
              href: `/products/${p.slug}`,
              label: p.name,
              kind: "Product" as const,
            })),
          ]);
          setActive(-1);
          setOpen(true);
        })
        .catch(() => setItems([]));
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [q]);

  function go(href: string) {
    setOpen(false);
    onDone?.();
    navigate(href);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && items[active]) return go(items[active].href);
    if (q.trim()) go(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      if (open && items.length) setOpen(false);
      else onDone?.();
    }
  }

  const listId = `${id}-list`;
  const expanded = open && items.length > 0;
  return (
    <form className={s.form} role="search" onSubmit={onSubmit}>
      <div className={s.field}>
        <label htmlFor={`${id}-q`}>Search the shop</label>
        <input
          ref={input}
          id={`${id}-q`}
          className={s.input}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            expanded && active >= 0 ? `${id}-opt-${active}` : undefined
          }
          autoComplete="off"
          enterKeyHint="search"
          maxLength={100}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions"
          className={s.list}
          hidden={!expanded}
        >
          {items.map((item, i) => (
            <li
              key={item.href}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className={s.option}
              onMouseDown={(e) => {
                e.preventDefault();
                go(item.href);
              }}
            >
              <span>{item.label}</span>
              <span className={s.kind}>{item.kind}</span>
            </li>
          ))}
        </ul>
        <span className="visually-hidden" role="status" aria-live="polite">
          {q.trim().length >= 2 ? `${items.length} suggestions` : ""}
        </span>
      </div>
      <button className={s.submit} type="submit">
        Search
      </button>
    </form>
  );
}
