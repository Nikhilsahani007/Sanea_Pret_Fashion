# Phase 8 Plan — Catalogue, Media, Catalogue API and Admin Shell

Status: **In progress; gate evidence being prepared (D-079).** Started 2026-10-24 on `claude/amazing-faraday-21s6uc` from `main` at `6593082` (merge of PR #5).

## Scope (index Phase 8)
- **Backend:** products, variants, categories, collections, colours, size charts, images, image processing, public catalogue, filter and search endpoints.
- **UI:** the shared design tokens (TD-002), the admin app shell (sign-in and navigation) and the admin catalogue screens.

TD-001 and TD-002 were decided on 2026-10-24 (D-077, D-078): CSS Modules with shared token custom properties, no Tailwind. Packages: only the planned list in `system-architecture.md` §7 (D-080).

## Decisions
D-135 search document and trigram index · D-136 raw-body media upload, derivatives and local serving · D-137 colours, sizes and size-chart routes; variant creation needs the price permission · D-138 publish preconditions and editor labels · D-139 in-memory facets · D-140 lock-file security fix. Full text: `DECISION-LOG.md`.

## Migration `20261024090000_catalogue_search` (needs your approval before any kept database)
- **Generated** by `prisma migrate diff --from-schema <Phase 7 schema> --to-schema prisma/schema.prisma`: column `product.search_vector tsvector` and GIN index `product_search_vector_idx`.
- **Handwritten:** extension `pg_trgm`; index `product_name_trgm_idx` on `lower(name) gin_trgm_ops`; function `refresh_product_search(uuid)`. All three are listed in `apps/api/src/db/handwritten.ts` and checked against the SQL (unit) and the live catalogue (integration).
- **Applied only to disposable databases** (local PostgreSQL 18.4 in this session, and the per-run test template). Not applied to any kept database. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` after `migrate deploy`: "No difference detected", exit 0.

## Backend implementation (2026-10-24)
| Area | Files |
|------|-------|
| Shared contracts | `packages/shared/src/catalogue/slug.ts` (`slugSchema`, `slugify`), `catalogue/availability.ts` (`availabilityOf`, IN_STOCK / LOW_STOCK with real remaining count / SOLD_OUT), `content/rich-text.ts` (structured rich text: paragraph, heading 2–3, list, link with safe href, image; no HTML) |
| Media | `apps/api/src/modules/media/{image,storage,urls,router}.ts` |
| Catalogue | `apps/api/src/modules/catalogue/{schemas,search-index,admin-products,admin-taxonomy,public-catalogue,public-router}.ts` |
| Platform | `config.ts` (`MEDIA_DIR`, `MEDIA_PUBLIC_BASE_URL`, https required in production), `body.ts` (raw image body allowed on the upload route only), `handle.ts` (shared route helpers, Prisma error mapping), `app.ts` (routers; development-only media serving) |
| Data | `prisma/schema.prisma`, the migration above, `seed.ts` builds search documents |

Every admin write runs in one transaction with its audit entry (before and after values, no personal data) and the search-document refresh.

## Verification (backend)
| Check | Command | Result |
|-------|---------|--------|
| Format | `npm run format:check` | Pass |
| Lint | `npm run lint` | Pass (0 errors, 0 warnings) |
| Typecheck | `npm run typecheck` | Pass |
| Unit tests | `npm test` | 24 files, 464 tests passed |
| Database and API tests | `TEST_DATABASE_URL=…/sanea_test npm run test:integration` (PostgreSQL 18.4, disposable) | 12 files, 302 tests passed, including `catalogue.db-test.ts` (32 tests) |
| Audit | `npm run audit` | 0 vulnerabilities after D-140 |

`catalogue.db-test.ts` covers the index verification: a product with colour × size variants and images is created, refused for publishing until ready, published, and found by size, colour, price, stock, category, collection, full-text, prefix and typo search; plus role checks (Fulfilment cannot edit, Catalogue editor cannot set prices), audited price changes, CSRF on upload, magic-byte checks, the pixel limit, EXIF removal, private originals, draft and unpublished-category hiding, schedules, cursor pagination and no exposure of exact stock above the threshold.

## Environment notes
- This session ran on Node 24.11.0 (downloaded to `/opt/node24`, the container default was Node 22) and PostgreSQL 18.4 binaries from the `@embedded-postgres/linux-x64` npm package, outside the repository. Docker was not available.
- `prisma migrate diff --from-schema … --to-schema …` needs `DATABASE_URL` set even though it reads no database (Prisma 7.10.1).
