// Section entrances (design-system.md §8; phase-12-plan.md P12-5): each
// `[data-reveal]` section rises 20 px with opacity once as it enters, its
// heading, then its items, 70 ms apart. Content is visible without script,
// and nothing moves under reduced motion. Transform and opacity only.
import { useEffect } from "react";

export function useReveal(ready: boolean): void {
  useEffect(() => {
    if (!ready || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sections = [
      ...document.querySelectorAll<HTMLElement>("[data-reveal]"),
    ];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const parts = entry.target.querySelectorAll<HTMLElement>(
            "h2, [role='tablist'], li",
          );
          parts.forEach((el, i) => {
            el.animate(
              [
                { opacity: 0, transform: "translateY(20px)" },
                { opacity: 1, transform: "none" },
              ],
              {
                duration: 400,
                delay: Math.min(i, 8) * 70,
                easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                fill: "backwards",
              },
            );
          });
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.15 },
    );
    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ready]);
}
