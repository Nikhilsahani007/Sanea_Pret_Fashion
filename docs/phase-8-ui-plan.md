# Phase 8 UI Plan Addendum — Tokens, Admin Shell and Catalogue Screens

Status: **U8-1 to U8-7 approved by you on 2026-10-22; UI half implemented and tested (§9, §10). Phase 8 gate passed on 2026-10-22 (D-089)**, with CI green on draft PR #6. · Date: 2026-10-22 · Base: `phase-8-catalogue` at `a06cd53` (Phase 8 backend done, `phase-8-plan.md` §10e)

This is the UI half of Phase 8 (`MASTER-IMPLEMENTATION-INDEX.md` Phase 8, `phase-8-plan.md` §10 step 7). The Phase 8 gate needs both halves (index rule 6).

## 1. Scope (from the index)

1. **Shared design tokens** (TD-002, D-086).
2. **The admin app shell:** sign-in (password, then the 2FA code or a recovery code), navigation, sign-out (moved from Phase 7, D-126).
3. **Admin catalogue screens** over the Phase 8 API.

**Verification** (index): admin sign-in works through the shell for every role, and the TD-002 token checks pass. The gate is your review of the test output and the admin screenshots.

**Out of scope:**
- storefront pages (Phase 11 onward);
- inventory screens (Phase 9) and content editors (Phase 10);
- orders;
- Tailwind (D-085).

## 2. Inputs that are already decided

| Input | Effect here |
|-------|-------------|
| TD-001 / D-085 | CSS Modules. A small form-control reset and layout primitives (stack, cluster, grid) in the admin base styles |
| TD-002 / D-086 | One token source in `packages/shared/src/tokens/`, imported through package subpath exports; a zero-dependency CI check for hard-coded values, with an exceptions register |
| `design-system.md` §4 to §6 | Panchang and Switzer; five type steps; the admin's neutral surface variant (white and grey, aubergine ink and actions); square-cornered flat buttons, 48 px tall (44 px minimum); visible labels; errors under fields linked by `aria-describedby` |
| `ui-ux-pro-max` (CLAUDE.md, admin and forms) | Its priority rules: contrast 4.5:1; keyboard access and visible focus; labelled icon buttons; 44 × 44 px targets; loading feedback; visible labels; errors next to fields; no horizontal scroll; reduced motion respected; semantic tokens, no raw hex |
| D-132, security-design §3 | The admin dev server proxies `/api`, so requests are same-origin and the `__Host-` cookies work on `http://localhost` |
| Phase 7 API | Sign-in, MFA, `GET /admin/auth/me` (`csrfToken`), sign-out, invite inspect, enrol and accept |

## 3. Deliverables

### 3.1 Tokens (TD-002)
- `packages/shared/src/tokens/`:
  - `brand.css`: primitives with the `--sp-` prefix, from `design-system.md` §4 and §5;
  - `storefront.css` and `admin.css`: semantic layers;
  - `fonts.css`.
- **Package exports:** `exports` subpaths and `sideEffects: ["**/*.css"]` in `packages/shared/package.json`; the public-API test is updated.
- **Fonts:** no font files exist yet (blocker B-04 and question U8-4). Until they do, `fonts.css` declares the families with fallback stacks only.
- **Hard-coded-value check:** `scripts/check-design-tokens.mjs`, with no dependency, following TD-002's rules (flagged literals, allowed values, `design-token-exception` markers). It comes with:
  - the register `docs/design-token-exceptions.md`;
  - fixture tests;
  - an `npm run check:tokens` script, added to `npm run lint` and therefore to CI.
- **API guard:** an ESLint `no-restricted-imports` rule blocks `@sanea/shared/tokens/*` in `apps/api`.

### 3.2 The admin app (`apps/admin`)
- **Stack:** Vite and React with TypeScript, CSS Modules, and `react-router` for routes and deep links.
- **Dev server:** proxies `/api` to the API (D-132).
- **API client:** a small `fetch` wrapper. It sends credentials and adds `X-CSRF-Token` from `GET /admin/auth/me`, and maps the error format to field errors and messages. No server-state library is added (§6, U8-2).
- **Base styles** (`src/styles/`):
  - the token imports;
  - the form-control reset;
  - `Stack`, `Cluster` and `Grid` primitives;
  - focus rings from `--sp-focus`;
  - `prefers-reduced-motion`.

