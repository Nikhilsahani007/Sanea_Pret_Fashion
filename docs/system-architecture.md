# Sanéa Pret — System Architecture

Status: Draft for approval · Date: 2026-10-18

## 1. Summary

A TypeScript monorepo containing two React single-page apps (storefront and admin), one Express API built as a modular monolith, a shared contracts package and a PostgreSQL database accessed through Prisma. No microservices.

```
                 ┌───────────────────────┐        ┌───────────────────────┐
  Shoppers ───▶  │  apps/storefront      │        │  apps/admin           │ ◀── Staff
                 │  React + Vite + TS    │        │  React + Vite + TS    │
                 └──────────┬────────────┘        └──────────┬────────────┘
                            │ HTTPS  /api/v1/*               │ HTTPS  /api/v1/admin/*
                            ▼                                ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │  apps/api   Node.js + Express + TS  (modular monolith)    │
                 │  catalogue · search · cart · checkout · orders · payments │
                 │  inventory · content · enquiries · customers · auth      │
                 │  media · notifications · audit                            │
                 └───────┬─────────────────────┬───────────────┬────────────┘
                         │ Prisma              │               │
                         ▼                     ▼               ▼
                 ┌──────────────┐     ┌────────────────┐  ┌──────────────────┐
                 │ PostgreSQL   │     │ Object storage │  │ External (later) │
                 │ (single DB)  │     │ local disk in  │  │ payment gateway, │
                 │              │     │ dev; S3-type   │  │ email, courier   │
                 └──────────────┘     │ later          │  └──────────────────┘
                                      └────────────────┘
                 packages/shared: types, Zod schemas, enums, money/format utils
```

## 2. Repository structure

```
sanea-pret/                         (this repository root)
  apps/
    storefront/                     React + Vite + TS; styling per TD-001
      src/
        app/                        routing, providers, error boundaries
        features/                   catalogue, product, cart, checkout, account, content, enquiry
        components/                 shared UI primitives (Button, Pill, Drawer, Carousel…)
        styles/                     tokens.css, base.css, layout.css
        lib/                        api client, formatters, analytics
    admin/                          React + Vite + TS; styling per TD-001
      src/ (same shape: app, features, components, styles, lib)
    api/
      src/
        modules/
          <module>/                 router.ts, controller.ts, service.ts, repository.ts, *.test.ts
        platform/                   http (app, middleware), config, db, logger, errors, jobs
        main.ts
  packages/
    shared/
      src/
        schemas/                    Zod request/response schemas (single source of truth)
        types/                      inferred types, enums (OrderStatus, PaymentMethod…)
        money.ts                    paise arithmetic and INR formatting
        index.ts
  prisma/
    schema.prisma
    migrations/                     (created only after approval)
    (seed: apps/api/src/db/seed.ts, development-only fake data; `npm run db:seed`)
  docs/
  .env.example                      no secrets; documents every variable
  package.json                      npm workspaces
  tsconfig.base.json
```

### Recommended adjustments to the proposed structure

These are recommendations. None is applied without approval.

| Change | Why | Default if not approved |
|--------|-----|-------------------------|
| Use **npm workspaces** for the monorepo. | npm 11 is already installed. pnpm or Turborepo would be new tooling with little benefit at this size. | npm workspaces. |
| Keep `prisma/` at the root, but only `apps/api` imports the Prisma client. | Matches the proposal. Frontends must never import Prisma, so a lint rule forbids it. | As stated. |
| Add `packages/config` later only if lint and TS config duplication becomes painful. | Avoids an empty package on day one. | Not added. |
| Add `e2e/` at the root for Playwright tests. | End-to-end tests cross both apps and the API, so they belong to no single app. | Added in Phase 3 (master index). |

## 3. API modules (modular monolith)

Each module owns its routes, validation, business logic and database access. A module calls another module only through that module's exported service interface, never through its repository or tables directly. This keeps the option of extracting a module later without making it a distributed system now.

| Module | Responsibility | Owns tables |
|--------|----------------|-------------|
| auth | Admin sign-in (customer sign-in deferred, D-034), sessions, password reset, CSRF tokens | AdminUser, Customer credentials, Session, PasswordResetToken |
| catalogue | Products, variants, categories, collections, attributes, publish state | Product, ProductVariant, ProductImage, Category, Collection, CollectionProduct, Colour, Size |
| search | Text search and faceted filtering over published catalogue | (reads catalogue; owns search indexes) |
| inventory | On-hand and reserved stock, reservations, movements, low-stock | InventoryLevel, StockReservation, StockMovement |
| cart | Cart lifecycle for guests and customers | Cart, CartItem |
| checkout | Pricing, shipping and COD eligibility, order placement orchestration | (orchestrates; owns CheckoutSession) |
| orders | Order records, status machine, fulfilment, cancellation | Order, OrderItem, OrderStatusEvent, Shipment |
| payments | Provider abstraction, payment intents, webhooks, refunds | Payment, PaymentEvent, Refund |
| customers | Profiles, addresses, wishlists. **Deferred to a later release (D-034).** | Customer, Address, WishlistItem |
| content | Homepage blocks, hero slides, navigation pills, pages, settings | ContentBlock, Page, NavigationItem, StoreSetting |
| enquiries | Website enquiries and WhatsApp click logs | Enquiry, WhatsAppClick |
| media | Image upload, validation, resizing, storage | MediaAsset |
| notifications | Transactional email (order confirmation, shipping, password reset) | NotificationLog |
| audit | Append-only record of admin actions | AuditLog |

