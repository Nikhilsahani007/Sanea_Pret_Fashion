// Fixture tests for the hard-coded design value check (TD-002 "Verification method").
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import {
  checkFile,
  checkTokenSources,
  findingsInCss,
  findingsInTs,
  parseRegister,
  run,
  tokenIndex,
} from "./check-design-tokens.mjs";

const REGISTER = `
| ID | File | Reason | Approved by | Date |
|----|------|--------|-------------|------|
| DTX-001 | \`apps/admin/src/embed.module.css\` | Third-party embed needs a literal | Owner | 2026-10-22 |
`;
const register = parseRegister(REGISTER).entries;
const literals = (css) => findingsInCss(css).map((f) => f.literal);
const MODULE = "apps/admin/src/embed.module.css";

describe("CSS values", () => {
  it("fails a hex colour in a module stylesheet", () => {
    expect(literals(".a { color: #351a2b; }")).toEqual(["#351a2b"]);
    expect(literals(".a {\n  border: 1px solid #ccc;\n}")).toEqual(["#ccc"]);
  });

  it("fails colour functions with literal arguments", () => {
    expect(literals(".a { background: rgb(0 0 0 / 0.4); }")).toEqual([
      "rgb(0 0 0 / 0.4)",
    ]);
    expect(literals(".a { color: oklch(0.5 0.1 20); }")).toHaveLength(1);
    expect(literals(".a { color: hsl(10deg 50% 50%); }")).toHaveLength(1);
  });

  it("fails named colours and system colours outside forced-colors", () => {
    expect(literals(".a { color: white; }")).toEqual(["white"]);
    expect(literals(".a { box-shadow: 0 0 2px Black; }")).toEqual(["Black"]);
    expect(literals(".a { outline-color: CanvasText; }")).toEqual([
      "CanvasText",
    ]);
  });

  it("fails literal font families", () => {
    expect(literals('.a { font-family: "Helvetica Neue", Arial; }')).toEqual([
      '"Helvetica Neue"',
      "Arial",
    ]);
    expect(literals(".a { font-family: var(--sp-font-text), serif; }")).toEqual(
      ["serif"],
    );
    expect(literals('.a { font: 400 1rem/1.5 "Switzer"; }')).toEqual([
      '"Switzer"',
    ]);
  });

  it("passes tokens, keywords and color-mix of tokens", () => {
    expect(
      literals(`.a {
        color: var(--sp-ink);
        background: transparent;
        border-color: currentColor;
        fill: none;
        outline: var(--sp-focus-width) solid var(--sp-focus);
        background-color: color-mix(in srgb, var(--sp-ink) 8%, transparent);
        font-family: var(--sp-font-text);
        font: inherit;
        color: inherit;
        transition: color var(--sp-duration-fast) var(--sp-ease-out);
      }`),
    ).toEqual([]);
  });

  it("passes CSS system colours inside @media (forced-colors: active)", () => {
    expect(
      literals(`@media (forced-colors: active) {
        .a { outline-color: CanvasText; border-color: ButtonText; }
        .b:focus-visible { outline-color: Highlight; }
      }`),
    ).toEqual([]);
  });

  it("ignores selectors, comments, strings and url()", () => {
    expect(
      literals(`/* color: #fff; red */
        #fade, .red, [data-tone="white"] { content: "white #fff"; }
        .a:hover { background-image: url(./white.svg); }
        .grid { grid-template-areas: "a b"; }`),
    ).toEqual([]);
  });

  it("reports the right line", () => {
    expect(findingsInCss(".a {\n  gap: 1rem;\n  color: #000;\n}")).toEqual([
      { line: 3, literal: "#000" },
    ]);
  });

  it("checks custom properties defined in app stylesheets", () => {
    expect(literals(":root { --local: #123456; }")).toEqual(["#123456"]);
  });
});

describe("TypeScript values", () => {
  const ts = (source) => findingsInTs(source).map((f) => f.literal);

  it("fails colour strings in style props and theme objects", () => {
    expect(ts('const s = { color: "#fff", background: "red" };')).toEqual([
      "#fff",
      "red",
    ]);
    expect(ts('<div style={{ borderColor: "rgb(0 0 0)" }} />')).toEqual([
      "rgb(0 0 0)",
    ]);
    expect(ts('<path fill="#000" />')).toEqual(["#000"]);
    expect(ts("const theme = { ink: '#351a2b' };")).toEqual(["#351a2b"]);
    expect(ts('const s = { fontFamily: "Arial" };')).toEqual(["Arial"]);
  });

  it("passes ordinary strings and token references", () => {
    expect(
      ts(`const a = "Order #1234";
          const b = "#main";
          const c = { color: "var(--sp-ink)", fontFamily: "inherit" };
          const d = "white space"; // color: "#fff"
          /* fill: "#000" */`),
    ).toEqual([]);
  });
});