### 3.3 Admin shell
- **Sign-in:**
  - email and password, then a 6-digit code or a recovery code;
  - one generic error (D-066);
  - a lockout message only as the API returns it;
  - focus moves to the code field.
- **Account setup from an invite or reset link:**
  - the token is read from the URL fragment, never sent in a query;
  - inspect, then set a password with the rules shown;
  - enrol 2FA by showing the secret as text (no new QR dependency; U8-3);
  - confirm a code, then show the recovery codes once with a "saved" confirmation.

  This is how the first Owner (D-069) and new staff get access. The Phase 7 API exists; this screen is its only UI.
- **Session:**
  - `GET /admin/auth/me` on load;
  - a `401` sends the user to sign-in, keeping the intended path;
  - sign-out.
- **Navigation:**
  - by role, following `security-design.md` §4: catalogue for O M C; product viewing for F; staff and the audit log for the Owner, but only as links, since those screens are later phases;
  - hidden controls are a convenience only; the API decides.
- **States:** loading, empty, error, forbidden (`403`), and session expired.

### 3.4 Catalogue screens
- **Products:**
  - **list:** filter by status and category, cursor paging, status chips with text;
  - **editor:**
    - details, with slug lock messaging after first publish;
    - description as a structured block editor of paragraphs, headings, lists and internal links (`richTextSchema`, safeguard 2), with no `contenteditable` HTML;
    - labels (`NEW` only);
    - SEO fields.
- **Variants:**
  - a table of colour × size;
  - add a variant (O M only, Q8-4);
  - price fields read-only for catalogue editors, with a note; the API still refuses them;
  - activate and deactivate.
- **Images:**
  - **upload:** raw body; progress; queue-full, queue-timeout and processing-timeout messages; 413 and 415 messages;
  - required alt text; role and colour; reorder; remove.
- **Publish and archive:** problems from `409` shown as a checklist (D-083).
- **Categories:** tree, create and edit, delete (`409` in-use message).
- **Collections:** edit, schedule, and the product order (keyboard-accessible move up and down).
- **Colours** (with swatch preview) and **size charts** (row editor).
- **Media library:** derivative thumbnails, newest first.

## 4. Testing and evidence
- **Unit and component:** Vitest with `jsdom` and Testing Library, covering:
  - the API client (CSRF header, error mapping);
  - the sign-in steps;
  - role-based navigation;
  - the rich-text block editor against `richTextSchema`;
  - form validation messages.
- **End to end:** Playwright (already installed, D-036) drives the **installed Microsoft Edge** (`channel: "msedge"`), so no browser download is needed. Each run gets a fresh disposable database and API:
  - sign-in through the shell for **every role** (index verification);
  - an invite through to first sign-in;
  - creating a category, product, variants and images; publishing, then finding it through the public API;
  - a catalogue editor's price fields read-only;
  - fulfilment staff without catalogue editing.
- **Screenshots:** sign-in, the products list, the product editor (variants and images), categories and collections, at 1440, 768 and 390 px, saved under `docs/reviews/admin/<date>/` (§7).
- **Accessibility:**
  - the `ui-ux-pro-max` checklist;
  - keyboard-only runs in the end-to-end tests;
  - contrast measured for the admin tokens.

  An automated axe scan needs approval of `@axe-core/playwright` (U8-5).
- **Checks:** format, lint (including the token check), typecheck, unit, integration, `vite build` for the admin app, and end-to-end.

## 5. Dependencies to approve (exact versions, at least two weeks old)

| Package | Version | Released | Where | Why |
|---------|---------|----------|-------|-----|
| react | 19.3.0 | 2026-09-09 | `@sanea/admin` | UI (planned, `system-architecture.md` §7) |
| react-dom | 19.3.0 | 2026-09-09 | `@sanea/admin` | DOM renderer |
| react-router | 8.4.0 | 2026-09-15 | `@sanea/admin` | Routes and deep links (planned) |
| @vitejs/plugin-react | 6.1.2 | 2026-10-05 | `@sanea/admin`, dev | JSX and fast refresh for the existing `vite` 8.3.4 (peer `^8`) |
| @types/react, @types/react-dom | 19.3.0, 19.3.0 | 2026-09-09 | `@sanea/admin`, dev | Types |
| @testing-library/react | 16.3.3 | 2026-08-27 | root, dev | Component tests (planned) |
| @testing-library/user-event | 14.6.7 | 2026-09-02 | root, dev | Realistic input in tests |
| jsdom | 30.1.2 | 2026-10-04 | root, dev | DOM for component tests |

