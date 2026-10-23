// The supplied logo (D-096, Q11-1): an image, never retyped. The header uses
// the wordmark alone; the footer uses the lockup with "EFFORTLESS ELEGANCE".
// Both are raster crops of the supplied screenshot, fine at these sizes; the
// Phase 12 monument needs a vector export (B-04).
import lockup from "../assets/logo-lockup.png";
import wordmark from "../assets/logo-wordmark.png";
import s from "./shell.module.css";

export const BRAND_NAME = "Sanéa Pret";
/** The logo's own printed tagline, read out with it. */
export const TAGLINE = "Effortless Elegance"; // taste-skill-ignore

export function Wordmark() {
  return (
    <img
      className={s.wordmark}
      src={wordmark}
      alt={BRAND_NAME}
      width={889}
      height={236}
    />
  );
}

/** The logo with its tagline, shown in ivory on the aubergine footer. */
export function Lockup() {
  return (
    <img
      className={s.lockup}
      src={lockup}
      alt={`${BRAND_NAME}, ${TAGLINE}`}
      width={889}
      height={334}
    />
  );
}

/**
 * The monument (phase-12-plan.md P12-1): the wordmark at hero scale. It is
 * decorative here, since the page's h1 carries the name. Rendered from the
 * raster crop for development only; the vector export replaces it (B-04).
 */
export function Monument() {
  return (
    <img
      className={s.monument}
      src={wordmark}
      alt=""
      aria-hidden="true"
      width={889}
      height={236}
      fetchPriority="high"
    />
  );
}
