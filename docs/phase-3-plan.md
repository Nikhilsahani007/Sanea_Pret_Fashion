# Phase 3 Plan — Repository Foundation and CI

Status: **Proposed, awaiting your Phase 3 approval.** Nothing in this plan has been installed or created. · Date: 2026-10-18

Scope comes from `MASTER-IMPLEMENTATION-INDEX.md` Phase 3: npm workspaces with empty packages, TypeScript, ESLint, Prettier, Vitest and Playwright configuration, CI with lint, typecheck, test, `npm audit` and secret scanning, `.env.example` and an `e2e/` folder. No features, no React, no Express, no Prisma.

## 1. Dependency list

Versions are the current published releases checked with `npm view` on 2026-10-18. They are pinned exactly (`save-exact`), and the lock file is committed.

All are **root development dependencies**. No runtime dependency is added in Phase 3.

| Package | Version | Why it is needed now |
|---------|---------|----------------------|
| `typescript` | 6.0.3 | Type checking for every workspace. **Not 7.0.2 (the current latest):** `typescript-eslint` 8.71.2 supports TypeScript `>=4.8.4 <6.1.0`, so 7.x would break linting. Revisit when typescript-eslint supports 7. |
| `@types/node` | 26.6.5 | Node types for config files and scripts. Vitest accepts `>=24`. |
| `eslint` | 10.13.0 | Linting. Supports Node 24. |
| `@eslint/js` | 10.0.1 | ESLint's recommended rule set for the flat config. |
| `typescript-eslint` | 8.71.2 | TypeScript parser and rules for ESLint. |
| `eslint-config-prettier` | 10.1.8 | Turns off ESLint style rules that would fight Prettier. |
| `prettier` | 3.9.10 | Formatting, checked in CI. |
| `vitest` | 5.0.5 | Unit and integration test runner (`testing-strategy.md`). |
| `vite` | 8.3.4 | **Required peer dependency of Vitest 5** (`^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0`, not optional). The apps will use it from Phase 8. |
| `@playwright/test` | 1.64.1 | End-to-end runner and config. **Browsers are not downloaded in Phase 3**, because there are no pages to test yet. |

**Total: 10 packages.** Their transitive dependencies are recorded in the lock file and reported after installation.

### Playwright (decided, D-036)
- `@playwright/test` stays in Phase 3 with its configuration. **No browsers are downloaded** until the first end-to-end test exists (Phase 8 or later).

### Not installed in Phase 3
These come with the phase that needs them, each with its own reason and approval:
- React, React DOM and the Vite React plugin (Phase 8).
- Express and its security middleware (Phase 5).
- Zod (Phase 4).
- Prisma (Phase 6).
- Argon2 (Phase 7).
- Pino (Phase 5).
- sharp (Phase 8).
- Testing Library (Phase 8).

The index also asks for three dependencies missing from `system-architecture.md` §7. Each needs its own decision when its phase arrives, and none is chosen now:

| Need | Phase | Candidates (not chosen) |
|------|-------|-------------------------|
| TOTP library for admin 2FA (D-032) | 7 | `otplib`, or a maintained alternative chosen at Phase 7 |
| Background job runner | 9 | `pg-boss` (PostgreSQL-backed) or a small table-based runner |
| Email client | 16 | The provider's SDK, once OD-19 is decided |

## 2. Repository setup steps

The work happens on a branch, `phase-3-foundation`, not on `main`. Nothing is committed or pushed without your instruction.

1. **Node and npm settings**
   - `.nvmrc`: `24`.
   - `package.json` `engines`: `node >=24`.
   - `.npmrc`: `save-exact=true`, `engine-strict=true`.
   - `.editorconfig`.
2. **Root `package.json`**
   - `private: true`.
   - `workspaces: ["apps/*", "packages/*"]`.
   - Scripts: `lint`, `format`, `format:check`, `typecheck` (`tsc -b`), `test` (`vitest run`), `test:e2e` (`playwright test`), `audit` (`npm audit --audit-level=high`).
3. **Workspaces.** Create `apps/storefront`, `apps/admin`, `apps/api` and `packages/shared`.
   - Each gets a `package.json` (`@sanea/<name>`, private, ESM), a `tsconfig.json` extending the base, and a one-line placeholder `src/index.ts` (`export {};`) so typecheck has something to check.
   - These placeholders are the only source files in Phase 3.