`react` 19.3.1 and `react-router` 8.5.0 are the npm `latest` tags but are under two weeks old, so the older patch and minor versions are proposed. Every install is checked with `npm audit` and a lockfile review, as for `sharp`.

## 6. Questions for you (decided 2026-10-22: all approved; U8-3 with a QR code; see §10.1)

| # | Question | Recommendation |
|---|----------|----------------|
| U8-1 | Approve the packages in §5 | Yes, as listed |
| U8-2 | A server-state library (`@tanstack/react-query`, planned in `system-architecture.md` §7) for the admin? | **Not now.** The admin's reads are simple; a `fetch` wrapper is enough. Revisit with the storefront cart (Phase 11), where optimistic updates matter |
| U8-3 | 2FA enrolment without a QR code: show the secret as text plus an `otpauth://` link | **Yes for now.** A QR code needs a new dependency; add one later only if staff need it |
| U8-4 | Fonts: Panchang and Switzer are free from Fontshare (ITF Free Font Licence) but not in the repository (B-04). Download and self-host the WOFF2 files now, or keep fallbacks until brand inputs arrive? | **Your choice:** downloading is an external action and adds licensed assets. The licence would be recorded next to the files |
| U8-5 | Automated accessibility scan: add `@axe-core/playwright` (dev)? | **Yes**, for the admin and later the storefront gates. Its exact version would be proposed at install time |
| U8-6 | Where the admin build is served in development: Vite dev server on `http://localhost:5174` (matches `ADMIN_ORIGIN` in tests) | Yes |
| U8-7 | Success colour: `design-system.md` §5 gives `#1F6B3A` and asks for it to be measured when built. Measured, it is **4.34:1 on the storefront blush and 3.97:1 on the card surface**, below 4.5:1. The tokens use `#185A31`, which passes on every ground (§9). Accept it? | **Yes.** It is the same hue, slightly darker. The palette stays provisional until brand colours arrive (OD-02). If you decline, the documented value is restored and success text must never sit on blush |

## 7. Acceptance criteria (UI half)

| ID | Criterion |
|----|-----------|
| P8-UI-AC1 | Tokens in `packages/shared/src/tokens/` imported by the admin through package exports; the token check passes with no unregistered exceptions; the API cannot import tokens |
| P8-UI-AC2 | Admin sign-in with 2FA works through the shell for every role (end to end); invite to first sign-in works |
| P8-UI-AC3 | Catalogue screens create, edit, publish and archive products with variants and images; the role rules hold in the UI and in the API |
| P8-UI-AC4 | Loading, empty, error, forbidden and expired states exist on every screen |
| P8-UI-AC5 | Keyboard-only operation, visible focus, labelled controls, errors linked to fields, targets of at least 44 px, measured contrast of at least 4.5:1 for text, and no horizontal scroll at 390 px |
| P8-UI-AC6 | CSS Modules only, no Tailwind, no hard-coded design values outside tokens; `vite build` passes |
| P8-UI-AC7 | Screenshots at 1440, 768 and 390 px saved for your review |

## 8. Sequence and stop points

| Step | Work | Needs your approval |
|------|------|---------------------|
| U1 | Decide U8-1 to U8-7 | **Done**: approved 2026-10-22 (§6, §10.1) |
| U2 | Install the approved packages; tokens, token check and lint guard | **Done** (§9, §10.2) |
| U3 | Admin app, shell and invite setup; component tests | **Done** (§10) |
| U4 | Catalogue screens; component and end-to-end tests; screenshots | **Done** (§10) |
| U5 | Commit and push the UI work | Covered by your standing commit and push authorisation for reviewed work |
| U6 | **Phase 8 gate:** your review of the test output and screenshots, plus CI on a draft PR (P8-AC8, P8-AC11), which needs your authorisation to open a PR | **Yes** |

