// The landing hero (phase-12-plan.md §5.1, §12; design-system.md §3), redesigned
// after your first review: campaign first. The photograph fills the frame;
// the campaign line is the headline, with one quiet CTA, bottom left; the
// wordmark (the supplied logo, never retyped or enlarged past its raster
// size) sits above as a masthead, at about a quarter of the width; the slide
// indicators and pause sit bottom right. WAI-ARIA carousel pattern: arrow
// keys, Home and End on the indicators choose a slide and take focus with
// it. With no published slide, the masthead stands on the deep aubergine
// field (P12-3); a slide whose image is missing shows that field too, never
// a broken image.
import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Link } from "react-router";

import type { HeroSlide } from "../api/types.ts";
import { Monument } from "../shell/Logo.tsx";
import { useCarousel } from "./useCarousel.ts";
import s from "./landing.module.css";

type Source = HeroSlide["desktopImage"]["sources"][number];
const srcset = (sources: readonly Source[], format: string) =>
  sources
    .filter((x) => x.format === format)
    .map((x) => `${x.url} ${x.width}w`)
    .join(", ");

function SlidePicture({ slide, first }: { slide: HeroSlide; first: boolean }) {
  const { desktopImage: d, mobileImage: m } = slide;
  if (!d.url) return null;
  const mobileAvif = srcset(m.sources, "avif");
  const mobileWebp = srcset(m.sources, "webp");
  const desktopAvif = srcset(d.sources, "avif");
  const desktopWebp = srcset(d.sources, "webp");
  const focal: CSSProperties | undefined = slide.focalPoint
    ? {
        objectPosition: `${slide.focalPoint.x * 100}% ${slide.focalPoint.y * 100}%`,
      }
    : undefined;
  return (
    <picture>
      {mobileAvif ? (
        <source
          media="(max-width: 47.99rem)"
          type="image/avif"
          srcSet={mobileAvif}
          sizes="100vw"
        />
      ) : null}
      {mobileWebp ? (
        <source
          media="(max-width: 47.99rem)"
          type="image/webp"
          srcSet={mobileWebp}
          sizes="100vw"
        />
      ) : null}
      {desktopAvif ? (
        <source type="image/avif" srcSet={desktopAvif} sizes="100vw" />
      ) : null}
      {desktopWebp ? (
        <source type="image/webp" srcSet={desktopWebp} sizes="100vw" />
      ) : null}
      <img
        className={s.heroImage}
        src={d.url}
        alt={d.alt}
        width={d.width}
        height={d.height}
        style={focal}
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : "auto"}
        decoding="async"
      />
    </picture>
  );
}

/** Sets --hero-height to the viewport height below the hero's top edge. */
function useHeroHeight(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const set = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      // On a phone, the section gap (72 px) and part of the New Ins title
      // stay in view, so the page shows there is more below.
      const peek = window.innerWidth < 768 ? 112 : 0;
      el.style.setProperty("--hero-height", `calc(100svh - ${top + peek}px)`);
    };
    set();
    window.addEventListener("resize", set);
    return () => window.removeEventListener("resize", set);
  }, [ref]);
}

export function Hero({ slides }: { slides: readonly HeroSlide[] }) {
  const carousel = useCarousel(slides.length);
  const self = useRef<HTMLElement>(null);
  useHeroHeight(self);
  const [announce, setAnnounce] = useState(false);
  const touch = useRef<number | null>(null);
  const dots = useRef<(HTMLButtonElement | null)[]>([]);
  const current = carousel.index;

  const choose = (i: number) => {
    setAnnounce(true);
    carousel.go(i);
  };

  /** Keyboard on the indicators: the chosen slide's indicator takes focus. */
  const step = (to: number) => {
    const next = ((to % slides.length) + slides.length) % slides.length;
    choose(next);
    dots.current[next]?.focus();
  };

  if (slides.length === 0)
    return (
      <section
        ref={self}
        className={`${s.hero} ${s.field}`}
        aria-label="Sanéa Pret"
      >
        <div className={s.masthead}>
          <Monument />
        </div>
      </section>
    );

  return (
    <section
      ref={self}
      className={s.hero}
      aria-roledescription="carousel"
      aria-label="Campaign"
      data-playing={carousel.playing}
      {...carousel.bind}
      onTouchStart={(e) => {
        touch.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        const end = e.changedTouches[0]?.clientX;
        // A clear horizontal swipe only; vertical scrolling is never taken.
        if (start === null || end === undefined || Math.abs(end - start) < 48)
          return;
        choose(end < start ? current + 1 : current - 1);
      }}
    >
      <div className={s.slides} aria-live={announce ? "polite" : "off"}>
        {slides.map((slide, i) => (
          <div
            key={i}
            className={`${s.slide} ${i === current ? s.active : ""}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slides.length}`}
            aria-hidden={i !== current}
            inert={i !== current}
          >
            <SlidePicture slide={slide} first={i === 0} />
            <div className={s.scrim} />
            <div className={s.copy}>
              {slide.campaignLine ? (
                <p className={s.campaign}>{slide.campaignLine}</p>
              ) : null}
              <Link to={slide.href} className={s.cta}>
                {slide.ctaLabel}
              </Link>
            </div>
          </div>
        ))}
      </div>
      <div className={s.masthead}>
        <Monument />
      </div>
      {slides.length > 1 ? (
        <div className={s.controls}>
          <div className={s.dots} role="group" aria-label="Choose a slide">
            {slides.map((_, i) => (
              <button
                key={i}
                ref={(el) => {
                  dots.current[i] = el;
                }}
                type="button"
                className={s.dot}
                aria-label={`Show slide ${i + 1} of ${slides.length}`}
                aria-current={i === current ? "true" : undefined}
                onClick={() => choose(i)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") step(current + 1);
                  else if (e.key === "ArrowLeft") step(current - 1);
                  else if (e.key === "Home") step(0);
                  else if (e.key === "End") step(slides.length - 1);
                  else return;
                  e.preventDefault();
                }}
              >
                <span />
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.pause}
            onClick={carousel.togglePause}
            disabled={carousel.reduced}
            aria-label={`${carousel.paused ? "Play" : "Pause"} slides`}
          >
            {carousel.paused ? "Play" : "Pause"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
