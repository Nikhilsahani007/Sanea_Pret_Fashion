// The supplied logo (D-096, Q11-1): an image, never retyped. The header uses
// the wordmark alone; the footer uses the lockup with "EFFORTLESS ELEGANCE".
// Both are raster crops of the supplied screenshot, fine at these sizes; the
// Phase 12 monument needs a vector export (B-04).
import lockup from "../assets/logo-lockup.png";
import wordmark from "../assets/logo-wordmark.png";
import s from "./shell.module.css";

export const BRAND_NAME = "Sanéa Pret";

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
      alt={`${BRAND_NAME}, Effortless Elegance`}
      width={889}
      height={334}
    />
  );
}