## 9. Progress: tokens, token check and lint guard (2026-10-22)

Built without any new package. U8-1 to U8-7 remain open, so nothing that needs React was started.

**Delivered:**
- **Tokens** in `packages/shared/src/tokens/`:
  - `brand.css`: primitives with the `--sp-` prefix (colour, faces and weights, the five type steps, spacing, control sizes, focus, layout widths, motion);
  - `storefront.css` and `admin.css`: the same 17 semantic names, each `var()` of one primitive;
  - `fonts.css`: no `@font-face` rules until the font files exist (B-04, U8-4); the fallback stacks render.
- **Package exports:** four CSS subpaths and `sideEffects: ["**/*.css"]` in `packages/shared/package.json`. Each subpath resolves; a deep path (`@sanea/shared/src/tokens/brand.css`) still fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
- **Check** `scripts/check-design-tokens.mjs`, with no dependency:
  - run by `npm run check:tokens`, which `npm run lint` now runs, so CI runs it too;
  - the register is `docs/design-token-exceptions.md` (empty);
  - it also checks the token sources: primitives only in `brand.css` with the `--sp-` prefix; both layers define the same names, each from a defined primitive.
- **API guard:** ESLint `no-restricted-imports` blocks `@sanea/shared/tokens/*` in `apps/api`. Probe through stdin: `import "@sanea/shared/tokens/admin.css"` in `apps/api/src/probe.ts` fails with the TD-002 message.

**Choice within the approved scope (for your review):** the check scans `apps/storefront/src` and `apps/admin/src`, not the API. The API has no stylesheets or style props; its only colour literals are product swatches in the development seed, which are catalogue data. Within TypeScript, it scans only strings under a style key (`color:`, `fill=` and similar) and strings that are entirely a colour, so text such as "Order #1234" is not a finding.

**Fixture tests** (`scripts/check-design-tokens.test.mjs`, 22 tests; `scripts` is now a Vitest project). They cover every TD-002 verification case:
- a hex value in a module stylesheet fails; `rgb(0 0 0 / 0.4)` fails;
- `var(--sp-ink)` and `transparent` pass;
- `CanvasText` inside a forced-colors query passes, and fails outside one;
- a registered marker passes, on the same line or the line above; an unknown ID fails;
- files under `packages/shared/src/tokens/` are ignored.

They also cover:
- named colours and literal font families;
- `color-mix()` of tokens;
- selectors, comments, strings and `url()`, which are not findings;
- line numbers; a marker used in the wrong file; a marker two lines above, which does not count;
- register rows with missing fields;
- the token name in the message;
- the token-source rules;
- a fixture repository;
- this repository, which passes.

**Contrast**, measured with the WCAG formula for every pair the semantic layers use (text at least 4.5:1; field borders and focus at least 3:1, WCAG 1.4.11):

| Layer | Pair | Ratio |
|-------|------|------:|
| Admin | ink on bg / surface / surface-alt | 14.47 / 15.74 / 13.23 |
| Admin | muted on bg / surface / surface-alt | 7.03 / 7.65 / 6.43 |
| Admin | accent-ink on accent | 15.74 |
| Admin | danger on surface / bg / danger-surface | 8.15 / 7.49 / 7.18 |
| Admin | success on surface / success-surface | 8.25 / 7.43 |
| Admin | field-border on surface / bg / surface-alt | 4.12 / 3.79 / 3.47 |
| Admin | focus on bg / surface | 14.47 / 15.74 |
| Storefront | ink on bg / surface / paper | 10.48 / 9.59 / 15.74 |
| Storefront | muted on bg / surface | 5.17 / 4.73 |
| Storefront | accent-ink on accent | 10.48 |
| Storefront | danger on bg / surface / paper | 5.43 / 4.96 / 8.15 |
| Storefront | success on bg / surface / paper | 5.49 / 5.02 / 8.25 (with `#185A31`, U8-7) |
| Storefront | field-border on paper / bg | 7.77 / 5.17 |
| Storefront | focus on bg / surface | 10.48 / 9.59 |

