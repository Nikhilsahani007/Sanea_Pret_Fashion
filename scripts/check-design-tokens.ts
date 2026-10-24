// Flags hard-coded design values in the apps (TD-002, D-078): hex colours,
// colour functions with literal arguments, named colours and literal font
// families. Tokens in packages/shared/src/tokens are the source of truth and
// are not scanned. A literal is allowed only with a registered marker:
//   /* design-token-exception: DTX-001 */  (same line or the line above)
// listed in docs/design-token-exceptions.md with a reason.
//
//   node scripts/check-design-tokens.ts        exit 1 on any finding
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export type Finding = {
  file: string;
  line: number;
  literal: string;
  hint?: string;
};

const NAMED = new Set(
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  ),
);
const SYSTEM =
  /\b(Canvas|CanvasText|LinkText|VisitedText|ActiveText|ButtonFace|ButtonText|ButtonBorder|Field|FieldText|Highlight|HighlightText|SelectedItem|SelectedItemText|Mark|MarkText|GrayText|AccentColor|AccentColorText)\b/;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const COLOUR_FN =
  /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
const MARKER = /design-token-exception:\s*(DTX-\d{3})/;

/** Values from brand.css, so a finding can name the token it should use. */
export function tokenValues(brandCss: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of brandCss.matchAll(
    /(--sp-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  ))
    map.set(m[2]!.toLowerCase(), m[1]!);
  return map;
}

function literalFn(args: string): boolean {
  // Literal if anything but var(), keywords and separators remains.
  const rest = args
    .replace(/var\([^)]*\)/g, "")
    .replace(/\b(from|none|in|srgb)\b/g, "");
  return /[0-9.]/.test(rest);
}

/** Scans one file's text. `kind` is css for stylesheets, ts for code. */
export function scan(
  file: string,
  text: string,
  kind: "css" | "ts",
  tokens: Map<string, string> = new Map(),
): { findings: Finding[]; markers: { line: number; id: string }[] } {
  const findings: Finding[] = [];
  const markers: { line: number; id: string }[] = [];
  const lines = text.split("\n");
  let forcedDepth = -1;
  let depth = 0;
  let inComment = false;
  lines.forEach((raw, i) => {
    const marker = MARKER.exec(raw);
    if (marker) markers.push({ line: i + 1, id: marker[1]! });
    const allowed = marker || (i > 0 && MARKER.test(lines[i - 1]!));
    // Strip comments (block comments may span lines).
    let line = "";
    for (let j = 0; j < raw.length; j++) {
      if (inComment) {
        if (raw.startsWith("*/", j)) {
          inComment = false;
          j++;
        }
      } else if (raw.startsWith("/*", j)) {
        inComment = true;
        j++;
      } else if (kind === "ts" && raw.startsWith("//", j)) break;
      else line += raw[j];
    }
    if (kind === "css" && /@media[^{]*forced-colors\s*:\s*active/.test(line))
      forcedDepth = depth;
    const report = (literal: string) => {
      if (allowed) return;
      const hint = tokens.get(literal.toLowerCase());
      findings.push({ file, line: i + 1, literal, ...(hint ? { hint } : {}) });
    };
    if (kind === "css") {
      for (const m of line.matchAll(HEX)) report(m[0]);
      for (const m of line.matchAll(COLOUR_FN))
        if (literalFn(m[2]!)) report(m[0]);
      for (const decl of line.matchAll(
        /(?:^|[{;\s])([a-z-]+)\s*:\s*([^;{}]*)/g,
      )) {
        const prop = decl[1]!;
        const value = decl[2]!;
        if (prop.startsWith("--")) continue;
        for (const word of value.matchAll(/(?<![-\w#(])([a-z]+)(?![-\w(])/gi))
          if (NAMED.has(word[1]!.toLowerCase())) report(word[1]!);
        if (forcedDepth < 0 && SYSTEM.test(value))
          report(SYSTEM.exec(value)![1]!);
        if (
          prop === "font-family" &&
          !/^\s*(var\(|inherit|initial|unset|revert)/.test(value)
        )
          report(value.trim());
      }
      for (const ch of line) {
        if (ch === "{") depth++;
        if (ch === "}") {
          depth--;
          if (depth === forcedDepth) forcedDepth = -1;
        }
      }
    } else {
      for (const m of line.matchAll(/(["'`])(#[0-9a-fA-F]{3,8})\1/g))
        report(m[2]!);
      for (const m of line.matchAll(
        /(["'`])[^"'`]*\b((?:rgba?|hsla?|oklch|oklab)\([^)]*\))/g,
      ))
        if (literalFn(m[2]!)) report(m[2]!);
      const font = /fontFamily\s*:\s*(["'`][^"'`]+["'`])/.exec(line);
      if (font) report(font[1]!);
    }
  });
  return { findings, markers };
}

/** IDs with a non-empty reason in the register table. */
export function registeredIds(register: string): {
  ids: Set<string>;
  problems: string[];
} {
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const row of register.split("\n")) {
    const cells = row.split("|").map((c) => c.trim());
    if (!/^DTX-\d{3}$/.test(cells[1] ?? "")) continue;
    if (!cells[3]) problems.push(`${cells[1]} has no reason in the register`);
    else ids.add(cells[1]!);
  }
  return { ids, problems };
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(css|tsx?)$/.test(name) && !/\.test\.|\.d\.ts$/.test(name))
      out.push(path);
  }
  return out;
}

export function checkRepository(root: string): {
  findings: Finding[];
  problems: string[];
  used: string[];
} {
  const tokens = tokenValues(
    readFileSync(join(root, "packages/shared/src/tokens/brand.css"), "utf8"),
  );
  const { ids, problems } = registeredIds(
    readFileSync(join(root, "docs/design-token-exceptions.md"), "utf8"),
  );
  const findings: Finding[] = [];
  const used: string[] = [];
  for (const app of ["apps/storefront/src", "apps/admin/src"]) {
    if (!existsSync(join(root, app))) continue;
    const files = walk(join(root, app));
    for (const path of files) {
      const file = relative(root, path);
      const result = scan(
        file,
        readFileSync(path, "utf8"),
        path.endsWith(".css") ? "css" : "ts",
        tokens,
      );
      findings.push(...result.findings);
      for (const m of result.markers) {
        if (!ids.has(m.id))
          problems.push(`${file}:${m.line} uses unknown exception ${m.id}`);
        else used.push(`${m.id} ${file}:${m.line}`);
      }
    }
  }
  return { findings, problems, used };
}

if (import.meta.main) {
  const root = join(import.meta.dirname, "..");
  const { findings, problems, used } = checkRepository(root);
  for (const u of used) process.stdout.write(`exception in use: ${u}\n`);
  for (const f of findings)
    process.stdout.write(
      `${f.file}:${f.line} hard-coded ${f.literal}${f.hint ? ` (use var(${f.hint}))` : ""}\n`,
    );
  for (const p of problems) process.stdout.write(`${p}\n`);
  if (findings.length + problems.length > 0) process.exit(1);
  process.stdout.write("design tokens: no hard-coded values\n");
}
