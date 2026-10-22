// The authenticator QR code (U8-3). Encoded in the browser by `qr` (no
// network, no third-party QR service) and drawn as SVG rectangles from the raw
// module matrix, so no markup string is injected.
import encodeQR from "qr";
import { useMemo } from "react";

import s from "./auth.module.css";

/** Dark modules as SVG path data, one `h1v1h-1z` square per module. */
export function qrPath(matrix: boolean[][]): string {
  let d = "";
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return d;
}

export function QrCode({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(
    () => encodeQR(value, "raw", { ecc: "medium" }),
    [value],
  );
  const size = matrix.length;
  const quiet = 4; // the quiet zone readers need around the code
  return (
    <svg
      className={s.qr}
      role="img"
      aria-label={label}
      viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
      shapeRendering="crispEdges"
    >
      <rect
        className={s.qrGround}
        x={-quiet}
        y={-quiet}
        width={size + quiet * 2}
        height={size + quiet * 2}
      />
      <path className={s.qrInk} d={qrPath(matrix)} />
    </svg>
  );
}
