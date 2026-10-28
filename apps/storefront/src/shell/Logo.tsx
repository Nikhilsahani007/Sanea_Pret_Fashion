// The supplied logo (D-096; the full lockup supplied 2026-10-26, D-187): an
// image, never retyped. The header uses the wordmark alone; the footer the
// lockup (the arch and the wordmark) in ivory and champagne on aubergine; the
// hero's monument the wordmark in ivory. Colour versions are made from the
// supplied file with its alpha kept, so nothing is redrawn. A vector export
// would still be sharper at hero scale (B-04).
import lockupIvory from "../assets/logo-lockup-ivory.png";
import wordmark from "../assets/logo-wordmark.png";
import wordmarkIvory from "../assets/logo-wordmark-ivory.png";
import wordmarkIvoryHd from "../assets/logo-wordmark-ivory-hd.png";
import s from "./shell.module.css";

export const BRAND_NAME = "Sanéa Pret";
/** The brand's tagline (project brief), used in the home page title. */
export const TAGLINE = "Effortless Elegance"; // taste-skill-ignore

export function Wordmark() {
  return (
    <img
      className={s.wordmark}
      src={wordmark}
      alt={BRAND_NAME}
      width={858}
      height={134}
    />
  );
}

/** The arch and the wordmark, in ivory and champagne on the aubergine footer. */
export function Lockup() {
  return (
    <img
      className={s.lockup}
      src={lockupIvory}
      alt={BRAND_NAME}
      width={870}
      height={479}
    />
  );
}

/**
 * The monument (phase-12-plan.md P12-1): the wordmark across the hero, in
 * ivory. It is decorative here, since the page's h1 carries the name. At
 * this size the supplied 858 px raster is too soft, so wide screens get a
 * 2574 px version made from it (upscaled, edges re-sharpened; never
 * retyped) until the vector logo arrives (B-04).
 */
export function Monument() {
  return (
    <img
      className={s.monument}
      src={wordmarkIvory}
      srcSet={`${wordmarkIvory} 858w, ${wordmarkIvoryHd} 2574w`}
      sizes="calc(100vw - 2rem)"
      alt=""
      aria-hidden="true"
      width={858}
      height={134}
      fetchPriority="high"
    />
  );
}
