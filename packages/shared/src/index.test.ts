import { describe, expect, it } from "vitest";

// Smoke test: proves the runner, TypeScript and workspace module resolution work.
// Real tests start in Phase 4.
describe("@sanea/shared", () => {
  it("loads its entry module", async () => {
    const entry = await import("./index.js");
    expect(entry).toBeTypeOf("object");
  });
});
