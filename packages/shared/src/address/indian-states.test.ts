import { describe, expect, it } from "vitest";

import { toFieldErrors } from "../validation/errors.ts";
import {
  INDIAN_STATE_KEYS,
  INDIAN_STATE_NAMES,
  indianStateSchema,
} from "./indian-states.ts";

describe("Indian states and union territories", () => {
  it("lists 36 entries: 28 states and 8 union territories", () => {
    expect(INDIAN_STATE_KEYS).toHaveLength(36);
    expect(new Set(Object.values(INDIAN_STATE_NAMES)).size).toBe(36);
  });

  it("uses lowercase kebab-case keys", () => {
    for (const key of INDIAN_STATE_KEYS)
      expect(key).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
  });

  it("includes the current union territories", () => {
    expect(INDIAN_STATE_NAMES["dadra-and-nagar-haveli-and-daman-and-diu"]).toBe(
      "Dadra and Nagar Haveli and Daman and Diu",
    );
    expect(INDIAN_STATE_NAMES.ladakh).toBe("Ladakh");
    expect(INDIAN_STATE_NAMES["jammu-and-kashmir"]).toBe("Jammu and Kashmir");
  });

  it("validates keys, not display names", () => {
    expect(indianStateSchema.parse("maharashtra")).toBe("maharashtra");
    for (const [input, code] of [
      ["Maharashtra", "STATE_INVALID"],
      ["MH", "STATE_INVALID"],
      ["bombay", "STATE_INVALID"],
      [undefined, "REQUIRED"],
    ] as const) {
      const result = indianStateSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(toFieldErrors(result.error).map((e) => e.code)).toEqual([code]);
    }
  });
});