`--sp-line` (`grey-300` in the admin) is decorative: table rules and dividers, never a field border or the only sign of state.

**Checks run:**

| Command | Result |
|---------|--------|
| `npm run format:check` | Clean |
| `npm run lint` (ESLint, then the token check) | Clean; "Design tokens: OK (0 registered exceptions in use)" |
| `npm run typecheck` | Clean |
| `npm test` | 27 files, **599 tests passed** (577 before, plus 22) |

The database integration suite was not re-run: no API or database file changed.

**Not yet verified, needs the app (U8-1):** bundling, meaning that each app's build contains the primitives and only its own semantic layer. ST-01 showed this on the throwaway branch; it is re-checked with the admin `vite build`.

## 10. Implementation and evidence (2026-10-22)

### 10.1 Decisions as approved, and how they were carried out

| # | Your decision | Carried out |
|---|---------------|-------------|
| U8-1 | Approve the §5 packages | Installed with exact pins (§10.2). Two version problems were found before use; you decided each the same day (§10.2) |
| U8-2 | No data-fetching library | A `fetch` wrapper (`apps/admin/src/api/client.ts`) and a small `useResource` hook with loading, ready and error states. `reload()` keeps the screen while it refreshes, so unsaved forms survive |
| U8-3 | 2FA set-up **with a QR code** | `qr` 0.7.2 encodes the API's `otpauth://` URI in the browser. The matrix is drawn as SVG rectangles: no markup injection, no network, no third-party QR service. See §10.3 |
| U8-4 | Download and bundle the fonts, subject to the licence | The licence was read from the official download. Self-hosting is allowed, but **distribution through a repository or public server is forbidden**, and this repository is public. So each environment fetches the files with `npm run fonts:fetch` into git-ignored folders; they are not committed. See `font-licences.md` |
| U8-5 | `@axe-core/playwright` | 4.13.0 (4.14.0 is under two weeks old). Axe runs on every reviewed screen at 1440, 768 and 390 px with the WCAG 2.0, 2.1 and 2.2 A/AA tags |
| U8-6 | Admin dev server on `localhost:5174` | `apps/admin/vite.config.ts`: dev and preview on `localhost:5174` with `strictPort`; `/api` proxied to `ADMIN_API_URL` (default `http://127.0.0.1:4000`). This matches `ADMIN_ORIGIN` in the API tests and e2e. The storefront port and the API configuration are unchanged |
| U8-7 | Success green `#185A31` | In `brand.css` since `a6afed7`; contrast measured (§9). The token check passes with no exceptions |

### 10.2 Packages and compatibility

| Package | Version | Where | Note |
|---------|---------|-------|------|
| react, react-dom | 19.3.0 | admin | As approved. An npm `overrides` entry pins both for the whole tree (below) |
| react-router | 8.4.0 | admin | Declarative routes (`BrowserRouter`, `Routes`) |
| qr | 0.7.2 (2026-09-28; MIT or Apache-2.0; no dependencies) | admin | QR encoding (U8-3). Chosen over `qrcode` (pulls in `yargs` and `pngjs`), `uqr` and `qrcode-generator` because it is maintained in 2026, typed, dependency-free, and returns the raw matrix |
| @vitejs/plugin-react | 6.1.2 | admin, dev | Its peer `vite ^8` is met; its other peers are optional |
| @types/react, @types/react-dom | 19.3.0 | admin, dev | |
| @testing-library/react | 16.3.3 | root, dev | |
| @testing-library/dom | 10.4.2 (2026-09-13) | root, dev | **A required peer** of the two Testing Library packages, not listed in §5. Approved by you |
| @testing-library/user-event | 14.6.7 | root, dev | |
| jsdom | **29.1.1** (2026-04-30) | root, dev | The §5 version, 30.1.2, needs Node `^24.15`, and this machine runs 24.11.0. **Deviation approved by you** |
| @axe-core/playwright | 4.13.0 (2026-08-11; axe-core 4.13.0, MPL-2.0) | root, dev | Its peer `playwright-core >=1` is met by 1.64.1 |

