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
    storefront/                     React + Vite + TS, regular CSS
      src/
        app/                        routing, providers, error boundaries
        features/                   catalogue, product, cart, checkout, account, content, enquiry
        components/                 shared UI primitives (Button, Pill, Drawer, Carousel…)
        styles/                     tokens.css, base.css, layout.css
        lib/                        api client, formatters, analytics
    admin/                          React + Vite + TS, regular CSS
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
    seed.ts                         development-only fake data
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
| auth | Admin and customer sign-in, sessions, password reset, CSRF tokens | AdminUser, Customer credentials, Session, PasswordResetToken |
| catalogue | Products, variants, categories, collections, attributes, publish state | Product, ProductVariant, ProductImage, Category, Collection, CollectionProduct, Colour, Size |
| search | Text search and faceted filtering over published catalogue | (reads catalogue; owns search indexes) |
| inventory | On-hand and reserved stock, reservations, movements, low-stock | InventoryLevel, StockReservation, StockMovement |
| cart | Cart lifecycle for guests and customers | Cart, CartItem |
| checkout | Pricing, shipping and COD eligibility, order placement orchestration | (orchestrates; owns CheckoutSession) |
| orders | Order records, status machine, fulfilment, cancellation | Order, OrderItem, OrderStatusEvent, Shipment |
| payments | Provider abstraction, payment intents, webhooks, refunds | Payment, PaymentEvent, Refund |
| customers | Profiles, addresses, wishlists | Customer, Address, WishlistItem |
| content | Homepage blocks, hero slides, navigation pills, pages, settings | ContentBlock, Page, NavigationItem, StoreSetting |
| enquiries | Website enquiries and WhatsApp click logs | Enquiry, WhatsAppClick |
| media | Image upload, validation, resizing, storage | MediaAsset |
| notifications | Transactional email (order confirmation, shipping, password reset) | NotificationLog |
| audit | Append-only record of admin actions | AuditLog |

## 4. Runtime and hosting assumptions

No infrastructure is provisioned in this phase. The architecture assumes:

- **Local development:** PostgreSQL 16 in Docker (Docker 28 is installed on this machine; PostgreSQL is not). API on port 4000, storefront on 5173, admin on 5174. Vite dev proxy forwards `/api` to the API to keep cookies same-origin.
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

Nothing is installed yet. Planned dependencies and the reason for each:

| Package | Where | Why |
|---------|-------|-----|
| react, react-dom, react-router | storefront, admin | UI and routing. |
| @tanstack/react-query | storefront, admin | Server-state caching, retries, optimistic cart updates. |
| zod | shared, api, apps | Single validation contract. |
| express, helmet, cors, cookie-parser | api | HTTP server and security headers. |
| express-rate-limit | api | Rate limiting on auth, enquiries, checkout. |
| @prisma/client, prisma | api | Database access and migrations. |
| argon2 | api | Password hashing. |
| pino, pino-http | api | Structured logging. |
| sharp | api | Image resizing and format conversion. |
| vitest, supertest, @testing-library/react, playwright | dev | Tests. |
| typescript, eslint, prettier | dev | Tooling. |

Deliberately avoided: Tailwind (per brief), CSS-in-JS runtimes, a component library such as MUI (it would fight the editorial design), Redux, GraphQL and any microservice tooling.
