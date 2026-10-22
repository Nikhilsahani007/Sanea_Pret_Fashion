import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/** Lowercase letters and digits in hyphen-separated words, at most 100 characters. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SLUG_MAX_LENGTH = 100;

/** A URL slug for products, categories, collections and pages (phase-8-plan.md §5.3). */
export const slugSchema = z
  .string({ error: requiredOr("INVALID_TYPE") })
  .max(SLUG_MAX_LENGTH, { error: "TOO_LONG" })
  .regex(SLUG_PATTERN, { error: "SLUG_INVALID" });
