// Header search with suggestions (phase-11-plan.md §4.4): the WAI-ARIA 1.2
// combobox pattern over /search/suggest. Suggestions start at 2 characters,
// are debounced 200 ms and an earlier request is cancelled. Arrow keys move
// through them; Enter opens the active one, or the results page. A 429 shows
// a message and does not retry (60 per minute per IP, shared with search).
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { api, toApiError } from "../api/client.ts";
import type { Suggestions } from "../api/types.ts";
import s from "./search.module.css";

type Option = { kind: "category" | "product"; slug: string; name: string };

export const SUGGEST_DELAY_MS = 200;

const hrefOf = (o: Option) =>
  o.kind === "category" ? `/shop/${o.slug}` : `/products/${o.slug}`;

export function SearchBox({
  id,
  label = "Search the shop",
  initial = "",
  onDone,
}: {
  id: string;
  label?: string;
  initial?: string;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [q, setQ] = useState(initial);
  const [options, setOptions] = useState<Option[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const timer = useRef<number | undefined>(undefined);
  const controller = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      controller.current?.abort();
    },
    [],
  );

  function changed(value: string) {
    setQ(value);
    setActive(-1);
    window.clearTimeout(timer.current);
    controller.current?.abort();
    const term = value.trim();
    if (term.length < 2) {
      setOptions([]);
      setOpen(false);
      setNotice("");
      return;
    }
    timer.current = window.setTimeout(() => {
      const c = new AbortController();
      controller.current = c;
      api
        .get<Suggestions>(
          `/search/suggest?q=${encodeURIComponent(term)}`,
          c.signal,
        )
        .then((r) => {
          const next: Option[] = [
            ...r.categories.map((x) => ({ kind: "category" as const, ...x })),
            ...r.products.map((x) => ({ kind: "product" as const, ...x })),
          ];
          setOptions(next);
          setOpen(next.length > 0);
          setNotice(
            next.length
              ? `${next.length} suggestion${next.length === 1 ? "" : "s"}. Use the arrow keys to choose.`
              : "",
          );
        })
        .catch((error: unknown) => {
          if (c.signal.aborted) return;
          setOptions([]);
          setOpen(false);
          setNotice(
            toApiError(error).status === 429
              ? "Search is busy. Try again in a moment."
              : "",
          );
        });
    }, SUGGEST_DELAY_MS);
  }

  function go(path: string) {
    setOpen(false);
    onDone?.();
    void navigate(path);
  }

  return (
    <form
      role="search"
      className={s.box}
      onSubmit={(e) => {
        e.preventDefault();
        const chosen = options[active];
        if (open && chosen) go(hrefOf(chosen));
        else if (q.trim().length >= 2)
          go(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        {label}
      </label>
      <input
        id={id}
        type="search"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Search the shop"
        minLength={2}
        maxLength={100}
        value={q}
        onChange={(e) => changed(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i + 1) % options.length);
          } else if (e.key === "ArrowUp" && options.length) {
            e.preventDefault();
            setOpen(true);
            setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      <button type="submit" className={s.submit}>
        Search
      </button>
      <ul
        id={listId}
        role="listbox"
        aria-label="Suggestions"
        className={s.list}
        hidden={!open}
      >
        {options.map((o, i) => (
          <li
            key={`${o.kind}:${o.slug}`}
            id={`${listId}-${i}`}
            role="option"
            aria-label={`${o.name}, ${o.kind}`}
            aria-selected={i === active}
            className={s.option}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => go(hrefOf(o))}
          >
            {o.name}
            <span className={s.kind}>
              {o.kind === "category" ? "Category" : "Product"}
            </span>
          </li>
        ))}
      </ul>
      <p className="visually-hidden" role="status">
        {notice}
      </p>
      {notice.startsWith("Search is busy") ? (
        <p className={s.busy}>{notice}</p>
      ) : null}
    </form>
  );
}