**Lockfile:** 60 packages added, none removed. The only changes to existing entries are `react` and `react-dom`, from 19.3.1 to 19.3.0:
- Prisma Studio had pulled in 19.3.1 as a peer (`^18 || ^19`), which made two React copies.
- The root `overrides` entry, **approved by you**, makes 19.3.0 the only React.

`npm audit` reports 0 vulnerabilities.

**Admin bundle:** 136.95 KB JavaScript and 3.63 KB CSS, gzipped. The CSS contains the brand primitives and only the admin layer. Font URLs stay as `/fonts/…`, and the build copies the fetched files into `dist/fonts/`.

### 10.3 Two-factor set-up with a QR code: security

- **Authority stays where Phase 7 put it.** The single-use invite or reset token (D-069 to D-071) authorises set-up. There is no new route and no change to the API's authentication:
  - the token is read from the URL fragment, never sent in a query, and removed from the address bar on load;
  - the secret and URI come only from `POST /admin/auth/invites/enrol`, for that token.
- **The secret lives only in the component's memory.** It never goes to local or session storage, logs or any other request, and it is discarded after set-up.
- **Completion needs a valid code.** `POST /invites/accept` verifies a TOTP code before anything is saved:
  - a wrong code is shown under the field;
  - a rejected password returns the admin to the password step.
- **Recovery codes** are shown once, and the admin must confirm they are saved before continuing.
- **Cancel** leaves without accepting. A later enrolment replaces the pending secret, as Phase 7 designed.
- **Component tests** (`AcceptInvite.test.tsx`):
  - successful enrolment;
  - a wrong code, then a correct one;
  - a rejected password, and the local password check;
  - an invalid link, and cancel;
  - the token never in a URL, the secret never in a request body, and browser storage empty;
  - the QR matrix **decoded back** to exactly the provisioning URI.
- **End to end:** each of the four roles enrols with the key shown on screen, then signs in with a code from that key.

### 10.4 What was built

**Shell:**
- **Sign-in in two steps,** with the recovery-code option, one generic error, and focus moved to the code field.
- **Account set-up** as in §10.3.
- **Session:**
  - loaded from `/me`;
  - a 401 on any request ends it, with the "Your session has ended" notice;
  - sign-out keeps the session and reports the error if the request fails.
- **Role navigation** from the shared permission matrix (below).
- **Accessibility and layout:**
  - a skip link;
  - focus moves to the page heading on navigation;
  - a Menu button below 64 rem.

**Catalogue:**
- **Products list:** status and category filters, cursor paging, and text status chips.
- **New product.**
- **Product editor:**
  - details with the slug lock, the `NEW` label, the size chart and SEO fields;
  - the description block editor;
  - **variants:**
    - a colour × size table;
    - adding variants and changing prices for O M only, with prices read-only for others;
    - activate and deactivate;
  - **images:**
    - upload with progress, and the API's 413, 415, 429 and 503 messages;
    - required alt text, role and colour;
    - move up and down, and removal with confirmation;
  - **publishing:** publish, with problems shown as a checklist, and archive with confirmation.
- **Categories:** tree, create, edit, and delete with the in-use message.
- **Collections:** list, create, edit, a schedule in India Standard Time, product order with move buttons, and delete.
- **Colours,** with a swatch preview.
- **Size charts,** with a row and column editor.
- **Media library.**

**States:** every screen has loading, empty, error, forbidden (403) and not-found states. Errors offer a retry and show the request ID. An ended session is handled once, in the shell.

**Choices within the approved scope (for your review):**
- **Permission matrix shared:** `PERMISSIONS` and `can` moved from the API to `@sanea/shared`, so the admin hides exactly what the API refuses. The API re-exports them. Its parity test against `security-design.md` is unchanged and passes.
- **New read route `GET /admin/sizes`** (O M C, no-store). The variant form needs the size IDs, and no admin route listed the six approved sizes. It has an integration test and is in `api-specification.md`.
- **No staff or audit-log links yet.** §3.3 proposed them as links, but those screens are later phases, and dead links are not shipped. In the e2e test the Owner invites staff through the API.
- **Fulfilment** sees products, variants and images read-only, without category, colour or size names, because reference data is O M C in the API specification.
- **The description editor uses plain text per block,** with inline syntax converted to and from `richTextSchema`:
  - inline syntax: `**bold**`, `_italic_` and `[text](/internal/path)`;
  - a preview is built from React elements;
  - a stored description that does not match the schema is never overwritten unless the editor explicitly chooses to replace it.

