// Display formats: INR from paise (shared), Indian dates, file sizes, and
// rupee input for price fields.
import { formatInr, paise, parseRupeesToPaise } from "@sanea/shared";

export const inr = (amountPaise: number) => formatInr(paise(amountPaise));

const dateTime = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const when = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : "—";

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** "1299.50" → 129950 paise, or an error message. */
export function rupeesToPaise(
  text: string,
): { ok: true; value: number } | { ok: false; message: string } {
  const result = parseRupeesToPaise(text);
  if (result.ok) return { ok: true, value: result.value };
  return {
    ok: false,
    message:
      "Enter an amount in rupees, such as 1299 or 1299.50, without commas or ₹.",
  };
}

export const paiseToRupeesText = (amountPaise: number) =>
  (amountPaise / 100).toFixed(2).replace(/\.00$/, "");

/** A suggested slug from a name: lowercase words joined by hyphens. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100)
    .replace(/-+$/, "");
}

/** `datetime-local` value (IST) to an ISO string with offset, and back. */
export function localToIso(value: string): string | null {
  return value ? `${value}:00+05:30` : null;
}

export function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const ist = new Date(new Date(iso).getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 16);
}
