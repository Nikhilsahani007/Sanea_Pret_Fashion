import { useEffect, useRef, useState } from "react";

/**
 * True once the element has entered the viewport (once only). Under reduced
 * motion, or without IntersectionObserver, it is true from the start so
 * nothing ever waits hidden.
 */
export function useInView<T extends Element>(): [
  React.RefObject<T | null>,
  boolean,
] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(
    () =>
      typeof IntersectionObserver === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const el = ref.current;
    if (inView || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);
  return [ref, inView];
}
