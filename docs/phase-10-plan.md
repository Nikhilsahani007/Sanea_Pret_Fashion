# Phase 10 Plan — Content Management

Status: **Approved by you on 2026-10-23 (D-093), with Q10-1 to Q10-9 as recommended, including the Rehma placeholder wording. The Rehma data migration stops for your review before commit; the draft PR needs your authorisation.** · Date: 2026-10-23 · Base: `phase-10-content` from `phase-9-inventory` at `688dbf3` (Phase 9 gate passed, D-092; draft PRs #6 and #7 open and unmerged)

This plan covers Phase 10 of `MASTER-IMPLEMENTATION-INDEX.md`. Every step in §11 needs your approval of this plan first. Questions Q10-1 to Q10-9 (§9) need your decision.

## 1. Scope (from the index)

**In scope:**
- **Content blocks:**
  - announcement bar;
  - hero slides;
  - category pills;
  - product rows;
  - tabbed grid;
  - footer;
  - (editorial band: the type exists; see §3.1).
- **Navigation.**
- **Pages.**
- **Draft and publish.**
- **Rehma Foundation publishing,** verified by the Owner.
- **Admin content editors.**

**Depends on:** Phases 7 and 8 (both passed). The admin editors also depend on TD-001 and TD-002 (decided: D-085, D-086). Rule 1 is met: the Phase 9 gate is recorded (D-092).

**Verification:**
- drafts are never served publicly;
- the Rehma Foundation page returns 404 until the Owner publishes it with verification.

**Gate:** your review of the test output.

**Out of scope:**
- **Store settings** (`GET /content/settings/public`: WhatsApp number, contact details, COD flag). They are covered by the settings permission and needed from Phase 13; they get their own plan.
- **Storefront rendering** of content (Phases 11 and 12).
- **Whether the editorial band or Rehma teaser appear** on the landing page (OD-23, Phase 12).
- **Any real content:** policy texts (OD-12, lawyer-approved), Rehma Foundation information (OD-13, B-11), and campaign photography (B-03, B-06).

## 2. What already exists (Phase 6 schema; no change proposed except Q10-6)

| Table | Columns | Database guarantees |
|-------|---------|--------------------|
| `content_block` | `key` (unique), `type` (`ANNOUNCEMENT_BAR`, `HERO_SLIDE`, `CATEGORY_PILLS`, `PRODUCT_ROW`, `TABBED_GRID`, `EDITORIAL_BAND`, `FOOTER`), `draft` JSON, `published` JSON?, `published_at`, `published_by_admin_id` | CHECK `(published IS NULL) = (published_at IS NULL)` |
| `page` | `slug` (unique), `title`, `draft_body`, `published_body`?, SEO fields, `status` (`DRAFT`, `PUBLISHED`, `ARCHIVED`), `requires_verification`, `verified_by_admin_id`, `verified_at` | CHECKs:<br>• a page needing verification cannot be `PUBLISHED` without `verified_at`;<br>• `verified_at` and the verifier come together;<br>• slug `rehma-foundation` must require verification (D-010) |
| `navigation_item` | `menu` (text), `label`, `target_type` (`CATEGORY`, `COLLECTION`, `PRODUCT`, `PAGE`, `URL`), `target_id`?, `url`?, `position`; index (menu, position) | CHECK: `URL` has a URL and no target ID; the other types have a target ID and no URL |

**Also existing:**
- **Permissions** (`@sanea/shared`): `content.edit` for O M C; `content.publishRehma` for O only.
- **API specification §3 and §4:** `GET /content/home`, `/content/navigation`, `/content/pages/:slug`, and the admin routes for blocks, pages and navigation.
- **`richTextSchema`:** paragraphs, headings, lists and internal links (R2 `text` key), with no images.
- **Shared foundations:** media derivatives and public URLs (safeguard 1), the audit log, and the admin shell and editors from Phase 8.
- **Requirements** (`project-requirements.md` §8): the Rehma page is editable by O M only; its initial content is a neutral placeholder; publishing needs the Owner's "content verified" confirmation, recorded in the audit log; no donation or payment collection.

## 3. Design

### 3.1 Content blocks: a fixed registry, validated in `@sanea/shared`

Blocks are identified by a **fixed set of keys**: no arbitrary keys can be created (Q10-1). Each key has one type, and its payload is validated by a strict Zod schema in `packages/shared/src/content/`, used by both the API and the admin.

| Key | Type | Payload (strict, bounded) |
|-----|------|---------------------------|
| `site.announcement` | `ANNOUNCEMENT_BAR` | `text` (1 to 90 characters, plain); `link` (an internal target, optional); `startsAt` and `endsAt` (optional; end after start) |
| `home.hero` | `HERO_SLIDE` | `slides`: 1 to 5, in order (Q10-2). Each slide has:<br>• `desktopImageId` and `mobileImageId` (media assets);<br>• `alt` (1 to 200);<br>• `campaignLine` (at most 90);<br>• `ctaLabel` (1 to 30);<br>• `ctaTarget` (collection, category, product or page);<br>• `focalPoint` (x, y from 0 to 1);<br>• `startsAt` and `endsAt` (optional) |
| `home.newIns` | `PRODUCT_ROW` | `title`, `source: { kind: NEWEST }`, `maxItems` (4 to 24) |
| `home.row2` | `PRODUCT_ROW` | `title`, `source`: `COLLECTION` (id), `CATEGORY` (id), `NEWEST`, or `MANUAL` (1 to 24 product ids); `maxItems` |
| `home.tabbedGrid` | `TABBED_GRID` | `tabs`: 2 to 5 of `{ label, source }` (sources as for product rows); `maxItems` per tab |
| `home.editorial` | `EDITORIAL_BAND` | `images` (1 to 4 asset ids, with alt), `heading`, `text` (at most 280), `link`. **Not served by `/content/home` until OD-23 allows it** |
| `site.footer` | `FOOTER` | `contact` (address lines, hours, phone and email as text, optional); `social` (up to 6 `{ network, url }`, with `https` URLs on an allow-listed set of networks, Q10-4). Footer **link groups come from the navigation menus** (Q10-3) |

**Common rules:**
- Text never contains HTML; it uses the same "HTML-like" and control-character refusals as rich text.
- Links are internal targets (an entity type plus ID, resolved at read time) or allow-listed paths (safeguard 2). The only external URLs are the footer's `https` social links (Q10-4).
- Images reference `media_asset` IDs. Only derivative URLs are ever returned.
- On **save**, referenced assets and targets must exist; otherwise `400` names the field.
- On **publish**, the draft is validated again, and every target must still exist (`409` lists the problems, like D-083).

**Draft and publish:**
- `PUT` saves the draft.
- `POST …/publish` copies the draft to `published` atomically, sets `published_at` and the publisher, and writes an audit row.
- `POST …/unpublish` sets `published` to null (Q10-5), so the storefront omits the block.

There is no version history beyond the audit log (§3.6). A **"discard draft changes"** action copies `published` back to `draft`.

### 3.2 Category pills and the footer: one source each (Q10-3)

The schema has two places for category pills and footer links:
- a `CATEGORY_PILLS` block type;
- `navigation_item` with the menu `CATEGORY_PILLS`, plus footer menus.

**Proposal:**
- Ordered link lists live only in **navigation**: the menus `HEADER`, `CATEGORY_PILLS`, `FOOTER_SHOP`, `FOOTER_HELP`, `FOOTER_ABOUT`, as an allow-list.
- The `CATEGORY_PILLS` block type is **not used**: it gets no key in the registry, and the enum value stays unused, with no schema change.
- The `FOOTER` block holds only contact and social details.

This avoids two editors for the same links.

### 3.3 Navigation

- **Editing:** `PUT /admin/content/navigation/:menu` replaces the menu's ordered items:
  - up to 12 for the header and footer menus, 20 for pills;
  - each item has a label of 1 to 40 characters and a target;
  - an internal `URL` target must match the internal-link pattern;
  - the change is written in one transaction, with an audit row.
- **No draft for navigation:** the specification defines no draft for it (Q10-5). Safety comes from the read rule below.
- **Public read rule:** `GET /content/navigation` returns an item **only if its target is publicly visible** at that moment:
  - a published category;
  - a scheduled and published collection;
  - a visible product;
  - a published page.

  So a link to a draft or archived page, or to the unpublished Rehma page, is **never served**. The admin sees every item, with a "hidden: target not published" marker.

### 3.4 Pages

**Create** (`POST /admin/content/pages`):
- `slug`, `title`, optional SEO fields; the draft body starts empty;
- `slug` uses the shared slug rule;
- `rehma-foundation` always gets `requires_verification = true`, enforced by the API and the database.
- **Slugs are fixed after creation**, and `requires_verification` is never editable through the API. So the Rehma page cannot be renamed out of its database check, or have its flag cleared.

**Draft:**
- `PATCH /admin/content/pages/:slug` edits the title, `draftBody` and SEO fields;
- the body uses `richTextSchema`, plus an image node for pages only (Q10-6).

**Publish** (`POST …/publish`):
- copies `draftBody` to `publishedBody` and sets `status = PUBLISHED`;
- `published_at` is recorded in the audit row;
- an empty body cannot be published (`409 PAGE_EMPTY`).

**Unpublish** (`POST …/unpublish`, Q10-5):
- sets `status = ARCHIVED` and keeps `publishedBody` for the record, but it is never served while not `PUBLISHED`;
- publishing again needs the same checks.

**No deletion in release one** (Q10-7); unpublishing is the way to remove a page.

**Initial pages:**
- No page content is invented. Policy, FAQ and About pages are created by staff when real text exists (OD-12).
- The only row created by the system is the Rehma page (§3.5).

### 3.5 Rehma Foundation (D-010, BR-12, OD-13, R7)

| Rule | How it is enforced |
|------|--------------------|
| Edit only by O M | `PATCH` on `rehma-foundation` needs `content.edit` **and** a role of O or M: a page-level check in the API. Catalogue editors get `403` |
| Publish only by the Owner | `content.publishRehma` (O only), for publish and unpublish of this slug |
| Explicit verification | The publish body must contain `{ verified: true, draftVersion }`:<br>• `verified` is the "content verified" checkbox;<br>• `draftVersion` is the draft's `updated_at` that the Owner reviewed.<br>If the draft changed since the Owner reviewed it: **`409 DRAFT_CHANGED`**, and nothing is published (Q10-8) |
| Verification recorded | In the same transaction:<br>• `verified_by_admin_id` = the Owner, `verified_at` = now;<br>• the published body = that exact draft;<br>• an audit row `content.page_verified_published` with the draft version and a SHA-256 of the published body (no text) |
| The database as the final guard | The existing CHECK refuses `PUBLISHED` without verification for `requires_verification` pages, and the slug CHECK forces `requires_verification` for `rehma-foundation` |
| Edits after publishing | Draft edits never change what is public. Publishing again needs a new verification, with `verified_at` set again |
| Public 404 | `GET /content/pages/rehma-foundation` returns 404, **byte-identical to an unknown slug**, unless `status = PUBLISHED` and `verified_at` is set |
| No invented content | The system row is created with `status = DRAFT` and a neutral placeholder draft, *"Information about the Rehma Foundation will be published here once it has been verified."* (Q10-9). It is never published by the system. No mission, figures, registration numbers, 80G, equity or partner claims are written by the team |
| No teaser | The Rehma teaser (design-system §3, row 5) is not served by `/content/home` in Phase 10 (OD-23) |

**Q10-9:** the system row is created by a small data migration, like the size reference rows. It is idempotent and leaves an existing row unchanged.

### 3.6 Audit and recovery

**Audited:** every content write — draft saves, publish, unpublish, discard, navigation replace, page create — with the actor, the entity and **SHA-256 hashes of the before and after JSON**. Texts are not copied into the audit log, which keeps it small and free of free text.

**Recovery:**
- **Unpublish** removes content from the storefront at once; the HTTP cache expires within 60 s (§3.7).
- **Discard draft changes** restores the draft from what is published.
- A **published block** can be restored only by publishing a corrected draft. There is no automatic history; the audit hashes show what changed and when.
- **Database backup and restore** are Phase 19.

### 3.7 Public API

| Route | Serves | Cache |
|-------|--------|-------|
| `GET /content/home` | **Published** payloads only:<br>• `site.announcement` and `home.hero` slides inside their active dates (database clock);<br>• product rows and tabs **resolved at read time to visible products only** (published product, published category, an active variant), as the listing rules do;<br>• images as derivatives.<br>Never: a draft, an unpublished block, the editorial band (OD-23), or the Rehma teaser | `public, max-age=60` (Q8-5) |
| `GET /content/navigation` | The menus filtered as in §3.3, with the footer's contact and social details | `public, max-age=60` |
| `GET /content/pages/:slug` | `PUBLISHED` pages only (verified, if verification is required): `{ slug, title, body, seoTitle, seoDescription, publishedAt }` | `public, max-age=60`. A page that is not served returns 404 with `no-store`, so an unpublish is never cached as a hit |

**Leak protection:**
- **Admin routes only:** drafts are returned only by the admin routes (`no-store`, session and role).
- **Allow-listed public projections:** every public response is built from published fields only; no draft column is ever selected.
- **Proof:** a test scans every public response for a marker planted only in drafts (§7, T-GATE-1).

**Errors:**
- `400 VALIDATION_FAILED` with field paths;
- `404` (unknown key, slug or menu);
- `409 CONFLICT`, with details for:
  - publish problems, such as `TARGET_NOT_FOUND` or `PAGE_EMPTY`;
  - `DRAFT_CHANGED`;
- `403 FORBIDDEN` (role).

### 3.8 Admin API (O M C unless stated; `no-store`; CSRF)

| Method and path | Notes |
|-----------------|-------|
| `GET /admin/content/blocks` | Every registry key, with draft, published, the "unpublished changes" flag and `publishedAt` |
| `GET` and `PUT /admin/content/blocks/:key` | Read; save the draft (validated) |
| `POST /admin/content/blocks/:key/publish`, `/unpublish`, `/discard` | As in §3.1 |
| `GET /admin/content/pages`, `POST /admin/content/pages` | List and create |
| `GET` and `PATCH /admin/content/pages/:slug` | `rehma-foundation`: O M only |
| `POST /admin/content/pages/:slug/publish`, `/unpublish`, `/discard` | `rehma-foundation`: O only, with `{ verified: true, draftVersion }` for publish |
| `GET` and `PUT /admin/content/navigation/:menu` | Allow-listed menus only |

### 3.9 Admin editors (React, CSS Modules, shared tokens; no Tailwind)

- **Content**, a navigation entry for O M C, lists the blocks, each with a status: *Published*, *Unpublished changes*, or *Not published*. Text always accompanies the status.
- **Block editors,** one form per type:
  - text fields with limits;
  - an image picker from the media library, with required alt text;
  - a target picker (category, collection, product or page);
  - date fields in India Standard Time;
  - ordering with move up and down buttons (no dragging, as in Phase 8).

  Each editor shows a **preview of the published value next to the draft**, with Save draft, Publish, Unpublish and Discard draft changes. Destructive actions ask for confirmation.
- **Navigation editor:** one per menu, as an ordered list with move buttons, a target picker and the "hidden: target not published" marker.
- **Pages:**
  - a list with statuses;
  - an editor reusing the Phase 8 block editor for rich text, with the page image block if Q10-6 is approved.
- **Rehma Foundation:**
  - O M edit the draft; C sees no edit controls;
  - **only the Owner** sees **Verify and publish**. It shows the exact text that will be published and a required checkbox: *"I have verified that every statement on this page is accurate and approved for publication."* It sends `verified: true` and the reviewed draft version.
- **States:** loading, empty, error, forbidden and conflict (`DRAFT_CHANGED`, "Reload to review the latest draft").
- **Standards:** the Phase 8 standards apply — axe at 1440, 768 and 390 px, no horizontal scroll, keyboard operation, errors linked to fields. Screenshots go in `docs/reviews/admin/<run date>/`.

## 4. Data and migration

- **No table or column change.**
- **Q10-9: one data migration:**
  - it inserts the `rehma-foundation` page row (`DRAFT`, `requires_verification = true`, the neutral placeholder draft, no published body) with `ON CONFLICT (slug) DO NOTHING`;
  - it is validated like the Phase 8 and Phase 9 migrations: deploy, drift, down and up, on disposable databases only;
  - you review it before it is committed, as in Phase 9.
- **Q10-6 (page images)** changes only the shared Zod schema, not the database. Product descriptions keep refusing image nodes.
- **Upgrade risk:** existing rows (none in production) are read through the same schemas. Unreadable JSON is reported, not overwritten, as in the product description editor.

## 5. Security

- **Authorisation in the API:** `content.edit`, `content.publishRehma`, and the page-level O M rule for Rehma. The UI hides controls only as a convenience.
- **No HTML anywhere:** rich text through the allow-list renderer; plain-text fields refuse markup.
- **Links:** internal patterns, plus allow-listed social hosts over `https`.
- **No draft leakage:** allow-listed public projections, plus the marker test (§7).
- **The Rehma 404** is indistinguishable from an unknown slug: no existence leak.
- **CSRF and rate limits** as for other admin routes; request bodies limited to 100 KB.
- **The audit log** stores hashes, not texts.

## 6. Accessibility and responsive UI

- **Admin:** as in Phase 8.
- **Content constraints that help the storefront later:**
  - alt text required on every image;
  - campaign line and CTA lengths bounded for the hero;
  - the announcement limited to 90 characters.

## 7. Tests

**Gate tests** (integration, real PostgreSQL; each prints a `[P10-GATE]` line):

| # | Case | Pass condition |
|---|------|----------------|
| T-GATE-1 | A unique marker in every draft (blocks, pages, Rehma), **never published** | The marker appears in **no** response from `/content/home`, `/content/navigation`, `/content/pages/*`, `/catalogue/*` or `/search*`, at any point in the test |
| T-GATE-2 | Publish, then edit the draft | Public responses show only the published version; the new draft text never appears |
| T-GATE-3 | Unpublish, and archived pages | 404 or omitted immediately on the API, `no-store` on the 404 |
| T-GATE-4 | Rehma: draft only | `GET /content/pages/rehma-foundation` → 404, identical to an unknown slug (status, body shape, headers) |
| T-GATE-5 | Rehma: a Manager or catalogue editor tries to publish | 403; the page is still 404 publicly |
| T-GATE-6 | Rehma: the Owner without `verified: true`, or with a stale `draftVersion` | 400 or `409 DRAFT_CHANGED`; nothing published |
| T-GATE-7 | Rehma: direct SQL setting `PUBLISHED` without verification, or clearing `requires_verification` while the slug is `rehma-foundation`; and the API refusing any slug or flag change | Rejected by the database CHECKs, and the API returns 400 |
| T-GATE-8 | Rehma: the Owner verifies and publishes | 200, with the published body equal to the reviewed draft; `verified_*` set; an audit row with the body hash; then public 200 |
| T-GATE-9 | Navigation link to an unpublished page or category, and to the Rehma page before publishing | Not in `/content/navigation`; visible in admin with the marker |
| T-GATE-10 | A product row referencing a draft, archived or variantless product | That product is absent from `/content/home` |

**Also:**
- **Unit tests:** every block schema (valid and invalid, limits, HTML-like and control text, link rules, date order); the registry; navigation limits; the page image node, if approved; the "unpublished changes" flag.
- **Integration tests:**
  - the role matrix on every route: C has no Rehma edit; F has no content routes; unauthenticated gets 401; CSRF is required;
  - audit rows and hashes;
  - target validation on save and publish;
  - active dates on the database clock;
  - caching headers;
  - discard;
  - the migration's idempotency.
- **Admin component tests:**
  - each editor's validation and linked errors;
  - publish, unpublish and discard flows;
  - the Rehma "Verify and publish" visible only to the Owner, the checkbox required, and the `DRAFT_CHANGED` message.
- **End to end (Edge):**
  - a catalogue editor builds the announcement and hero, using synthetic images clearly labelled as test images, and publishes; `/content/home` shows them;
  - a navigation menu is edited;
  - a Manager edits the Rehma draft, and the public page stays 404;
  - the Owner verifies and publishes, and the public page is 200;
  - the Owner unpublishes, and the page is 404 again;
  - a catalogue editor cannot open the Rehma editor;
  - axe and screenshots.

  **The end-to-end Rehma text is synthetic test text, marked as such; it never leaves the disposable database.**
- **Coverage:** the 90% target for the `content` module is **unmeasured** until a compatible `@vitest/coverage-v8` is available, as recorded in D-092. It is rechecked on 2026-10-29.

## 8. Dependencies

**None new.** Everything uses the existing React, React Router, Zod, Prisma and test tooling.

## 9. Questions for you (approved 2026-10-23 as recommended, D-093)

| # | Question | Recommendation |
|---|----------|----------------|
| Q10-1 | Fixed block registry (the keys in §3.1) instead of arbitrary keys | **Yes.** It prevents stray blocks; a new key is a reviewed code change |
| Q10-2 | Hero slides as one `home.hero` block with 1 to 5 ordered slides, published together | **Yes.** Slides are published atomically and the order is part of the payload |
| Q10-3 | Category pills and footer link groups only in navigation menus; the `CATEGORY_PILLS` block is not used; the `FOOTER` block holds contact and social only | **Yes.** One editor per list |
| Q10-4 | The footer's external links: `https` only, on allow-listed networks (Instagram, Facebook, YouTube, Pinterest, WhatsApp's `wa.me`, X); everything else internal | **Yes.** Safeguard 2 extended only for social links |
| Q10-5 | Add `unpublish` (blocks and pages) and `discard draft changes`, which the specification lacks; navigation has no draft, and its items are filtered by target visibility | **Yes** |
| Q10-6 | Pages need images (`system-design.md` §7). Add an `image` node (media asset ID, required alt text, optional caption) to rich text **for pages only** | **Yes.** Product descriptions keep refusing images |
| Q10-7 | No page deletion in release one (unpublish instead) | **Yes** |
| Q10-8 | Rehma publish binds verification to the reviewed draft version (`409 DRAFT_CHANGED` if it changed) | **Yes.** It prevents publishing text the Owner did not see |
| Q10-9 | A data migration creates the `rehma-foundation` row as a draft with the neutral placeholder in §3.5 (never published by the system). Approve the placeholder wording, or give your own | **Yes**, with the wording in §3.5 |