## 4. Runtime and hosting assumptions

No infrastructure is provisioned in this phase. The architecture assumes:

- **Local development:** PostgreSQL 18 in Docker through `compose.yaml` (D-051), bound to `127.0.0.1:5433` by default, password required from your local `.env`. API on port 4000, storefront on 5173, admin on 5174. Vite dev proxy forwards `/api` to the API to keep cookies same-origin.
- **Production (later, separate approval):** API as a container, PostgreSQL as a managed service, images in object storage behind a CDN, both SPAs as static files on a CDN. AWS is named in the brief as a likely target. Nothing is provisioned until approved.
- **Background jobs:** a small in-process job runner backed by a PostgreSQL table (or `pg-boss`) for reservation expiry, unconfirmed-COD expiry and email sending. No Redis or message broker in R1.

## 5. Cross-cutting concerns

| Concern | Approach |
|---------|----------|
| Validation | Zod schemas in `packages/shared` are used by the API (authoritative) and by the forms (for early feedback). The server never trusts client validation. |
| Errors | One error shape (see `api-specification.md` §2). Domain errors carry stable codes such as `OUT_OF_STOCK`. |
| Config | All configuration from environment variables, parsed and validated at startup. The process refuses to start on missing or invalid values. |
| Logging | Pino JSON logs with request ID, no personal data or secrets in logs. |
| Money | Integer paise everywhere. Shared helpers for arithmetic and `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` display. |
| Time | UTC in the database. Displayed in Asia/Kolkata. |
| IDs | UUID v7 for primary keys (sortable). Human order numbers like `SP-2611-000123`. |
| Idempotency | `Idempotency-Key` header on order placement and payment start. Webhooks deduplicated by provider event ID. |
| Transactions | Stock and order writes happen in one database transaction with row-level locks or conditional updates. See `system-design.md` §3. |

## 6. Rendering, SEO and performance

A plain Vite SPA renders in the browser, so crawlers and link previews may see empty pages. Product and collection pages need good SEO for an ecommerce brand. Options:

| Option | Effort | Notes |
|--------|--------|-------|
| A. SPA with `react-helmet-async` tags only | Low | Google renders JavaScript, but WhatsApp, Instagram and Facebook link previews will not see product titles or images. |
| B. SPA plus pre-rendering of public routes at build time and on publish | Medium | Good for content pages; product pages change often and need re-rendering on publish. |
| C. **Vite SSR for the storefront** using React's streaming server renderer, served by a small Node server | Medium-high | Best for SEO and link previews. Keeps React, Vite and TypeScript. |

**Recommendation:** start with A plus a tiny API-side "meta" endpoint that serves correct Open Graph HTML to known link-preview bots for product and collection URLs. Move to C in Phase 17 (master index) if search traffic justifies it. Recorded as OD-14.

Performance budgets for the storefront: initial JS ≤ 170 KB gzipped, hero image served as AVIF/WebP with `srcset`, fonts self-hosted and subset, route-level code splitting, product images lazy-loaded below the fold.

## 7. Dependencies (planned, minimal)

### Installed in Phase 3 (development only, pinned exactly)

| Package | Version | Reason |
|---------|---------|--------|
| typescript | 6.0.3 | Type checking. Held below 6.1 because typescript-eslint 8.71.2 supports `<6.1.0`. |
| @types/node | 26.6.5 | Node types for config files and scripts. |
| eslint | 10.13.0 | Linting. |
| @eslint/js | 10.0.1 | Recommended JavaScript rules. |
| typescript-eslint | 8.71.2 | TypeScript parser and rules. |
| eslint-config-prettier | 10.1.8 | Disables style rules that conflict with Prettier. |
| prettier | 3.9.10 | Formatting. |
| vitest | 5.0.5 | Unit and integration tests. |
| vite | 8.3.4 | Required peer of Vitest 5; used by the apps later. |
| @playwright/test | 1.64.1 | End-to-end runner; no browsers installed yet (D-036). |

No runtime dependencies were installed in Phase 3. Details and checks: `phase-3-plan.md`, `PROJECT-STATUS.md`.

### Installed in Phase 4 (runtime, pinned exactly)

