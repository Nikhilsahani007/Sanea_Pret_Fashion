// Fixture tests from TD-002 "Verification method".
import { describe, expect, it } from "vitest";

import { registeredIds, scan, tokenValues } from "./check-design-tokens.ts";

const css = (text: string) =>
  scan("x.module.css", text, "css").findings.map((f) => f.literal);

describe("design token check", () => {
  it("fails a hex value in a module stylesheet and names the token", () => {
    const tokens = tokenValues(":root { --sp-ivory: #f6f1e7; }");
    const result = scan(
      "a.module.css",
      ".a { color: #F6F1E7; }",
      "css",
      tokens,
    );
    expect(result.findings).toEqual([
      { file: "a.module.css", line: 1, literal: "#F6F1E7", hint: "--sp-ivory" },
    ]);
  });
  it("fails rgb() with literal arguments", () => {
    expect(css(".a { background: rgb(0 0 0 / 0.4); }")).toEqual([
      "rgb(0 0 0 / 0.4)",
    ]);
  });
  it("passes tokens, keywords and token-only color-mix()", () => {
    expect(
      css(
        ".a { color: var(--sp-ink); border-color: transparent; fill: currentColor; }",
      ),
    ).toEqual([]);
    expect(
      css(
        ".a { background: color-mix(in srgb, var(--sp-ink) 8%, transparent); }",
      ),
    ).toEqual([]);
  });
  it("fails named colours and literal font families, not token names", () => {
    expect(css(".a { color: white; }")).toEqual(["white"]);
    expect(css(".a { font-family: Georgia, serif; }")).toEqual([
      "Georgia, serif",
    ]);
    expect(
      css(".a { color: var(--sp-white); font-family: var(--sp-face); }"),
    ).toEqual([]);
  });
  it("allows system colours only inside a forced-colors query", () => {
    expect(
      css(
        "@media (forced-colors: active) {\n  .a { outline-color: CanvasText; }\n}",
      ),
    ).toEqual([]);
    expect(css(".a { outline-color: CanvasText; }")).toEqual(["CanvasText"]);
  });
  it("honours a marker on the same line or the line above", () => {
    const text = "/* design-token-exception: DTX-001 */\n.a { color: #000; }";
    const result = scan("a.css", text, "css");
    expect(result.findings).toEqual([]);
    expect(result.markers).toEqual([{ line: 1, id: "DTX-001" }]);
  });
  it("ignores comments", () => {
    expect(css("/* was #123456 */ .a { color: var(--sp-ink); }")).toEqual([]);
  });
  it("flags colour strings and font families in TypeScript", () => {
    const ts = (t: string) =>
      scan("a.tsx", t, "ts").findings.map((f) => f.literal);
    expect(ts(`const s = { color: "#ff0000" };`)).toEqual(["#ff0000"]);
    expect(ts(`const s = { background: "rgba(0,0,0,0.5)" };`)).toEqual([
      "rgba(0,0,0,0.5)",
    ]);
    expect(ts(`const s = { fontFamily: "Arial" };`)).toEqual(['"Arial"']);
    expect(ts(`const id = "#main"; // #fff in a comment`)).toEqual([]);
  });
  it("reads registered IDs and rejects entries without a reason", () => {
    const reg =
      "| ID | File | Reason |\n|--|--|--|\n| DTX-001 | a.css | Embed needs a literal |\n| DTX-002 | b.css |  |";
    const { ids, problems } = registeredIds(reg);
    expect([...ids]).toEqual(["DTX-001"]);
    expect(problems).toEqual(["DTX-002 has no reason in the register"]);
  });
});