**Recorded, not decided here:** OD-12 (policy texts), OD-13 (Rehma content and who verifies it), OD-23 (editorial band and teaser), and the store settings.

## 10. Acceptance criteria

| ID | Criterion |
|----|-----------|
| P10-AC1 | **Drafts are never served publicly:** T-GATE-1 to T-GATE-3, T-GATE-9 and T-GATE-10 pass, locally and in CI, with `[P10-GATE]` output recorded for your review |
| P10-AC2 | **The Rehma Foundation page returns 404 until the Owner verifies and publishes it:** T-GATE-4 to T-GATE-8 pass, including the database-level refusals; the verification is audited with the body hash |
| P10-AC3 | Every block type in the registry is validated by shared schemas on save and publish; no HTML is accepted; links and images follow safeguards 1 and 2 |
| P10-AC4 | Navigation and pages support the approved draft, publish, unpublish and discard behaviour; the public read rules hide non-public targets |
| P10-AC5 | The role matrix is enforced in the API (`content.edit`, `content.publishRehma`, the O M Rehma edit rule); every write is audited |
| P10-AC6 | The admin editors meet the Phase 8 UI standards: axe clean at 3 widths, no horizontal scroll at 390 px, keyboard-operable, linked errors, screenshots |
| P10-AC7 | No new dependency; format, lint (with the token check), typecheck, unit, integration, end-to-end and audit all pass; CI green on a draft PR |
| P10-AC8 | The specifications (`api-specification.md`, `system-design.md` §7, `database-design.md`) match the implementation; no real content invented |

