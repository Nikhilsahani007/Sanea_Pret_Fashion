# Phase 10 Plan — Content Management

Status: **Evidence ready, awaiting your approval (D-079).** Date: 2026-10-24, branch `claude/amazing-faraday-21s6uc`.

## Scope (index Phase 10)
Content blocks (announcement bar, hero slides, category pills, product rows, tabbed grid, footer), navigation, pages, draft and publish, Rehma Foundation Owner-verified publishing. No migration: the Phase 6 tables and CHECKs are used as they are.

## Implementation
| Area | Files |
|------|-------|
| Shared | `packages/shared/src/content/blocks.ts`: block schemas, `CONTENT_BLOCKS` (fixed keys, D-145), `linkTargetSchema` and `targetHref` (one mapping of targets to storefront paths), `productSourceSchema`, `navigationItemsSchema`, `storeSettingsSchema` (all values empty by default) |
| API admin | `apps/api/src/modules/content/admin-router.ts`: blocks (list, read, save draft, publish, unpublish), pages (create, edit draft, publish, unpublish), navigation menus, store settings |
| API public | `public-router.ts`: `GET /content/home`, `/content/navigation`, `/content/pages/:slug`, `/content/settings/public`; `resolve.ts` (images, links, product rows); `cache.ts` (60 s, cleared on publish) |
| Admin UI | `pages/ContentHome.tsx` (one editor per block, draft and publish), `Pages.tsx` (structured rich-text editor; Rehma warning and verification statement), `Navigation.tsx`, `Settings.tsx`, `ui/pickers.tsx`; screens are now loaded per route |

Rules enforced:
- The storefront reads only `published` payloads, validated again on read; drafts never leave the admin API.
- Links to unpublished or missing categories, collections, products or pages are dropped instead of shown broken.
- The editorial band can be edited but is not served until you approve it (OD-23).
- Rehma Foundation: created with `requires_verification`; editing O M only; publishing Owner only and only with `verified: true`, recorded as `verified_by`/`verified_at` and audited as `page.published_verified`; the database CHECK refuses an unverified published row. No Rehma content has been written or published.

## Verification
| Check | Result |
|-------|--------|
| `content.db-test.ts` | 16 passed: drafts invisible; publish serves the published version while a newer draft exists; schedules; unpublish; field-path errors; HTML and unknown fields rejected; unsafe links rejected; hero images resolved and missing ones dropped; editorial band not served; Rehma: 403 for the catalogue editor and Manager on publish, 409 without `verified`, 404 until the Owner publishes, CHECK rejects unverified direct SQL; navigation targets validated and hidden when not live; settings O M only |
| Shared schema tests | `blocks.test.ts` 11 passed |
| End-to-end | Manager saves and publishes the announcement (not public until published); Manager creates the Rehma page and cannot publish; the Owner's publish button stays disabled until the verification statement is ticked. Screenshots `content-home-1440.png`, `rehma-verification-1440.png` in `docs/reviews/admin/2026-10-24/` |
| Full gate | format, lint, typecheck, tokens; 484 unit, 336 database and 12 end-to-end tests passed; build; audit 0 |