### 10.5 Tests and results

| Command | Result |
|---------|--------|
| `npm run format:check` | Clean |
| `npm run lint` (ESLint, then `check:tokens`) | Clean; "Design tokens: OK (0 registered exceptions in use)" |
| `npm run typecheck` | Clean, including the admin app and its tests |
| `npm test` | 34 files, **646 passed**: 599 before, plus 43 admin component tests and 4 font-fetcher tests |
| `npm run test:integration` (disposable PostgreSQL 18.6) | 14 files, **338 passed**, one of them new (`GET /admin/sizes`) |
| `npm run build -w @sanea/admin` | Built |
| `npx playwright test` (installed Edge, disposable stack) | **9 passed** |
| `npm run audit` | 0 vulnerabilities |

**Component tests** (jsdom) cover:
- the API client: CSRF headers, error and field mapping, and the expiry hook;
- sign-in and account set-up;
- navigation by role, and the session states;
- the block editor against `richTextSchema`;
- the role rules in the product editor;
- validation errors linked to their fields, and the publish checklist;
- helpers.

**End-to-end tests** run on the production build:
- the sign-in screen;
- the Owner's invite through to a keyboard-only first sign-in;
- invite and sign-in for the Manager, the catalogue editor and fulfilment;
- the Manager's full catalogue build:
  - category, colour, size chart and product;
  - the publish checklist;
  - the description, the variants, and a synthetic image upload;
  - publishing, with the product found through the public API and through search;
  - archiving (the public route returns 404), then publishing again;
  - a collection and its product order;
- the catalogue editor: no price controls, and the API returns 403 for a price change and for creating a variant;
- fulfilment: a read-only editor, a forbidden categories screen, and a 403 from the API;
- sign-out.

Axe found no violations on any reviewed screen at any width, and nothing scrolls horizontally at 390 px.

**Fixes made after reviewing the screenshots, before committing:**
- numeric columns were not right-aligned;
- the page heading showed a focus ring after load;
- the "created as a draft" notice stayed after publishing;
- SKUs broke between characters at 390 px. Tables now keep their width and scroll inside a named, focusable region;
- visually hidden table labels widened the page;
- the create forms kept their values after saving;
- "1 sizes".

**Screenshots:** 27, in `docs/reviews/admin/2026-10-22/`, each screen at 1440, 768 and 390 px:
- sign-in;
- products and the product editor;
- categories;
- collections and the collection editor;
- colours;
- size charts;
- the media library.

The product image is a synthetic grey test image, not product photography.

### 10.6 Acceptance criteria (UI half)

| ID | Status |
|----|--------|
| P8-UI-AC1 | **Pass:** the admin imports the tokens through package exports; the check passes with no exceptions; the API import is blocked |
| P8-UI-AC2 | **Pass:** sign-in with 2FA end to end for every role, and invite to first sign-in |
| P8-UI-AC3 | **Pass:** create, edit, publish and archive with variants and images; the role rules hold in the UI and the API |
| P8-UI-AC4 | **Pass:** loading, empty, error, forbidden and expired states, covered by component and end-to-end tests |
| P8-UI-AC5 | **Pass, with limits** (below) |
| P8-UI-AC6 | **Pass:** CSS Modules only, no Tailwind, no hard-coded design values; `vite build` passes |
| P8-UI-AC7 | **Pass:** 27 screenshots saved for your review |

**P8-UI-AC5 in detail.** What passed:
- axe is clean at three widths;
- nothing scrolls horizontally at 390 px;
- errors are linked to their fields;
- contrast was measured (§9);
- controls are 48 px, and the tokens set 44 px targets.

Limits:
- Keyboard-only operation was tested end to end for sign-in only. The other screens use native controls, but they had no full keyboard run and no screen-reader testing.
- Automated checks do not prove accessibility compliance.

**The Phase 8 gate passed on 2026-10-22 (D-089).** CI run 39829977467 on draft PR #6 was green, and P8-AC11 was measured on Linux (`phase-8-plan.md` §10f).
