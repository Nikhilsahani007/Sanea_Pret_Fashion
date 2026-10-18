# Sanéa Pret — Technology Decisions

Date: 2026-10-18

| Item | Status |
|------|--------|
| Technology-flexible policy (§1) | **Confirmed by you** (D-020 to D-022) |
| TD-001 Styling approach | **Unresolved.** Provisional recommendation only |
| TD-002 Design token sharing | **Proposed**, not approved |
| ST-01 Styling evaluation task | **Planned**, not approved; nothing installed |

## 1. Policy: technology-flexible engineering

Sanéa Pret may adopt any suitable technology, framework, library or service when it gives the project a meaningful benefit. No technology is banned by default, and none is adopted by default.

### 1.1 Evaluation criteria
Every significant choice is judged against:

| Criterion | Question |
|-----------|----------|
| Functionality | Does it do what the feature needs, without workarounds? |
| Customer experience | Does it improve or protect what shoppers see and feel? |
| Accessibility | Does it help or hinder WCAG 2.2 AA? |
| Performance | What does it add to bundle size, build time, runtime cost and Core Web Vitals? |
| Security | What attack surface, supply-chain risk and data exposure does it add? |
| Developer productivity | Does it make common work faster and less error-prone? |
| Maintainability | Is it stable, documented, actively maintained, and easy for a new developer to learn? |
| Compatibility | Does it fit React, Vite, TypeScript, Express, Prisma and our tooling? |
| Cost | Licence, hosting and usage fees, now and at expected scale. |
| Vendor lock-in | How hard is it to leave? Is there a standard or open alternative? |

### 1.2 Rules
1. **The confirmed architecture is preserved** (`system-architecture.md`, D-011). A change needs a documented justification and your approval.
2. **No unnecessary dependencies.** Each dependency has a stated reason. Two libraries that do the same job are not both adopted.
3. **No speculative abstractions.** Build an abstraction when there is a second real use, or when the boundary is a known risk (for example the payment provider interface, D-107).
4. **No paid service without demonstrated value.** A free tier or open-source option is compared first, and the cost at expected scale is stated.
5. **Experiment when uncertain.** If the best option is unclear, run a small, time-boxed experiment or benchmark on a throwaway branch. Record the measurements. Installing experiment packages still needs approval.
6. **Brand independence.** The premium editorial direction and brand identity (`design-system.md`) do not depend on any styling framework. Design tokens are defined once as CSS custom properties, and every framework or approach consumes them.
7. **Nothing is installed automatically** as a consequence of a policy or a recommendation. Installation follows an approved decision.

### 1.3 What counts as significant
A decision needs a record in this file when it:
- adds a runtime dependency to a shipped app or the API;
- introduces a framework, build tool, styling approach, database extension or external service;
- adds a paid service or a recurring cost;
- affects security, data storage, payments or the confirmed architecture;
- is hard to reverse.

Small development-only tools (for example a lint plugin) are listed with their reason in the Phase 3 dependency list instead.

### 1.4 Record format
Each record has: **Problem**, **Constraints**, **Options considered**, **Evaluation**, **Recommendation**, **Trade-offs**, **Verification method**, **Status** and **Decision** (with date and approver). A short entry in `DECISION-LOG.md` points to the record.

Earlier technology decisions (npm workspaces, Prisma, Argon2id, PostgreSQL search and others) are recorded in `system-architecture.md` §7 and `DECISION-LOG.md` D-101 to D-111. They stand unless a new record replaces them.

---

## TD-001 — Styling approach for the storefront and admin

**Status:** Unresolved. A decision is needed before the first UI deliverable: the admin shell in Phase 8, then admin screens in Phases 8 to 10 and the storefront from Phase 11. Backend work, including Phase 7, does not wait for it. The decision will be made from the results of the separately approved evaluation task ST-01 (`MASTER-IMPLEMENTATION-INDEX.md`, "Separately approved tasks").

### Problem
Both apps need a styling approach. The storefront is an editorial, art-directed site with fluid type, container-sized display type, bespoke section compositions and strict design rules checked by the Taste tools. The admin app is a dense, form- and table-heavy back office where speed and consistency matter more than art direction. The earlier blanket rule ("regular CSS, no Tailwind") has been removed (D-021), so the choice must now be made on merit.

### Constraints
- Design tokens (`design-system.md` §4–5) must remain the single source of brand values for both apps, independent of the approach (TD-002).
- Storefront quality gates (`design-system.md` §10) must still run and pass.
- Performance budget: initial storefront JS ≤ 170 KB gzipped (`system-architecture.md` §6). CSS should not block the first render beyond what the hero needs.
- No duplicate styling systems unless the benefit is shown.

