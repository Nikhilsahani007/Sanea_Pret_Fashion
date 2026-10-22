# Phase 8 UI Plan Addendum — Tokens, Admin Shell and Catalogue Screens

Status: **Proposed, for your review. Not approved; nothing installed or built.** · Date: 2026-10-22 · Base: `phase-8-catalogue` at `a06cd53` (Phase 8 backend done, `phase-8-plan.md` §10e)

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

## 6. Questions for you

| # | Question | Recommendation |
|---|----------|----------------|
| U8-1 | Approve the packages in §5 | Yes, as listed |
| U8-2 | A server-state library (`@tanstack/react-query`, planned in `system-architecture.md` §7) for the admin? | **Not now.** The admin's reads are simple; a `fetch` wrapper is enough. Revisit with the storefront cart (Phase 11), where optimistic updates matter |
| U8-3 | 2FA enrolment without a QR code: show the secret as text plus an `otpauth://` link | **Yes for now.** A QR code needs a new dependency; add one later only if staff need it |
| U8-4 | Fonts: Panchang and Switzer are free from Fontshare (ITF Free Font Licence) but not in the repository (B-04). Download and self-host the WOFF2 files now, or keep fallbacks until brand inputs arrive? | **Your choice:** downloading is an external action and adds licensed assets. The licence would be recorded next to the files |
| U8-5 | Automated accessibility scan: add `@axe-core/playwright` (dev)? | **Yes**, for the admin and later the storefront gates. Its exact version would be proposed at install time |
| U8-6 | Where the admin build is served in development: Vite dev server on `http://localhost:5174` (matches `ADMIN_ORIGIN` in tests) | Yes |

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
| U1 | Decide U8-1 to U8-6 | **Yes (next gate)** |
| U2 | Install the approved packages; tokens, token check and lint guard | Covered by U1 |
| U3 | Admin app, shell and invite setup; component tests | Covered by U1 |
| U4 | Catalogue screens; component and end-to-end tests; screenshots | Covered by U1 |
| U5 | Commit and push the UI work | Covered by your standing commit and push authorisation for reviewed work |
| U6 | **Phase 8 gate:** your review of the test output and screenshots, plus CI on a draft PR (P8-AC8, P8-AC11), which needs your authorisation to open a PR | **Yes** |