## 11. Sequence and stop points

| Step | Work | Needs your approval |
|------|------|---------------------|
| 1 | Approve this plan and Q10-1 to Q10-9 | **Done** 2026-10-23 (D-093) |
| 2 | Shared content schemas (and the page image node, if Q10-6 is approved), with unit tests | Covered by step 1 |
| 3 | The Rehma data migration, validated on disposable databases | Covered by Q10-9, then **a review stop before commit** (validated, §13.1; **approved, D-094**) |
| 4 | The `content` module: admin and public routes, gate tests | Covered by step 1 |
| 5 | Admin editors; component and end-to-end tests; screenshots | Covered by step 1 |
| 6 | Specification amendments; commit and normal push; CI on a draft PR | **Done:** `df15048`, draft PR #8 (authorised), CI green (§13.5) |
| 7 | **Phase 10 gate:** your review of the test output | **Passed** 2026-10-23 (D-095) |

## 12. Risks

| Risk | Mitigation |
|------|------------|
| A draft field leaks through a new endpoint later | Allow-listed public projections; the marker test runs over every public route, including catalogue and search |
| The Owner publishes Rehma text changed after review | Draft-version binding (Q10-8) and the audited body hash |
| Stale public content after unpublish | 404 responses are `no-store`; hits cache for 60 s at most (Q8-5). Accepted: content is not price or stock |
| Content linking to removed products | Product rows and navigation are resolved at read time, and invisible targets are dropped; publish refuses missing targets |
| Placeholder or test content reaches production | No content seeding beyond the Rehma draft placeholder; end-to-end text exists only in disposable databases |