### Options considered

| Option | Description | New dependencies |
|--------|-------------|------------------|
| A. Global CSS with custom properties | Token file, base styles, and component styles in global stylesheets with a naming convention. | None |
| B. CSS Modules with custom properties | Same tokens; component styles scoped per file (`*.module.css`), supported by Vite out of the box. | None |
| C. Tailwind CSS v4 with tokens mapped from custom properties | Utility classes in markup; theme values read from the same custom properties. | `tailwindcss`, `@tailwindcss/vite` (dev) |
| D. Hybrid: B for the storefront, C for the admin | Each app uses the approach that suits it. | As C, admin only |
| E. Zero-runtime CSS-in-TypeScript (for example vanilla-extract) | Typed styles compiled to static CSS. | Build plugin and library |
| F. Runtime CSS-in-JS (for example styled-components) | Styles generated in the browser. | Library |

F is not shortlisted: it adds runtime JavaScript and work on every render, against the performance budget. E is not shortlisted: it adds a build plugin for type safety that tokens plus CSS Modules mostly provide already. Both can be reopened if the experiment shows a need.

### Evaluation (expected; to be confirmed by the experiment)

| Criterion | A. Global CSS | B. CSS Modules | C. Tailwind v4 | D. Hybrid |
|-----------|---------------|----------------|----------------|-----------|
| Functionality | Full CSS | Full CSS | Full CSS through utilities and arbitrary values | Both |
| Customer experience | Neutral | Neutral | Neutral if tokens are respected | Neutral |
| Accessibility | Neutral | Neutral | Neutral | Neutral |
| Performance | Risk of unused CSS growing | Per-route CSS through code splitting | Generated CSS limited to used classes | Two pipelines |
| Security | No new packages | No new packages | Two new dev packages (build time only) | As C |
| Productivity | Slower; naming collisions | Good; scoped names | Fast for layout, spacing and dense screens | Fast admin, crafted storefront |
| Maintainability | Global coupling over time | Styles next to components | Long class lists in markup; well known to many developers | Two conventions to learn |
| Compatibility | Native | Native in Vite | Official Vite plugin | Both |
| Cost | Free | Free | Free (open source) | Free |
| Lock-in | None | None | Moderate: class names spread through markup | Moderate in admin |
| Brand independence | Tokens native | Tokens native | Tokens mapped into the theme | Both |
| Taste gates | Supported | Supported | Inspector works on rendered output; source checker coverage of utility classes **unverified** | Storefront supported |

### Provisional recommendation (not a decision)
**Option B, CSS Modules with tokens as custom properties, for both apps.** This is a starting hypothesis based on reasoning, not measurement. It is not the final choice, and it must not be treated as decided until ST-01 has produced evidence and you have approved a decision.

Reasons: it adds no dependency; it keeps bespoke editorial layouts in plain CSS, where fluid sizing and container queries read clearly; tokens are native; and the Taste tools are known to work with it. Tailwind's strongest case is admin productivity, which is why option D is the main alternative being tested.

### Trade-offs
- B is likely slower than Tailwind for building dense admin screens and needs discipline to keep spacing consistent. Mitigation: a small set of layout primitives (stack, cluster, grid) built on tokens.
- C would speed up layout work but spreads styling into markup, adds two packages, and may make it easier to drift toward a generic utility-default look, which the Taste house rules exist to prevent.
- D gives each app its best fit but means two styling conventions in one repository.

### Verification method (task ST-01)
- **Task:** ST-01, a separate task outside Phase 3, run only after you explicitly approve it.
- **Prerequisite:** the Phase 3 repository foundation exists, so both options can be built with the same tooling.
- **Scope:** on a throwaway branch, build the same three pieces with B and with C (and the D split where relevant): the landing-page hero band with the oversized wordmark, a product card, and an admin orders table with filters. All three read the shared tokens from TD-002.
- **Time box:** one working day.
- **Measurements:** production CSS size (gzipped) per app; build time; lines of styling and markup; axe accessibility results; Taste `lint.mjs` and `inspect.mjs` results (including whether `lint.mjs` detects banned patterns written as utility classes); visual parity at 390, 768 and 1440 px; notes on development time.
- **Adoption rule:** Tailwind (C or D) is adopted only if it shows a clear productivity benefit without a regression in performance, accessibility, Taste gate results or brand fidelity.
- **Approval:** `tailwindcss` and `@tailwindcss/vite` stay uninstalled until you explicitly approve ST-01. They are installed only on the throwaway branch, which is not merged. Results are added to this record before a decision is proposed.

