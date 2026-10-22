# Sanéa Pret

Ecommerce platform for Sanéa Pret, a premium Indian women's eastern-wear brand. Tagline: *Effortless Elegance*.

**Status:** Phase 3, repository foundation. No application features exist yet. See [Project status](docs/PROJECT-STATUS.md).

Planned stack: TypeScript monorepo with React + Vite storefront and admin apps, a Node + Express API, PostgreSQL with Prisma, and a shared contracts package. Technology choices follow a documented, technology-flexible policy; the styling approach is not yet decided.

## Documentation

| Document | Purpose |
|----------|---------|
| [Project status](docs/PROJECT-STATUS.md) | Current phase, completed work, next task |
| [Master implementation index](docs/MASTER-IMPLEMENTATION-INDEX.md) | The implementation sequence and approval gates |
| [Decision log](docs/DECISION-LOG.md) | Confirmed, proposed and observed decisions |
| [Blockers](docs/BLOCKERS.md) | What is blocking each phase |
| [Open decisions](docs/open-decisions.md) | Business questions, answers and defaults |
| [Phase 3 plan](docs/phase-3-plan.md) | Proposed dependency list, setup steps and checks |
| [Project requirements](docs/project-requirements.md) | Business rules, scope, sitemap, user flows |
| [System architecture](docs/system-architecture.md) | Monorepo, modules, runtime |
| [Technology decisions](docs/technology-decisions.md) | Technology policy and decision records |
| [System design](docs/system-design.md) | Stock, checkout, orders, payments, content |
| [Database design](docs/database-design.md) | Entities and relationships |
| [API specification](docs/api-specification.md) | `/api/v1` endpoints |
| [Security design](docs/security-design.md) | Authentication, authorisation, risks |
| [Design system](docs/design-system.md) | Art direction, landing page, tokens, motion |
| [Testing strategy](docs/testing-strategy.md) | Test layers and critical cases |

## Local setup

Requires Node 24 (see `.nvmrc`) and npm 11.

```
npm ci                 # install exactly what the lock file records
npm run format:check   # Prettier
npm run lint           # ESLint, then the design-token check (check:tokens)
npm run typecheck      # TypeScript project build, no output
npm test               # Vitest: unit and admin component tests (jsdom)
npm run audit          # npm audit, high and critical
npm run fonts:fetch    # Panchang and Switzer from Fontshare into apps/*/public/fonts (git-ignored)
```

**Admin app** (`apps/admin`, React + Vite, CSS Modules):

```
npm run dev -w @sanea/admin      # http://localhost:5174, proxies /api to ADMIN_API_URL (default http://127.0.0.1:4000)
npm run build -w @sanea/admin    # production build in apps/admin/dist
```

The API must run with `ADMIN_ORIGIN=http://localhost:5174`. The first Owner's set-up link comes from `npm run admin:create-owner -- --email you@example.com`.

**Fonts:** the brand fonts are licensed for self-hosting but may not be placed in a public repository ([font licences](docs/font-licences.md)). Each environment runs `npm run fonts:fetch`; without it, the fallback fonts render.

**End-to-end tests** (Playwright with the installed Microsoft Edge, no browser download): `TEST_DATABASE_URL=… npx playwright test`. See [e2e/README.md](e2e/README.md).

Instructions for Claude Code are in [CLAUDE.md](CLAUDE.md).