## 13. Evidence (2026-10-23; migration approved, D-094; gate passed, D-095)

Run on Windows 11, Node 24.11.0, against a disposable PostgreSQL 18.6 container (`postgres:18.6-alpine`, synthetic data only, no production data or secrets).

| Check | Command | Result |
|-------|---------|--------|
| Unit and component | `npm test` | 688 passed (37 files) |
| Integration | `npm run test:integration` | 381 passed (17 files), including 17 content tests |
| End to end (Edge) | `npm run test:e2e` | 11 passed; axe clean at 390, 768 and 1440 px |
| Lint and design tokens | `npm run lint` | clean |
| Format | `npm run format:check` | clean |
| Typecheck | `npm run typecheck` | clean |
| Admin build | `npm run build -w @sanea/admin` | passed; JS 148.11 kB gzipped, CSS 3.88 kB |
| Dependencies | `npm run audit` | 0 vulnerabilities; nothing installed or changed |

### 13.1 Migration `20261023120000_rehma_foundation_page` (validated, not committed)

- `prisma migrate deploy` on an empty database applies 5 migrations; `migrate status` is up to date; `migrate diff` against the schema exits 0 (no drift).
- The row is `rehma-foundation`, "Rehma Foundation", the approved placeholder, `DRAFT`, `requires_verification` true, no published body, no verifier.
- Re-running the insert is a no-op; an existing row with that slug is left unchanged (`ON CONFLICT DO NOTHING`).
- Both page CHECKs refuse a direct publish without verification and clearing the flag.
- Deleting the row leaves the schema without drift (data only).
- Re-checked before commit on the final files, on a fresh database: the same results (row with the exact placeholder text; re-run leaves 1 row; a staff-edited row keeps its title and body; the direct publish fails `page_verification_required_check` and clearing the flag fails `page_rehma_requires_verification_check`). The migration has no DDL and `schema.prisma` is unchanged.