### Decision
Not yet made.

---

## TD-002 — Sharing design tokens between the storefront and admin

**Status:** Proposed, not approved. It must be decided together with TD-001, before the first UI deliverable (the admin shell in Phase 8). Backend work does not wait for it.

### Problem
The storefront and admin must show one brand: the same colours, type faces, focus styles, radii and motion timings. The admin also needs quieter surfaces for dense data (`design-system.md` §5). If each app defines its own values, they will drift. Whatever styling approach TD-001 chooses must read the same values.

### Options considered

| Option | Description | Structure or dependency change |
|--------|-------------|--------------------------------|
| A. Copy token files into each app | Each app has its own `tokens.css`. | None, but values are kept in sync by hand |
| B. Tokens in `packages/shared` | A `src/tokens/` folder in the existing shared package, imported by both apps as CSS. | No new package or dependency; widens the shared package's scope |
| C. New `packages/tokens` package | A dedicated workspace package for tokens. | Adds a package to the confirmed structure |
| D. Token build tool (for example Style Dictionary) | Tokens written as JSON and compiled to CSS, TypeScript and framework themes. | Adds a dependency and a build step |

### Proposed approach: option B
B keeps one source of truth without changing the confirmed repository structure or the dependency list. Both apps already depend on `packages/shared` for the Zod schemas (`system-architecture.md` §5, §7), so the link between them exists anyway.

**What changes, and what does not**
- No new workspace package, no new npm dependency, no new build step.
- `packages/shared` gains a `src/tokens/` folder and CSS entries in its `exports` map. That widens the package's described scope from "types and contracts" to include design tokens. `system-architecture.md` would be updated only after you approve TD-002.

### How both Vite apps import and bundle the tokens

**1. Files in the shared package**

```
packages/shared/
  package.json
  src/
    index.ts                 TypeScript entry (schemas, enums, money): unchanged
    tokens/
      brand.css              primitives: :root { --sp-blush: …; --sp-aubergine: …; --sp-step-body: …; --sp-ease-out: … }
      storefront.css         semantic layer: :root { --sp-ground: var(--sp-blush); --sp-ink: var(--sp-aubergine); … }
      admin.css              semantic layer for admin: same names, quieter surfaces, same brand ink, accent and focus
      fonts.css              @font-face rules with relative url('./fonts/…woff2')
      fonts/                 self-hosted, subset WOFF2 files (Panchang, Switzer)
```

All custom properties use the `--sp-` prefix to avoid collisions. Components only use semantic names. Primitives are referenced only by the two semantic files.

**2. Package entry points**

The shared package's `package.json` exposes the CSS files as separate subpaths next to the existing TypeScript entry:

```json
{
  "name": "@sanea/shared",
  "exports": {
    ".": "./src/index.ts",
    "./tokens/brand.css": "./src/tokens/brand.css",
    "./tokens/storefront.css": "./src/tokens/storefront.css",
    "./tokens/admin.css": "./src/tokens/admin.css",
    "./tokens/fonts.css": "./src/tokens/fonts.css"
  },
  "sideEffects": ["**/*.css"]
}
```

The package name and whether `"."` points at source or a built `dist/` are Phase 3 and 4 details. `sideEffects` stops a bundler from dropping the CSS imports as unused.

**3. Linking**

Each app's `package.json` already lists the shared package as a workspace dependency. npm workspaces link it into `node_modules/@sanea/shared` as a symlink to `packages/shared`. Nothing is published or copied.

**4. Import in each app**

Each app has one global stylesheet, imported once from its entry file (`src/main.tsx`):

```css
/* apps/storefront/src/styles/index.css */
@import '@sanea/shared/tokens/fonts.css';
@import '@sanea/shared/tokens/brand.css';
@import '@sanea/shared/tokens/storefront.css';
/* base styles follow */
```

```css
/* apps/admin/src/styles/index.css */
@import '@sanea/shared/tokens/fonts.css';
@import '@sanea/shared/tokens/brand.css';
@import '@sanea/shared/tokens/admin.css';
```

Vite resolves bare `@import` specifiers through the package `exports` map and inlines the imported files into the app's CSS. Component styles never import token files. They only reference `var(--sp-…)`, which is available because the tokens sit on `:root`.

**5. Development server**

