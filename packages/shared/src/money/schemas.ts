import { z } from "zod";

import type { ValidationCode } from "../validation/errors.ts";
import { requiredOr } from "../validation/schema-helpers.ts";
import { MAX_AMOUNT_PAISE, type Paise } from "./paise.ts";
import { parseRupeesToPaise } from "./parse.ts";

type Limits = {
  readonly min: "any" | "non-negative" | "positive";
  readonly max: number;
};

function moneyIssue(value: number, limits: Limits): ValidationCode | undefined {
  if (!Number.isInteger(value)) return "MONEY_NOT_INTEGER";
  if (!Number.isSafeInteger(value)) return "MONEY_UNSAFE";
  if (limits.min === "non-negative" && value < 0) return "MONEY_NEGATIVE";
  if (limits.min === "positive" && value <= 0) return "MONEY_NOT_POSITIVE";
  if (value > limits.max) return "MONEY_ABOVE_LIMIT";
  return undefined;
}

function moneySchema(limits: Limits) {
  return z
    .number({ error: requiredOr("INVALID_TYPE") })
    .superRefine((value, ctx) => {
      const code = moneyIssue(value, limits);
      if (code) ctx.addIssue({ code: "custom", message: code });
    })
    .transform((value) => (value === 0 ? 0 : value) as Paise);
}

/** Any safe-integer paise value, positive or negative (for deltas). JSON numbers only. */
export const paiseSchema = moneySchema({
  min: "any",
  max: Number.MAX_SAFE_INTEGER,
});

/** 0 to 2,147,483,647 paise (temporary cap until Phase 6). */
export const amountPaiseSchema = moneySchema({
  min: "non-negative",
  max: MAX_AMOUNT_PAISE,
});

/** 1 to 2,147,483,647 paise (temporary cap until Phase 6). */
export const pricePaiseSchema = moneySchema({
  min: "positive",
  max: MAX_AMOUNT_PAISE,
});

/** A rupee string typed by a person (see `parseRupeesToPaise`), capped at 2,147,483,647 paise. */
export const rupeesInputSchema = z
  .string({ error: requiredOr("INVALID_TYPE") })
  .transform((value, ctx) => {
    const parsed = parseRupeesToPaise(value);
    if (!parsed.ok) {
      ctx.addIssue({
        code: "custom",
        message: value.trim() === "" ? "REQUIRED" : parsed.code,
      });
      return z.NEVER;
    }
    if (parsed.value > MAX_AMOUNT_PAISE) {
      ctx.addIssue({ code: "custom", message: "MONEY_ABOVE_LIMIT" });
      return z.NEVER;
    }
    return parsed.value;
  });