| Package | Version | Where | Reason |
|---------|---------|-------|--------|
| zod | 4.6.7 | `@sanea/shared` dependency | Validation schemas used by the API and the apps; classic API, not `zod/mini` (D-042) |

Apps consume `@sanea/shared` through its package exports, without TypeScript project references to it (D-041).

### Installed in Phase 5 (`@sanea/api`, pinned exactly)

| Package | Version | Kind | Reason |
|---------|---------|------|--------|
| express | 5.3.0 | runtime | HTTP server |
| helmet | 8.3.0 | runtime | Security headers |
| cors | 2.8.6 | runtime | Origin allow-list |
| cookie-parser | 1.4.7 | runtime | Reads the CSRF cookie |
| express-rate-limit | 8.7.1 | runtime | Rate limiting; in-memory, single instance (D-047) |
| pino | 10.4.0 | runtime | JSON logs with redaction |
| pino-http | 11.0.0 | runtime | Request logs with request ID |
| zod | 4.6.7 | runtime | Config schema; same version as `@sanea/shared`, deduplicated |
| supertest | 7.3.1 | dev | HTTP tests |
| @types/express, @types/cors, @types/cookie-parser, @types/supertest | 5.0.6, 2.8.19, 1.4.10, 7.2.1 | dev | Types |

### Installed in Phase 6 (pinned exactly)

| Package | Version | Where | Reason |
|---------|---------|-------|--------|
| prisma | 7.10.1 | root, dev | CLI: generate, validate, migrations. npm's `latest` tag points to 8.0.0-rc.23, so the pin is deliberate (D-052) |
| @prisma/client | 7.10.1 | `@sanea/api` | Generated client runtime; the client is generated into `apps/api/src/generated/prisma` and not committed (D-053) |
| @prisma/adapter-pg | 7.10.1 | `@sanea/api` | PostgreSQL driver adapter; brings `pg` 8.23.1 |

No `dotenv`: `prisma.config.ts` uses Node's `process.loadEnvFile`.

### Phase 7 (no new packages)

Argon2id (`crypto.argon2`), TOTP (HMAC-SHA-1), AES-256-GCM and HMAC all use Node 24's built-in `crypto` (D-062, D-064, D-065). The common-password list is a data file from SecLists (MIT), not a package (D-063).

### Installed in Phase 8 (pinned exactly, D-080)

| Package | Version | Where | Reason |
|---------|---------|-------|--------|
| sharp | 0.35.5 | `@sanea/api` | Image validation, EXIF-free re-encoding to AVIF and WebP (system-design.md §10). Uses prebuilt libvips binaries (platform packages in the lock file); verified on linux-x64 only |

| react, react-dom | 19.3.0 | `@sanea/admin`, `@sanea/storefront` | UI (D-080). `overrides` keep one copy in the tree (D-143) |
| react-router | 8.4.0 | admin, storefront | Routing |
| @tanstack/react-query | 5.104.1 | admin, storefront | Server-state caching and mutations |
| @vitejs/plugin-react | 6.1.2 | root, dev | React transform for Vite |
| @types/react, @types/react-dom | 19.3.0 | root, dev | Types for React |

Not installed: `@testing-library/react` (component behaviour is covered by Playwright against the real app instead, so no DOM-emulation package is needed). Self-hosted font files (Archivo, OFL) are assets, not packages (D-141).

### Installed on 2026-10-25 (development only, pinned exactly, D-165)

| Package | Version | Reason |
|---------|---------|--------|
| @axe-core/playwright | 4.13.0 | Automated WCAG checks in the Playwright suite (`e2e/accessibility.spec.ts`); brings `axe-core` 4.13.0; MPL-2.0 |
| lighthouse | 13.5.0 | Performance and accessibility scores on the production storefront build (`npm run lighthouse`); Apache-2.0; uses the installed Chromium through `CHROME_PATH` |

Lock file: 105 new entries, all development-only; no existing package changed version.

### Planned for later phases

Not installed yet. Planned dependencies and the reason for each:

| Package | Where | Why |
|---------|-------|-----|
| zod | shared, api, apps | Single validation contract. |
| express, helmet, cors, cookie-parser | api | HTTP server and security headers. |
| express-rate-limit | api | Rate limiting on auth, enquiries, checkout. |
| pino, pino-http | api | Structured logging. |
| vitest, supertest, @testing-library/react, playwright | dev | Tests. |
| typescript, eslint, prettier | dev | Tooling. |

Not planned, unless a decision record shows a benefit (`technology-decisions.md`): runtime CSS-in-JS (performance cost), a component library such as MUI (it would fight the editorial design), Redux, GraphQL and any microservice tooling. Tailwind is no longer excluded; whether to use it is the unresolved decision TD-001.

## 8. Technology decision policy

New technologies are chosen under the technology-flexible policy in `technology-decisions.md` §1. The architecture in this document is preserved unless a decision record justifies a change and you approve it.