### 13.2 Gate output (`[P10-GATE]` lines from `npm run test:integration`)

```
T-GATE-1/2 marker planted in 4 drafts (page, announcement, product row, Rehma): absent from 9 public routes, before and after publishing; published versions served
T-GATE-3 unpublished page: 200 then 404 (no-store) immediately; unpublished announcement: absent from /content/home
T-GATE-4 rehma-foundation (migration row: DRAFT, requires verification, unverified): 404 identical to an unknown slug in status, code, message and headers
T-GATE-5 Rehma publish by Manager, catalogue editor and fulfilment: 403; catalogue editor edit: 403; public still 404
T-GATE-6 Owner without verified:true: 400; verified:false: 400; stale draft version: 409 DRAFT_CHANGED; public still 404
T-GATE-7 direct SQL publish without verification and clearing the flag: rejected by CHECKs; API slug or flag change: 400
T-GATE-8 Owner verify-and-publish with the reviewed version: 200; verified_by and verified_at set; audit has the body hash, no text; public 200; Manager unpublish 403; Owner unpublish then 404
T-GATE-9 menu of 5: draft category, draft page and unpublished Rehma page hidden publicly (marked hidden in admin); 2 public links served
T-GATE-10 manual row of 4 (visible, draft, archived, no active variant): only the visible product served
```

