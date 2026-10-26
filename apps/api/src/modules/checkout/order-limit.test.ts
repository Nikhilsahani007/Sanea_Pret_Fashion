// Phase 17 security review: at most 10 new orders per cart per hour
// (security-design.md §3), counted in a sliding window.
import { describe, expect, it } from "vitest";

import { cartOrderLimit } from "./router.ts";

describe("orders per cart", () => {
  it("refuses the eleventh order in an hour, per cart, and forgets after the window", () => {
    let t = Date.parse("2026-10-26T10:00:00Z");
    const limit = cartOrderLimit(
      { windowMs: 3_600_000, limit: 10 },
      () => new Date(t),
    );
    for (let i = 0; i < 10; i++) {
      limit.check("cart-a");
      limit.record("cart-a");
      t += 60_000;
    }
    expect(() => limit.check("cart-a")).toThrow(
      expect.objectContaining({ code: "RATE_LIMITED" }),
    );
    // Another cart, and no cart at all (refused later as an empty bag), pass.
    expect(() => limit.check("cart-b")).not.toThrow();
    expect(() => limit.check(null)).not.toThrow();
    // The first order leaves the window an hour after it was placed.
    t = Date.parse("2026-10-26T11:00:00.001Z");
    expect(() => limit.check("cart-a")).not.toThrow();
  });
});
