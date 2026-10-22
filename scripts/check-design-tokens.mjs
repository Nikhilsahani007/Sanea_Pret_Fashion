// Hard-coded design value check (TD-002, D-086). No dependencies.
//
//   node scripts/check-design-tokens.mjs        (npm run check:tokens)
//
// Scans apps/{storefront,admin}/src for literal colours and font families that should come from
// the shared tokens, and checks the token sources themselves. A literal is
// allowed only with a `design-token-exception: DTX-nnn` marker on the same line
// or the line above, whose ID is registered in docs/design-token-exceptions.md.
// Exits 1 on any finding.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// prettier-ignore
const NAMED_COLOURS = new Set(("aliceblue antiquewhite aqua aquamarine azure beige bisque black " +
  "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral " +
  "cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen " +
  "darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon " +
  "darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink " +
  "deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro " +
  "ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo " +
  "ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan " +
  "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen " +
  "lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen " +
  "magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen " +
  "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream " +
  "mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid " +
  "palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum " +
  "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown " +
  "seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen " +
  "steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow " +
  "yellowgreen").split(" "));

// CSS system colours: allowed only inside @media (forced-colors: active).
// prettier-ignore
const SYSTEM_COLOURS = new Set(["accentcolor", "accentcolortext", "activetext", "buttonborder",
  "buttonface", "buttontext", "canvas", "canvastext", "field", "fieldtext", "graytext",
  "highlight", "highlighttext", "linktext", "mark", "marktext", "selecteditem",
  "selecteditemtext", "visitedtext"]);

const CSS_WIDE = new Set([
  "inherit",
  "initial",
  "unset",
  "revert",
  "revert-layer",
]);
// prettier-ignore
const GENERIC_FAMILIES = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-serif", "ui-sans-serif", "ui-monospace", "ui-rounded", "math", "emoji",
  "fangsong"]);

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const COLOUR_FN = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const MARKER = /design-token-exception:\s*([A-Z]+-\d+)/g;
const DTX_ID = /^DTX-\d{3}$/;

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const blank = (s) => s.replace(/[^\n]/g, " ");
const toPosix = (p) => p.split(sep).join("/");

/** Replaces `var(...)` calls, keeping offsets, so their names are not scanned. */
function blankVars(value) {
  let out = value;
  for (;;) {
    const m = /var\([^()]*\)/.exec(out);
    if (!m) return out;
    out =
      out.slice(0, m.index) + blank(m[0]) + out.slice(m.index + m[0].length);
  }
}

/** Returns the argument text of a function call starting at `open` (the "("). */
function argumentsAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

/** Markers by line number (1-based) from the raw source. */
function markersOf(text) {
  const byLine = new Map();
  for (const m of text.matchAll(MARKER)) {
    const line = lineOf(text, m.index);
    byLine.set(line, [...(byLine.get(line) ?? []), m[1]]);
  }
  return byLine;
}

// ── Values ────────────────────────────────────────────────────────────────

/**
 * Literal colours and families in one CSS value, with offsets into `value`.
 * `forcedColors` allows system colours (high-contrast support).
 */