### 13.3 Screenshots

`docs/reviews/admin/2026-10-23/`: `content`, `content-block-editor` and `content-rehma-owner`, each at 390, 768 and 1440 px. The earlier catalogue and inventory screenshots in that folder were regenerated by the same run (the navigation now includes Content).

### 13.4 Changes to earlier-phase tests

The migration adds one `page` row, so tests that assumed an empty `page` table now assert the exact approved state instead: `schema.test.ts` (two data inserts, and the Rehma insert is an unpublished draft with `ON CONFLICT`), `catalog.db-test.ts` (the single Rehma draft; 20 other tables empty), `seed.db-test.ts` (page count excludes the Rehma draft).

### 13.5 CI evidence (2026-10-23)

**Run 39899773210** on draft PR #8 (`phase-10-content` → `phase-9-inventory`, `df15048`; Ubuntu 24.04). All jobs succeeded:

| Job | Result |
|-----|--------|
| Format, lint, typecheck, test, audit | 37 files, 688 tests; `npm audit` 0 |
| Database integration tests | 17 files, 381 tests; all 9 `[P10-GATE]` lines (T-GATE-1 to T-GATE-10) printed and passing |
| Secret scan (Gitleaks) | Success |

### 13.6 Recorded limitations

- **Migration idempotency** (a re-run leaves one row; an existing `rehma-foundation` row is not overwritten) and the **exact placeholder wording** were verified manually on disposable databases (§13.1). No dedicated automated test covers them: `schema.test.ts` checks the insert's shape (`DRAFT`, `requires_verification`, no published or verified columns, `ON CONFLICT ("slug") DO NOTHING`) and `db/content.db-test.ts` checks the migrated row's status and flags, not the wording.
- PR #8 stays a draft and is not merged; PRs #6 and #7 likewise.

**Gate: passed on 2026-10-23 (D-095), on your explicit approval.**
