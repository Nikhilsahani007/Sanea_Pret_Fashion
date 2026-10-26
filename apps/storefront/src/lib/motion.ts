// Storefront motion outside the landing (design-system.md §8): a short rise
// for a page's content when the route changes, and for the first cards of a
// product grid as they load. Transform and opacity only, `fill: backwards`
// so content is visible without script, and nothing moves under reduced
// motion.
import { useEffect, type RefObject } from "react";

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function still(): boolean {
  return (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function rise(elements: Iterable<Element>, step = 60, max = 8): void {
  if (still()) return;
  [...elements].slice(0, max).forEach((el, i) => {
    if (typeof (el as HTMLElement).animate !== "function") return;
    (el as HTMLElement).animate(
      [
        { opacity: 0, transform: "translateY(16px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: 520, delay: i * step, easing: EASE, fill: "backwards" },
    );
  });
}

// Rises the element's direct children (or, with `self`, the element)
// whenever `key` changes; a null key does nothing.
export function useRise(
  ref: RefObject<HTMLElement | null>,
  key: unknown,
  self = false,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || key === null) return;
    rise(self ? [el] : el.children);
  }, [ref, key, self]);
}
