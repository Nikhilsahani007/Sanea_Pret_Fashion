// Section entrances (design-system.md §8; phase-12-plan.md P12-5, §12): kept
// quiet after your review. Each `[data-reveal]` section's title, then its
// first few pictures, rise 12 px with opacity once as they enter, 60 ms
// apart; later items simply appear. Content is visible without script, and
// nothing moves under reduced motion. Transform and opacity only.
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
            ":scope > div > h2, :scope > [role='tablist'], :scope > ul > li, :scope > [role='tabpanel']:not([hidden]) > ul > li",
          );
          [...parts].slice(0, 5).forEach((el, i) => {
            el.animate(
              [
                { opacity: 0, transform: "translateY(12px)" },
                { opacity: 1, transform: "none" },
              ],
              {
                duration: 600,
                delay: i * 60,
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
