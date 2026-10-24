import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/** Lowercase ASCII words joined by single hyphens, at most 120 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugSchema = z
  .string({ error: requiredOr("INVALID_TYPE") })
  .max(120, { error: "TOO_LONG" })
  .regex(SLUG_PATTERN, { error: "INVALID" });

/**
 * A URL slug from a name: accents removed, lowercase, non-alphanumerics
 * collapsed to hyphens. Returns "" when nothing usable remains.
 */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/g, "");
}
