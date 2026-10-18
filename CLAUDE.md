# Sanéa Pret — Project Instructions

Premium Indian women's eastern-wear ecommerce. Tagline: "Effortless Elegance". India only, INR only.

## Read first, in this order
1. `docs/PROJECT-STATUS.md` — current phase, next task, what is blocked.
2. `docs/MASTER-IMPLEMENTATION-INDEX.md` — the only implementation sequence. Phase numbers everywhere mean this index.
3. `docs/DECISION-LOG.md` and `docs/BLOCKERS.md` — what is confirmed, proposed or blocked.
4. Only the specification the task needs: requirements, architecture, technology decisions, system design, database, API, security, design system, testing, open decisions (all in `docs/`).

`docs/implementation-roadmap.md` is historical. Do not plan from it.

## Confirmed stack (do not change without approval)
- npm workspaces monorepo: `apps/storefront`, `apps/admin` (React + Vite + TypeScript), `apps/api` (Node + Express + TypeScript, modular monolith), `packages/shared` (types and Zod schemas), `prisma/` (PostgreSQL + Prisma).
- API prefix `/api/v1`. No microservices.
- Styling approach: **unresolved** (TD-001 in `docs/technology-decisions.md`). Tailwind is allowed but not adopted or installed; it is evaluated only in the separately approved task ST-01.
- Design tokens are CSS custom properties with one shared source for both apps (TD-002, proposed), independent of the styling approach.

## Technology choices
- Technology-flexible: any tool may be adopted when it gives a meaningful, documented benefit (`docs/technology-decisions.md` §1).
- Judge options on functionality, customer experience, accessibility, performance, security, productivity, maintainability, compatibility, cost and lock-in.
- No unnecessary or duplicate dependencies, no speculative abstractions, no paid service without demonstrated value.
- Significant choices get a record (problem, options, recommendation, trade-offs, verification) and the user's approval. Run a small experiment when the best option is unclear.
- A provisional recommendation is not a decision.

## Business rules that code must respect
- Money in integer paise; display with `en-IN` INR formatting.
- Stock per variant (size × colour). Never oversell: atomic reservation plus database check constraints.
- Prices, totals and order confirmation are decided by the server. Payments confirm only from verified webhooks or server status queries.
- Live payment gateway deferred; mock provider only, never in production.
- No invented products, reviews, ratings, statistics or claims. Rehma Foundation content is published only after Owner verification.
- The landing page follows the mandated Nishorama composition (see index Phase 12). No copied code or assets.

## Security constraints
- Secrets only from environment variables; never commit `.env`. Keep `.env.example` current.
- Server-side validation on every route; server-side sessions; role checks in the API, not only in the UI.
- No `dangerouslySetInnerHTML`; CMS content is structured JSON.

## Approval gates
- Do not install dependencies, run migrations, provision infrastructure, configure live payments, delete files, commit or push without explicit approval for that action.
- Work only inside the current phase's scope. A phase starts only after the previous gate is recorded in `docs/DECISION-LOG.md`.
- A proposed default is not a decision until the user accepts it.

## Skills
- Storefront pages: `design-taste-frontend`. Admin screens, accessibility and forms: `ui-ux-pro-max`. Animation: `design-motion-principles`.
- Backend, database and API tasks need no design skill.
- `ui-styling` (Tailwind and shadcn) only if TD-001 adopts Tailwind.

## Reporting
- Mark work done only with evidence: commit hash, command and output, screenshot path, or recorded approval.
- Report every file created or modified, the commands run with their real results, assumptions and remaining blockers.
- Update `docs/PROJECT-STATUS.md` at the end of each task.