Vite resolves the symlink to its real path inside `packages/shared`. That path is inside the monorepo root, which Vite's dev server allows by default, so no `server.fs` change is expected. Editing a token file updates both running apps through hot reload. This is to be confirmed when Phase 3 tooling exists.

**6. Production build**

Each app's build emits its own hashed CSS file containing:
- the brand primitives;
- that app's semantic layer;
- `@font-face` rules whose relative font URLs Vite rewrites to hashed copies of the font files in that app's output.

The two apps do not load anything from each other at runtime, so the admin and storefront origins stay independent.

**7. The API**

The API imports only the `"."` entry. It never references a `tokens/*` subpath, and TypeScript compilation ignores CSS. A lint rule (ESLint `no-restricted-imports`, already part of the planned tooling) blocks `@sanea/shared/tokens/*` imports in `apps/api` as a guard.

**8. Each TD-001 outcome**
- **CSS Modules or global CSS:** `.price { color: var(--sp-ink); }`.
- **Tailwind v4:** the app's stylesheet maps theme values to the same properties, for example `@theme inline { --color-ink: var(--sp-ink); }`. No second set of values exists.
- **Hybrid:** each app follows its own row above. Both read the same files.

### CI check for hard-coded design values

A small Node script in `scripts/` with no new dependency, run in CI and locally. It is written only when TD-002 is approved and UI work begins (Phase 8). Using Stylelint instead would add a dependency and needs a separate approval.

**Scanned**
- `apps/*/src/**/*.css`, including CSS Modules.
- `apps/*/src/**/*.{ts,tsx}`, for colour strings in `style` props and theme objects.

**Not scanned**
- `packages/shared/src/tokens/**`, which is the source of truth.
- `node_modules`, build output, `coverage`, test fixtures (`**/*.test.*`, `e2e/fixtures/**`), SVG and Markdown files.

**Flagged**
- Hex colours.
- Colour functions with literal arguments (`rgb`, `hsl`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color`).
- Named colours used as values (`white`, `black`, `red` and so on).
- `font-family` with literal family names.

**Always allowed**
- `var(--sp-…)`.
- `color-mix()` whose arguments are custom properties or keywords.
- `transparent`, `currentColor`, `inherit`, `initial`, `unset`, `revert`, `none`.
- CSS system colours (`Canvas`, `CanvasText`, `LinkText`, `Highlight`, `ButtonText`, `GrayText`) inside `@media (forced-colors: active)`, which high-contrast accessibility support requires.

**Documented exceptions**
- A literal is allowed when the same line, or the line above, carries a marker such as `/* design-token-exception: DTX-001 */`. In TypeScript the marker is the `//` comment equivalent.
- Each ID must exist in a register, `docs/design-token-exceptions.md`, with the file, the reason, who approved it and the date.
- The check fails if a marker has an unknown ID or a register entry has no reason.
- CI prints every exception in use, so they stay visible in review.
- Likely legitimate cases are a third-party embed that only accepts literal colour strings, and a value that must match a framework or browser API exactly. Wherever a token can be read instead, a token is used.

**Out of scope, documented instead**
- `index.html` `<meta name="theme-color">`, the web manifest and email templates (Phase 16) need literal values, and email clients do not support custom properties.
- They are not scanned. Their values are copied from `brand.css`, and the copy is listed in the register.

**Output**
- Each finding shows the file, the line and the literal.
- When the literal exactly matches a token value, the output names the token, for example "`#351A2B` is `--sp-aubergine`".

### Trade-offs
- B puts CSS assets in a package the API also depends on. The separate subpaths and the lint guard keep CSS out of the API. If this becomes awkward, option C is the fallback, with your approval.
- D is the most flexible but adds a build step that two apps and one brand do not need.
- A hand-written script is less complete than Stylelint, but it adds no dependency. It can be replaced later through a decision record.

### Verification method
- **Fixture tests for the check:**
  - a hex value in a module stylesheet fails;
  - `rgb(0 0 0 / 0.4)` fails;
  - `var(--sp-ink)` passes;
  - `transparent` passes;
  - `CanvasText` inside a forced-colors query passes;
  - a marker with a registered ID passes;
  - a marker with an unknown ID fails;
  - files under `packages/shared/src/tokens/` are ignored.
- **Bundling:**
  - a production build of each app contains the brand primitives and only its own semantic layer;
  - font files are emitted as hashed assets;
  - the API build contains no CSS.
- **Consistency:**
  - a side-by-side screenshot shows the same brand colours, faces and focus ring in both apps;
  - changing one primitive token changes both apps.

### Decision
Not yet made.