describe("exception markers and the register", () => {
  it("passes a literal with a registered marker on the same line or the line above", () => {
    const same = checkFile(
      MODULE,
      ".a { color: #fff; /* design-token-exception: DTX-001 */ }",
      register,
    );
    expect(same.findings).toEqual([]);
    expect(same.exceptions).toEqual([
      { path: MODULE, line: 1, literal: "#fff", id: "DTX-001" },
    ]);

    const above = checkFile(
      MODULE,
      ".a {\n  /* design-token-exception: DTX-001 */\n  color: #fff;\n}",
      register,
    );
    expect(above.findings).toEqual([]);
    expect(above.exceptions).toHaveLength(1);
  });

  it("fails a marker with an unknown ID", () => {
    const { findings } = checkFile(
      MODULE,
      ".a { color: #fff; /* design-token-exception: DTX-999 */ }",
      register,
    );
    expect(findings.map((f) => f.message)).toEqual([
      "marker DTX-999 is not in docs/design-token-exceptions.md",
      "hard-coded design value; use a token",
    ]);
  });

  it("fails a registered marker used in another file", () => {
    const { findings } = checkFile(
      "apps/admin/src/other.module.css",
      ".a { color: #fff; /* design-token-exception: DTX-001 */ }",
      register,
    );
    expect(findings).toHaveLength(2);
    expect(findings[0].message).toContain("registered for");
  });

  it("does not let a marker two lines above cover a literal", () => {
    const { findings } = checkFile(
      MODULE,
      "/* design-token-exception: DTX-001 */\n.a {\n  color: #fff;\n}",
      register,
    );
    expect(findings).toHaveLength(1);
  });

  it("reports register rows without a reason, approver or valid date", () => {
    const { problems } = parseRegister(`
| DTX-002 | \`apps/admin/src/a.css\` |  | Owner | 2026-10-22 |
| DTX-003 | \`apps/admin/src/a.css\` | Reason | | 22/10/2026 |
| DTX-2 | \`apps/admin/src/a.css\` | Reason | Owner | 2026-10-22 |
`);
    expect(problems).toEqual([
      "DTX-002: no reason",
      "DTX-003: no approved by",
      "DTX-003: the date must be YYYY-MM-DD",
      "DTX-2: the ID must look like DTX-001",
    ]);
  });

  it("names the primitive when a literal matches a token value", () => {
    const index = tokenIndex(":root { --sp-aubergine: #351a2b; }");
    const { findings } = checkFile(
      MODULE,
      ".a { color: #351A2B; }",
      new Map(),
      index,
    );
    expect(findings[0].message).toBe(
      "`#351A2B` is --sp-aubergine; use the semantic token instead",
    );
  });
});

describe("token sources", () => {
  const brand = ":root { --sp-white: #fff; --sp-ink-0: #000; }";
  const layer =
    ":root { --sp-bg: var(--sp-white); --sp-ink: var(--sp-ink-0); }";

  it("passes matching semantic layers built from primitives", () => {
    expect(
      checkTokenSources({
        "brand.css": brand,
        "storefront.css": layer,
        "admin.css": layer,
        "fonts.css": "",
      }),
    ).toEqual([]);
  });

  it("fails literals, unknown primitives and missing names in a layer", () => {
    expect(
      checkTokenSources({
        "brand.css": brand,
        "storefront.css":
          ":root { --sp-bg: #fff; --sp-ink: var(--sp-nope); --sp-x: var(--sp-white); }",
        "admin.css": layer,
        "fonts.css": "",
      }),
    ).toEqual([
      "storefront.css: --sp-bg must be var() of one brand primitive",
      "storefront.css: --sp-ink refers to --sp-nope, which brand.css does not define",
      "admin.css: missing --sp-x (defined in storefront.css)",
    ]);
  });

  it("fails primitives without the --sp- prefix", () => {
    expect(
      checkTokenSources({
        "brand.css": ":root { --ink: #000; }",
        "storefront.css": "",
        "admin.css": "",
        "fonts.css": "",
      }),
    ).toEqual(["brand.css: --ink must use the --sp- prefix"]);
  });
});

describe("repository run", () => {
  const dirs = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function fixtureRepo(files) {
    const root = mkdtempSync(join(tmpdir(), "sp-tokens-"));
    dirs.push(root);
    const tokens = {
      "packages/shared/src/tokens/brand.css": ":root { --sp-ink-0: #000; }",
      "packages/shared/src/tokens/storefront.css":
        ":root { --sp-ink: var(--sp-ink-0); }",
      "packages/shared/src/tokens/admin.css":
        ":root { --sp-ink: var(--sp-ink-0); }",
      "packages/shared/src/tokens/fonts.css": "",
      "docs/design-token-exceptions.md": "",
    };
    for (const [path, text] of Object.entries({ ...tokens, ...files })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return root;
  }

  it("scans the UI apps' src and ignores the token sources, API, tests and fixtures", () => {
    const root = fixtureRepo({
      "apps/admin/src/a.module.css": ".a { color: #000; }",
      "apps/api/src/seed.ts": 'const swatch = { hex: "#000" };',
      "apps/admin/src/a.test.tsx": 'const s = { color: "#000" };',
      "apps/admin/src/e2e/fixtures/b.css": ".b { color: #000; }",
      "apps/storefront/src/ok.module.css": ".c { color: var(--sp-ink); }",
      "apps/storefront/README.md": "color: #000",
    });
    const { findings, problems } = run(root);
    expect(problems).toEqual([]);
    expect(findings.map((f) => `${f.path}:${f.line}`)).toEqual([
      "apps/admin/src/a.module.css:1",
    ]);
    expect(findings[0].message).toContain("--sp-ink-0");
  });

  it("passes on this repository", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const { findings, problems } = run(root);
    expect(problems).toEqual([]);
    expect(findings).toEqual([]);
  });
});
