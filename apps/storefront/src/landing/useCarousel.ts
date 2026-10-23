// Hero carousel state (phase-12-plan.md §5.1, P12-5). Auto-advance every
// SLIDE_MS unless paused by the shopper, while hovered or focused, while the
// tab is hidden, under reduced motion, or with fewer than two slides. The
// timing is provisional until the reference recording exists (B-03).
import { useCallback, useEffect, useState, type FocusEvent } from "react";

export const SLIDE_MS = 6000;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function useCarousel(count: number) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [reduced] = useState(prefersReducedMotion);

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const playing =
    count > 1 && !paused && !hover && !focus && !hidden && !reduced;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setIndex((i) => (i + 1) % count),
      SLIDE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [playing, index, count]);

  const go = useCallback(
    (i: number) => setIndex(((i % count) + count) % count),
    [count],
  );

  return {
    index: count ? Math.min(index, count - 1) : 0,
    go,
    playing,
    /** The shopper's own pause, shown on the button. */
    paused: paused || reduced,
    reduced,
    togglePause: () => setPaused((p) => !p),
    bind: {
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      onFocus: () => setFocus(true),
      onBlur: (e: FocusEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setFocus(false);
      },
    },
  };
}