export function literalsInValue(
  property,
  value,
  { forcedColors = false } = {},
) {
  const found = [];
  const scan = blankVars(value);
  // Quoted strings and url() hold text and paths, not colours.
  const words = scan
    .replace(/(["'])(?:\\.|(?!\1)[^\\])*\1/g, blank)
    .replace(/url\([^)]*\)/gi, blank);

  for (const m of words.matchAll(HEX))
    found.push({ index: m.index, literal: m[0] });

  for (const m of words.matchAll(COLOUR_FN)) {
    const args = argumentsAt(words, m.index + m[0].length - 1);
    // Literal arguments: numbers, hex or named colours. `rgb(from var(--x) r g b)`
    // with only custom properties and channel keywords is allowed.
    if (
      /\d|#/.test(args) ||
      identifiers(args).some((w) => NAMED_COLOURS.has(w))
    )
      found.push({ index: m.index, literal: `${m[0]}${args.trim()})` });
  }

  for (const m of words.matchAll(/(?<![\w#.-])[a-zA-Z][\w-]*/g)) {
    const w = m[0].toLowerCase();
    if (NAMED_COLOURS.has(w)) found.push({ index: m.index, literal: m[0] });
    else if (
      SYSTEM_COLOURS.has(w) &&
      !forcedColors &&
      isColourProperty(property)
    )
      found.push({ index: m.index, literal: m[0] });
  }

  if (property === "font-family") {
    for (const family of scan.split(",")) {
      const name = family.trim();
      if (name && !CSS_WIDE.has(name.toLowerCase()))
        found.push({ index: scan.indexOf(name), literal: name });
    }
  } else if (property === "font") {
    for (const m of scan.matchAll(/(["'])(?:\\.|(?!\1)[^\\])*\1/g))
      found.push({ index: m.index, literal: m[0] });
    for (const m of words.matchAll(/(?<![\w-])[a-z][\w-]*/gi))
      if (GENERIC_FAMILIES.has(m[0].toLowerCase()))
        found.push({ index: m.index, literal: m[0] });
  }

  // One finding per span: a hex inside a flagged rgb() is reported once.
  let end = -1;
  return found
    .sort((a, b) => a.index - b.index || b.literal.length - a.literal.length)
    .filter((f) => {
      if (f.index < end) return false;
      end = f.index + f.literal.length;
      return true;
    });
}

const identifiers = (text) =>
  text.match(/(?<![\w#.-])[a-zA-Z][\w-]*/g)?.map((w) => w.toLowerCase()) ?? [];
const isColourProperty = (p) =>
  p.startsWith("--") ||
  /colou?r|background|border|outline|fill|stroke|shadow|caret|accent|decoration/.test(
    p,
  );

// ── CSS ───────────────────────────────────────────────────────────────────

/** Declarations in a stylesheet: `{ property, value, offset, forcedColors }`. */
export function declarationsOf(css) {
  // Comments become spaces so offsets (and line numbers) are kept.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, blank);
  const out = [];
  const stack = []; // one entry per open block: true when inside forced-colors
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    const ch = text[i];
    if (ch === '"' || ch === "'") {
      const end = text.indexOf(ch, i + 1);
      i = end === -1 ? text.length : end;
      continue;
    }
    if (ch !== "{" && ch !== "}" && ch !== ";" && i !== text.length) continue;
    const statement = text.slice(start, i);
    if (ch === "{") {
      const prelude = statement.trim();
      stack.push(
        (stack.at(-1) ?? false) ||
          /^@media\b[^{]*forced-colors\s*:\s*active/i.test(prelude),
      );
    } else {
      const colon = statement.indexOf(":");
      if (stack.length > 0 && colon !== -1) {
        const property = statement.slice(0, colon).trim().toLowerCase();
        if (/^(--)?[a-z][\w-]*$/.test(property))
          out.push({
            property,
            value: statement.slice(colon + 1),
            offset: start + colon + 1,
            forcedColors: stack.at(-1) ?? false,
          });
      }
      if (ch === "}") stack.pop();
    }
    start = i + 1;
  }
  return out;
}

export function findingsInCss(css) {
  return declarationsOf(css).flatMap((d) =>
    literalsInValue(d.property, d.value, d).map((f) => ({
      line: lineOf(css, d.offset + f.index),
      literal: f.literal.trim(),
    })),
  );
}

// ── TypeScript ────────────────────────────────────────────────────────────

/** String literals in TS or TSX, with the code just before each on its line. */
function stringsOf(source) {
  const out = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i === -1) break;
    } else if (ch === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch)
        j += source[j] === "\\" ? 2 : 1;
      const lineStart = source.lastIndexOf("\n", i) + 1;
      out.push({
        index: i + 1,
        text: source.slice(i + 1, j),
        before: source.slice(lineStart, i),
      });
      i = j + 1;
    } else i += 1;
  }
  return out;
}

// A string is a style value when it follows a colour-bearing key in a style
// object or JSX attribute (`color: "…"`, `fill="…"`).
const STYLE_KEY =
  /\b(colou?r|background(Color|Image)?|border(Top|Right|Bottom|Left)?(Color)?|outline(Color)?|boxShadow|textShadow|fill|stroke|caretColor|accentColor|textDecorationColor)["']?\s*[:=]\s*\{?\s*$/;
const FONT_KEY = /\bfontFamily["']?\s*[:=]\s*\{?\s*$/;
const WHOLE_COLOUR =
  /^(?:#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(.*\))$/i;

/**
 * TS and TSX: colour strings in style props and theme objects (TD-002). Other
 * strings, such as "Order #1234", are not design values and are not scanned.
 */
export function findingsInTs(source) {
  const found = [];
  for (const s of stringsOf(source)) {
    const at = (offset, literal) =>
      found.push({ line: lineOf(source, s.index + offset), literal });
    const value = s.text.trim();
    if (STYLE_KEY.test(s.before)) {
      for (const f of literalsInValue("color", s.text)) at(f.index, f.literal);
    } else if (WHOLE_COLOUR.test(value)) at(s.text.indexOf(value), value);
    if (
      FONT_KEY.test(s.before) &&
      value &&
      !CSS_WIDE.has(value.toLowerCase()) &&
      !value.startsWith("var(")
    )
      at(0, s.text);
  }
  return found;
}

// ── Register ──────────────────────────────────────────────────────────────

/**
 * Parses the register table: `| ID | File | Reason | Approved by | Date |`.
 * Returns entries by ID and the problems found in the register itself.
 */
export function parseRegister(markdown) {
  const entries = new Map();
  const problems = [];
  for (const row of markdown.split("\n")) {
    const cells = row
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 5 || !/^DTX-/.test(cells[0])) continue;
    const [id, file, reason, approvedBy, date] = cells;
    if (!DTX_ID.test(id)) problems.push(`${id}: the ID must look like DTX-001`);
    if (entries.has(id)) problems.push(`${id}: registered twice`);
    for (const [name, value] of [
      ["file", file],
      ["reason", reason],
      ["approved by", approvedBy],
      ["date", date],
    ])
      if (!value || value === "-") problems.push(`${id}: no ${name}`);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      problems.push(`${id}: the date must be YYYY-MM-DD`);
    entries.set(id, {
      id,
      file: file.replace(/`/g, ""),
      reason,
      approvedBy,
      date,
    });
  }
  return { entries, problems };
}

// ── One file ──────────────────────────────────────────────────────────────

/**
 * Checks one source file. `path` is repository-relative with `/` separators.
 * Returns `{ findings, exceptions }`: findings fail the check; exceptions are
 * literals covered by a registered marker, printed for review.
 */
export function checkFile(path, text, register, tokenNames = new Map()) {
  const raw = /\.css$/.test(path) ? findingsInCss(text) : findingsInTs(text);
  const markers = markersOf(text);
  const findings = [];
  const exceptions = [];

  for (const [line, ids] of markers)
    for (const id of ids) {
      const entry = register.get(id);
      if (!entry)
        findings.push({
          path,
          line,
          literal: id,
          message: `marker ${id} is not in docs/design-token-exceptions.md`,
        });
      else if (entry.file !== path)
        findings.push({
          path,
          line,
          literal: id,
          message: `marker ${id} is registered for ${entry.file}, not this file`,
        });
    }

  for (const f of raw) {
    const ids = [
      ...(markers.get(f.line) ?? []),
      ...(markers.get(f.line - 1) ?? []),
    ];
    const valid = ids.find((id) => register.get(id)?.file === path);
    if (valid) {
      exceptions.push({ path, line: f.line, literal: f.literal, id: valid });
      continue;
    }
    const token = tokenNames.get(normaliseHex(f.literal));
    findings.push({
      path,
      line: f.line,
      literal: f.literal,
      message: token
        ? `\`${f.literal}\` is ${token}; use the semantic token instead`
        : "hard-coded design value; use a token",
    });
  }
  return { findings, exceptions };
}

function normaliseHex(literal) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(literal);
  if (!m) return literal.toLowerCase();
  const h = m[1].toLowerCase();
  return `#${h.length <= 4 ? [...h].map((c) => c + c).join("") : h}`;
}

// ── Token sources ─────────────────────────────────────────────────────────

const definedNames = (css) =>
  new Map(
    declarationsOf(css)
      .filter((d) => d.property.startsWith("--"))
      .map((d) => [d.property, d.value.trim()]),
  );
const referencedNames = (value) =>
  [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);

/**
 * Rules for packages/shared/src/tokens (TD-002): primitives only in brand.css;
 * both semantic layers define the same names, each only as var() of a defined
 * primitive. `files` maps file name to text.
 */
export function checkTokenSources(files) {
  const problems = [];
  const brand = definedNames(files["brand.css"] ?? "");
  const layers = ["storefront.css", "admin.css"].map((name) => [
    name,
    definedNames(files[name] ?? ""),
  ]);

  for (const [name, values] of layers) {
    for (const [prop, value] of values) {
      const refs = referencedNames(value);
      if (refs.length !== 1 || value !== `var(${refs[0]})`)
        problems.push(`${name}: ${prop} must be var() of one brand primitive`);
      else if (!brand.has(refs[0]))
        problems.push(
          `${name}: ${prop} refers to ${refs[0]}, which brand.css does not define`,
        );
      if (brand.has(prop))
        problems.push(`${name}: ${prop} redefines a brand primitive`);
    }
  }
  const [[aName, a], [bName, b]] = layers;
  for (const prop of a.keys())
    if (!b.has(prop))
      problems.push(`${bName}: missing ${prop} (defined in ${aName})`);
  for (const prop of b.keys())
    if (!a.has(prop))
      problems.push(`${aName}: missing ${prop} (defined in ${bName})`);
  for (const [prop] of brand)
    if (!prop.startsWith("--sp-"))
      problems.push(`brand.css: ${prop} must use the --sp- prefix`);
  if (
    declarationsOf(files["fonts.css"] ?? "").some((d) =>
      d.property.startsWith("--"),
    )
  )
    problems.push(
      "fonts.css: declares @font-face rules only, no custom properties",
    );
  return problems;
}

/** Hex value to primitive name, for helpful messages. */
export function tokenIndex(brandCss) {
  const index = new Map();
  for (const [prop, value] of definedNames(brandCss))
    if (value.startsWith("#")) index.set(normaliseHex(value), prop);
  return index;
}

// ── Repository walk ───────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "generated",
  "fixtures",
]);
// The apps that render UI. The API has no stylesheets or style props; its
// colour values (product swatches) are catalogue data, not design values.
export const UI_APPS = ["storefront", "admin"];

function* sourceFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* sourceFiles(full);
    } else if (
      /\.(css|tsx?)$/.test(entry.name) &&
      !/\.test\.|\.db-test\.|\.d\.ts$/.test(entry.name)
    )
      yield full;
  }
}

export function run(root) {
  const read = (p) => readFileSync(join(root, p), "utf8");
  const tokenDir = "packages/shared/src/tokens";
  const tokenFiles = Object.fromEntries(
    ["brand.css", "storefront.css", "admin.css", "fonts.css"].map((f) => [
      f,
      read(`${tokenDir}/${f}`),
    ]),
  );
  const { entries, problems } = parseRegister(
    read("docs/design-token-exceptions.md"),
  );
  const index = tokenIndex(tokenFiles["brand.css"]);
  const findings = [];
  const exceptions = [];

  for (const app of UI_APPS)
    for (const file of sourceFiles(join(root, "apps", app, "src"))) {
      const path = toPosix(relative(root, file));
      const result = checkFile(
        path,
        readFileSync(file, "utf8"),
        entries,
        index,
      );
      findings.push(...result.findings);
      exceptions.push(...result.exceptions);
    }
  return {
    findings,
    exceptions,
    problems: [...problems, ...checkTokenSources(tokenFiles)],
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { findings, exceptions, problems } = run(root);
  for (const e of exceptions)
    console.log(`exception ${e.id}: ${e.path}:${e.line} ${e.literal}`);
  for (const p of problems) console.error(`token problem: ${p}`);
  for (const f of findings)
    console.error(`${f.path}:${f.line}  ${f.literal}  ${f.message}`);
  const failed = findings.length + problems.length;
  console.log(
    failed === 0
      ? `Design tokens: OK (${exceptions.length} registered exceptions in use)`
      : `Design tokens: ${failed} problem(s)`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}
