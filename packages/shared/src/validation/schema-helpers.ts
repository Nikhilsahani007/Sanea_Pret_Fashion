import type { ValidationCode } from "./errors.ts";

/**
 * Error function for a base schema: missing values report REQUIRED, anything
 * else reports the given code. Internal; not part of the public API.
 */
export function requiredOr(code: ValidationCode) {
  return (issue: { readonly input?: unknown }): ValidationCode =>
    issue.input === undefined ? "REQUIRED" : code;
}

/** Error function for strict objects: unknown keys report UNKNOWN_FIELD. */
export function unknownFieldError(issue: {
  readonly code?: string;
}): ValidationCode | undefined {
  return issue.code === "unrecognized_keys" ? "UNKNOWN_FIELD" : undefined;
}
