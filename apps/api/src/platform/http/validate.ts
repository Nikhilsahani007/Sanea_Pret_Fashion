import { toFieldErrors, type FieldError } from "@sanea/shared";
import type { RequestHandler } from "express";
import type { z } from "zod";

import { AppError } from "./errors.ts";

type Schemas = {
  readonly body?: z.ZodType;
  readonly query?: z.ZodType;
  readonly params?: z.ZodType;
};

export type ValidatedInput = {
  body?: unknown;
  query?: unknown;
  params?: unknown;
};

/**
 * Validates body, query and params with Zod. On failure: `400 VALIDATION_FAILED`
 * with field errors whose paths start with `body.`, `query.` or `params.`.
 * Parsed values are stored on `res.locals.input`.
 */
export function validate(schemas: Schemas): RequestHandler {
  return (req, res, next) => {
    const input: ValidatedInput = {};
    const details: FieldError[] = [];
    for (const location of ["body", "query", "params"] as const) {
      const schema = schemas[location];
      if (!schema) continue;
      const result = schema.safeParse(req[location]);
      if (result.success) {
        input[location] = result.data;
      } else {
        for (const error of toFieldErrors(result.error)) {
          details.push({
            ...error,
            path: error.path ? `${location}.${error.path}` : location,
          });
        }
      }
    }
    if (details.length > 0)
      return next(new AppError("VALIDATION_FAILED", details));
    res.locals.input = input;
    next();
  };
}
