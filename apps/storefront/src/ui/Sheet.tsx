// A side sheet (design-system.md §6; phase-11-plan.md §4.6): the native modal
// <dialog>, so focus stays inside and Escape closes it; focus then returns to
// the element that opened it. The only floating surface with a shadow.
import { useEffect, useRef, type ReactNode } from "react";

import s from "./ui.module.css";

const FOCUSABLE =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  title,
  side = "right",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "right" | "left";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const titleId = `sheet-${title.toLowerCase().replace(/\W+/g, "-")}`;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`${s.sheet} ${side === "left" ? s.left : s.right}`}
      aria-labelledby={titleId}
      onClose={() => {
        onClose();
        opener.current?.focus();
      }}
      onClick={(e) => {
        // A click on the backdrop (the dialog box itself) closes it.
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      onKeyDown={(e) => {
        // The page behind is inert, but Tab past the last control would
        // leave for the browser itself: wrap within the sheet instead.
        if (e.key !== "Tab" || !ref.current) return;
        const items = [
          ...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ].filter((el) => !el.closest("[hidden]"));
        const first = items[0];
        const last = items.at(-1);
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }}
    >
      <div className={s.sheetInner}>
        <div className={s.sheetHead}>
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className={s.close}
            onClick={() => ref.current?.close()}
          >
            Close
          </button>
        </div>
        {open ? children : null}
      </div>
    </dialog>
  );
}
