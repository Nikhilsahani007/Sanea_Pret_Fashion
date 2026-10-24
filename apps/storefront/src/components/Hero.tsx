// Full-width hero (index Phase 12, design-system.md §3): campaign photograph,
// the SANÉA PRET wordmark laid over it, one campaign line and one action,
// slide indicators and a pause control. Auto-advance pauses on hover, focus,
// a hidden tab and the pause button, and is off under reduced motion.
import { useEffect, useRef, useState, type TouchEvent } from "react";

import type { Home } from "../lib/types.ts";
import s from "./Hero.module.css";
import { SmartLink } from "./Layout.tsx";

const SLIDE_MS = 6000; // provisional until the reference recording is reviewed (B-03)

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function Hero({ slides }: { slides: Home["hero"] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const [held, setHeld] = useState(false); // hover or focus inside
  const touch = useRef<{ x: number; y: number } | null>(null);
  const count = slides.length;

  useEffect(() => {
    if (count < 2 || paused || held) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        setIndex((i) => (i + 1) % count);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, paused, held]);

  // Swipe with a threshold, so vertical scrolling is never captured.
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0]!;
    touch.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start || count < 2) return;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - start.x;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(t.clientY - start.y) * 1.5)
      setIndex((i) => (i + (dx < 0 ? 1 : count - 1)) % count);
  };

  const current = slides[index];
  return (
    <section
      className={s.hero}
      aria-roledescription="carousel"
      aria-label="Campaign"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setHeld(false);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          className={s.slide}
          data-active={i === index}
          aria-hidden={i !== index}
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
        >
          <picture>
            {slide.mobile ? (
              <source
                media="(max-width: 40rem)"
                type="image/avif"
                srcSet={slide.mobile.avifSrcset}
                sizes="100vw"
              />
            ) : null}
            {slide.mobile ? (
              <source
                media="(max-width: 40rem)"
                type="image/webp"
                srcSet={slide.mobile.webpSrcset}
                sizes="100vw"
              />
            ) : null}
            <source
              type="image/avif"
              srcSet={slide.desktop.avifSrcset}
              sizes="100vw"
            />
            <img
              src={slide.desktop.url}
              srcSet={slide.desktop.webpSrcset}
              sizes="100vw"
              alt={slide.alt}
              width={slide.desktop.width}
              height={slide.desktop.height}
              style={{ objectPosition: `${slide.focalX}% ${slide.focalY}%` }}
              fetchPriority={i === 0 ? "high" : "low"}
              loading={i === 0 ? "eager" : "lazy"}
              decoding={i === 0 ? "sync" : "async"}
            />
          </picture>
        </div>
      ))}
      <div className={s.scrim} />
      {current ? (
        <div className={s.copy} aria-live={paused || held ? "polite" : "off"}>
          <p className={s.line}>{current.campaignLine}</p>
          {current.ctaHref ? (
            <SmartLink href={current.ctaHref} className={s.cta}>
              {current.ctaLabel}
            </SmartLink>
          ) : null}
        </div>
      ) : null}
      <h1 className={s.wordmark}>
        <span>SANÉA </span>
        <span>PRET</span>
      </h1>
      {count > 1 ? (
        <div className={s.controls}>
          <ul className={s.dots}>
            {slides.map((slide, i) => (
              <li key={slide.id}>
                <button
                  type="button"
                  aria-label={`Show slide ${i + 1} of ${count}`}
                  aria-current={i === index}
                  onClick={() => setIndex(i)}
                />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={s.pause}
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
          >
            {paused ? "Play" : "Pause"}
            <span className="visually-hidden"> the campaign slides</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}
