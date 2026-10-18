/** Outcome of normalising user input: a value, or a stable error code. */
export type Result<T, E extends string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: E };

export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

export function fail<E extends string>(
  code: E,
): { readonly ok: false; readonly code: E } {
  return { ok: false, code };
}