4. **TypeScript**
   - `tsconfig.base.json` with strict settings: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `isolatedModules`, `verbatimModuleSyntax`.
   - A root `tsconfig.json` with project references to the four workspaces.
5. **ESLint** (`eslint.config.js`, flat config)
   - Recommended JavaScript and TypeScript rules, with Prettier compatibility.
   - One project rule from the architecture: `apps/storefront` and `apps/admin` may not import `@prisma/client` (`system-architecture.md` §2).
   - The token-import guard from TD-002 is **not** added, because TD-002 is not approved.
6. **Prettier.** `.prettierrc` and `.prettierignore`.
7. **Vitest**
   - `vitest.config.ts`, with one project per workspace.
   - One smoke test in `packages/shared` to prove the runner works.
   - Real tests start in Phase 4.
8. **Playwright**
   - `playwright.config.ts`, pointing at `e2e/`.
   - `e2e/README.md`.
   - No tests and no browser download.
9. **Environment**
   - `.env.example`, listing variables by name with comments and no values. Phase 3 needs only `NODE_ENV`; later variables are added by their phases.
   - `.gitignore` gains `.eslintcache`.
10. **CI** (`.github/workflows/ci.yml`), on pull requests and pushes to `main`.
    - Steps: checkout, set up Node 24 with the npm cache, `npm ci`, `format:check`, `lint`, `typecheck`, `test`, `audit`, then secret scan.
    - Third-party actions are pinned to commit SHAs.
    - The secret scan uses Gitleaks. Its GitHub Action needs a licence key only for organisation accounts, and this repository belongs to a personal account. Running the Gitleaks CLI directly is the fallback.
11. **Dependabot** (decided, D-037): `.github/dependabot.yml` with two update entries, `npm` (root workspace) and `github-actions`, each on a **weekly** schedule.
    - It opens pull requests only. **No automatic merging**: no auto-merge workflow, no auto-approve, and GitHub auto-merge stays off. Every update goes through CI and your review.
    - An open pull request limit keeps the queue small. Minor and patch npm updates are grouped into one weekly pull request; major updates arrive separately.
    - It adds no dependency. `security-design.md` §7 already plans for it.
12. **Documentation**
    - `system-architecture.md` §7 lists the installed tooling with versions.
    - `README.md` gains setup commands.
    - `PROJECT-STATUS.md` records the evidence.

## 3. Validation checks

Each is run and its real output recorded in `PROJECT-STATUS.md`.

| # | Check | Pass condition |
|---|-------|----------------|
| V1 | `node -v`, `npm -v` | Node 24.x, npm 11.x |
| V2 | `npm install` | Completes. Lock file created. Install warnings and the transitive package count reported |
| V3 | `npm ci` on a clean `node_modules` | Reproduces the install from the lock file |
| V4 | `npm ls --depth=0` | Exactly the 10 packages above, and nothing else |
| V5 | `npm run format:check` | No formatting differences |
| V6 | `npm run lint` | 0 errors, 0 warnings |
| V7 | Prisma-import guard | A throwaway file importing `@prisma/client` in `apps/admin` fails lint. The file is deleted afterwards |
| V8 | `npm run typecheck` | 0 errors across all four workspaces |
| V9 | `npm test` | The smoke test passes |
| V10 | `npx playwright test --list` | Runs and lists 0 tests without error. No browsers downloaded |
| V11 | `npm audit --audit-level=high` | 0 high or critical findings. Lower findings reported |
| V12 | `git check-ignore node_modules .env` and `git status` | `node_modules` and `.env` ignored; only planned files appear |
| V13 | No application code | Outside the placeholders and the smoke test, there are no `.ts`, `.tsx` or `.css` files under `apps/` or `packages/` |
| V13a | `.github/dependabot.yml` | Valid YAML; exactly two entries (`npm`, `github-actions`); both `interval: weekly`; no auto-merge workflow or setting in the repository |
| V14 | CI on GitHub | Green run on the branch. **Requires you to approve pushing the branch** |

## 4. Approvals this plan needs

1. **Phase 3 and this dependency list.** (Playwright and Dependabot choices are already decided: D-036, D-037.)
2. **Later and separate:** committing, pushing the branch and opening a pull request for the CI run (V14).

## 5. Out of scope for Phase 3
- Application code.
- Database and migrations.
- ST-01, TD-001 and TD-002.
- Payment configuration.
- Infrastructure.
