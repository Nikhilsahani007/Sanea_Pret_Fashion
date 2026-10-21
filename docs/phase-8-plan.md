# Phase 8 Plan — Catalogue, Media and Catalogue API (backend)

Status: **Decisions approved in principle (2026-10-19), including Q8-11 and three safeguards. `sharp` compatibility test passed (§10a); AVIF retest passed (§10b). Step 3 done on branch `phase-8-catalogue` (uncommitted). No API module or migration yet: step 4 needs your approval.** · Date: 2026-10-19 · Updated: 2026-10-20 · Base: `main` at `6593082` (Phase 7 merged, PR #5)

This plan covers the **backend** half of Phase 8 (`MASTER-IMPLEMENTATION-INDEX.md` Phase 8). It changes no code, runs no migration and installs nothing. Every step in "Sequence and stop points" needs its own approval.

## 1. Scope

**In scope (backend):**
- **Admin catalogue API:**
  - categories, collections and their product order, products, variants, publish and archive;
  - price fields restricted to Owner and Manager by the existing permission table;
  - every write audited.
- **Media API:** admin image upload, validation, re-encoding, resizing and storage.
- **Public catalogue and search API:**
  - category tree and collections;
  - product listing with filters, facets, sorting and cursor paging;
  - product detail;
  - search and suggestions.
- **One migration:** search fields and indexes, deferred from Phase 6 (D-054, `database-design.md` §6).

**Phase 8 UI deliverables, not planned here:** shared token files (TD-002), the admin shell (sign-in screen and navigation), and admin catalogue screens. TD-001 and TD-002 are now decided (D-085, D-086), so these are unblocked. They get a separate plan addendum using `ui-ux-pro-max`. The Phase 8 gate needs both halves (index rule 6).

**Out of scope:**
- stock levels, adjustments and reservations (Phase 9);
- content blocks (Phase 10);
- cart (Phase 11);
- storefront pages (Phases 11 to 13);
- cloud storage or CDN provisioning (Phase 19);
- payments;
- Tailwind.

## 2. Prerequisites

| Item | State |
|------|-------|
| Phase 7 gate | Passed (D-076) |
| Phase 7 merged into `main` | Done: merge commit `6593082` (PR #5) |
| TD-001, TD-002 | Decided (D-085, D-086). Needed only for the UI half |
| D-077 to D-084 and Q8-1 to Q8-10 | **Approved in principle** (2026-10-19), with the three safeguards in §5.6 |
| `sharp` compatibility test | **Passed** (§10a) |
| Q8-11 | **Approved:** option (a), synchronous; retest passed (§10b) |
| Step 3: branch, `sharp`, specification amendments | **Done** (2026-10-20), uncommitted |

## 3. Decisions D-077 to D-084 (approved in principle)

The full text is in `DECISION-LOG.md`, "Phase 8", worded exactly as proposed on 2026-10-19. Each one was checked against the specifications:

| # | Subject | Check against specifications | Result |
|---|---------|------------------------------|--------|
| D-077 | `sharp` 0.35.5, re-encode, 8000 × 8000 cap, AVIF and WebP at 480/960/1440/2048 | `security-design.md` §6; `system-design.md` §10; `system-architecture.md` §7 lists `sharp` for the API. Registry check 2026-10-19: `0.35.5` is `latest`, engines `node >=20.9.0` | Consistent |
| D-078 | Magic bytes plus sharp's format check; no `file-type` | `security-design.md` §6; `system-design.md` §10 | Consistent |
| D-079 | Raw image body, `Content-Type: image/*`, ≤ 15 MB, admin only | Limit matches `security-design.md` §3. **Differs from** `api-specification.md` §4 ("multipart") | Spec amendment needed (§6) |
| D-080 | Storage interface; local disk in development; cloud in Phase 19; private originals; random keys; never served from the API | `security-design.md` §6; `system-design.md` §10; `system-architecture.md` §4 (object storage later, separate approval) | Consistent. Q8-9 asks how the development image server is built |
| D-081 | Search text maintained by triggers; trigram indexes; no search engine (D-110) | `system-design.md` §8 and `database-design.md` §4 specify a **`tsvector`** (GIN on `searchVector`) **plus** a trigram index on `name`. D-081 does not name the `tsvector` | **Needs a wording fix:** Q8-1 |
| D-082 | `IN_STOCK` / `LOW_STOCK` / `SOLD_OUT`; "exact counts are never exposed" | `api-specification.md` §6 returns `"remaining": n` with `LOW_STOCK`, for "Only 2 left". D-082 also says it is for that label | **Conflicts with the specification:** Q8-2 |
| D-083 | Publishing rules; slug fixed after first publish | `system-design.md` §1 (published plus one active variant); `system-design.md` §10 (alt text), already enforced by `product_image_alt_check`; `product_published_at_check`. The slug rule is new and not in the specifications | Consistent. Q8-6 covers the publish date and later deactivation |
| D-084 | Cursor paging; 60-second cache; search 60/min per IP | `api-specification.md` §2 (cursor); `security-design.md` §3 (search 60/min); `system-design.md` §7 (60 s, content) | Consistent. Q8-5 clarifies what the cache is |

## 4. Questions found while planning (all resolved)

These were found while checking the plan. **All are resolved** (2026-10-19 and 2026-10-20). Each was approved as recommended, except Q8-8, where you chose `NEW` only; Q8-11 is approved as option (a). See "Resolutions" below the table.

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q8-1 | D-081: which search columns? | (a) a `tsvector` column `search_vector` maintained by triggers, a GIN index on it, and a GIN trigram index on `product.name`, as the specifications say; (b) only a text column with trigram indexes, as D-081 can be read | **(a)**, with the `simple` text-search configuration: no English stemming of transliterated garment names such as "Anarkali". Amend the D-081 wording to match |
| Q8-2 | D-082: does `LOW_STOCK` include `remaining`? | (a) yes, `remaining` only when available ≤ the variant's `low_stock_threshold`, never above it (API spec §6); (b) no count at all (D-082 as worded) | **(a).** "Only 2 left" needs the number, and the spec already allows only real numbers at or below the threshold. Amend D-082 |
| Q8-3 | The API specification has no admin endpoints for **colours** and **size charts**, but products need both | (a) add `GET/POST/PATCH /admin/colours[/:id]` and `/admin/size-charts[/:id]` (O M C, permission `products.editContent`); (b) seed only, with no admin editing in release one | **(a)**, by amending `api-specification.md` §4 |
| Q8-4 | **Catalogue editors and variant creation.** `POST /admin/products/:id/variants` is O M C, but price fields are O M only, and every variant needs a price (`product_variant_price_check`, `NOT NULL`) | (a) creating a variant needs `products.editPrices` (O M); C edits only non-price fields (SKU, active flag); (b) C may create a variant whose price is copied from a sibling variant; (c) give C price rights (changes `security-design.md` §4) | **(a).** It keeps the approved permission table unchanged. Amend the API spec row to "POST: O M · PATCH: O M C (price: O M)" |
| Q8-5 | D-084: what is "cached for 60 seconds"? | (a) `Cache-Control: public, max-age=60` on anonymous public catalogue `GET`s only, with no server-side cache; (b) an in-process cache invalidated on publish | **(a).** No new code path or dependency. Availability can be up to 60 s stale, which is acceptable because cart and checkout re-check stock (SR-2 in `system-design.md` §2; Phases 9, 11 and 15). Admin responses stay `no-store` |
| Q8-6 | D-083: how is "publish date is set" met, and what if a variant is deactivated after publishing? | Publish sets `published_at` to now when it is empty, and keeps it on re-publish; no scheduled (future) publishing; public queries also require at least one active variant | As stated. Scheduling is not in `project-requirements.md` |
| Q8-7 | A new variant has no `inventory_level` row, and stock is Phase 9 | (a) create the row with `on_hand = 0` in the same transaction as the variant, so it shows `SOLD_OUT` until Phase 9 adds stock; (b) treat a missing row as `SOLD_OUT` | **(a).** One row per variant always exists, which Phase 9 relies on. The development seed already creates rows |
| Q8-8 | Product **labels** "from an allow-list" (`database-design.md` §3.1): the list is not defined anywhere. The spec example shows `NEW` | Define the release-one list now, or ship with an empty list | **Resolved: `NEW` only** in release one. "Bestseller" or "Trending" need real data (`project-requirements.md`, BR-14) |
| Q8-9 | D-080: the development image server | (a) a small script on Node's built-in `node:http`, read-only, serving the public derivatives folder on its own loopback port; (b) a static-server package | **(a).** No dependency |
| Q8-11 | **AVIF encode time** (found by the compatibility test, §10a): AVIF at 2048 px takes about 7 s on Linux with sharp's default of one libvips thread, and up to about 65 s on a worst-case image | (a) wait for processing, with a set thread count (for example 4) and AVIF effort 2 to 3; (b) save the master and WebP during the request, and make AVIF afterwards in the background; (c) drop AVIF and keep WebP only | **Resolved: (a)**, synchronous, with a fixed thread count (4), AVIF effort 3 and one upload at a time, subject to the performance retest (§10b, passed) |
| Q8-10 | Product `description` is "structured rich text" (jsonb), but no shared schema exists yet. Phase 10 pages use the same idea | (a) define a minimal shared rich-text Zod schema now (paragraphs, lists, bold and italic, links to internal paths); Phase 10 extends it; (b) plain text for products | **(a)**, kept minimal. No HTML is stored or rendered |

**Resolutions:**
- **Q8-1 (a):** a `tsvector` column plus trigram indexes, with the `simple` configuration.
- **Q8-2 (a):** `remaining` only with `LOW_STOCK`, at or below the threshold.
- **Q8-3 (a):** admin routes for colours and size charts.
- **Q8-4 (a):** creating a variant is O M only.
- **Q8-5 (a):** `Cache-Control` headers, with no server-side cache.
- **Q8-6:** as stated.
- **Q8-7 (a):** an inventory row is created with each variant.
- **Q8-8:** `NEW` only.
- **Q8-9 (a):** a development image server on `node:http`.
- **Q8-10 (a):** a minimal shared rich-text schema.
- **Q8-11 (a):** synchronous processing, 4 threads, effort 3, one upload at a time.

## 5. Design

### 5.1 Modules (`apps/api/src/modules/`)
- **`catalogue`:** admin routers (categories, collections, products, variants, images; colours and size charts if Q8-3 (a)); public routers (`/catalogue/*`); publishing rules (D-083); availability mapping (D-082).
- **`media`:**
  - `POST /admin/media` and `GET /admin/media`;
  - the image pipeline: magic bytes, then sharp metadata, then the dimension cap, then re-encoding into derivatives;
  - a `MediaStorage` interface with a local-disk implementation.
- **`search`:**
  - `GET /search` and `GET /search/suggest`;
  - raw SQL only through `Prisma.sql` tagged templates (`security-design.md` §3);
  - it reads catalogue tables and owns the search indexes (`system-architecture.md` §3).
- **`packages/shared`:**
  - Zod request and response contracts for these routes;
  - the rich-text schema (Q8-10);
  - the label allow-list (Q8-8).

### 5.2 Endpoints and permissions

Permission names are those in `apps/api/src/modules/auth/permissions.ts`, which mirrors `security-design.md` §4.

| Route | Permission |
|-------|------------|
| `GET /admin/products`, `GET /admin/products/:id`, variant `GET`s | `products.view` (O M C F) |
| `POST /admin/products`, `PATCH /admin/products/:id` (non-price fields), categories, collections, `PUT /admin/collections/:id/products`, product images | `products.editContent` (O M C) |
| Any request body containing `pricePaise` or `compareAtPricePaise`; variant creation if Q8-4 (a) | `products.editPrices` (O M); otherwise `403 FORBIDDEN` with no partial write |
| `POST /admin/products/:id/publish`, `/archive` | `products.publish` (O M C) |
| `POST /admin/media`, `GET /admin/media` | `products.editContent` (O M C), matching the API spec |
| Public `/catalogue/*`, `/search`, `/search/suggest` | none; returns published data only |

- **Field-level price check:** the price permission is checked from the parsed body, before any write, so a catalogue editor's mixed request is refused whole.
- **Stand-in routes:** the Phase 7 role-matrix test uses stand-ins for the product rows. These are switched to the real routes.
- **Deletes:**
  - `DELETE` of a category with products, or a collection still referenced, returns `409 CONFLICT`; archiving is the normal path;
  - media in use cannot be deleted. There is no media delete route in the spec, and none is added.

### 5.3 Validation
- Zod on every body, query and params; unknown fields rejected; string lengths bounded (`security-design.md` §3).
- **Slugs:** lowercase `a-z0-9` and hyphens, at most 100 characters, unique. They cannot change once `published_at` has been set (D-083).
- **Money:** integer paise from the shared money schemas; `0 < price ≤ 2,147,483,647`; compare-at price greater than the price. The database CHECKs remain the last guard.
- **Variants:** unique (product, colour, size), checked in the API (`409 CONFLICT`) and by the database; sizes only from the six approved rows (D-029).
- **Public listing query:**
  - `limit` 1 to 48, default 24;
  - `cursor` is an opaque, signed or encoded key; a bad cursor gives `400 VALIDATION_FAILED`;
  - `priceMin ≤ priceMax`;
  - `size[]` and `colour[]` by slug, each at most 20 values.
- **Search:** `q` trimmed, 2 to 100 characters, special characters handled through `websearch_to_tsquery` or `plainto_tsquery`, never string-built SQL.

### 5.4 Media pipeline (D-077 to D-080)
1. **Route rules:** admin session, CSRF, the permission check and the `Content-Type` check (`image/jpeg`, `image/png` or `image/webp`). Then admission capacity is reserved **before any body byte is read** (§5.7.1). Only after admission, once the job is active, a **streaming reader** reads the body with backpressure and a strict 15 MB limit. No body-parsing middleware buffers the body before admission, and no full body is buffered while a job waits. The global `requireJson` and `jsonBody` middleware must skip this one route; every other route keeps `415` and the 100 KB limit.
2. **Type checks:**
   - Magic bytes: JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF....WEBP`.
   - They must agree with `Content-Type` and with `sharp().metadata().format`, otherwise `415`.
3. **Size limits:**
   - sharp's `limitInputPixels` is set to 8000 × 8000;
   - width or height over 8000 gives `400 VALIDATION_FAILED`;
   - animated or multi-page input is refused.
4. **Re-encoding:**
   - Auto-orient, then re-encode the original as a private master. This strips EXIF, GPS, XMP and other metadata, and converts colour to sRGB.
   - Write AVIF and WebP at 480, 960, 1440 and 2048 px wide, never upscaled.
   - Each derivative's key, width, height and bytes go into `media_asset.variants`.
5. **Storage:**
   - Random keys (`newToken`-style, never the original filename).
   - The original filename is stored only as metadata, after sanitising.
   - A failed processing step leaves no files and no row behind.
6. **Concurrency (Q8-11):**
   - `sharp.concurrency(4)` is set explicitly at start-up and never derived from the CPU count;
   - AVIF quality 50, effort 3; WebP quality 80;
   - one upload is processed at a time per API process; the others wait in a bounded queue, and a full queue returns `429 UPLOAD_QUEUE_FULL` (D-088, §5.7);
   - approved on 2026-10-21 (QP-1 to QP-7, T-1 to T-7): two waiting by default (`MEDIA_UPLOAD_QUEUE_WAITING`, range 0 to 4), a 30 s queue-wait deadline, a 60 s total deadline from admission, and `503` for both timeouts (§5.7).

### 5.5 Search (D-081, Q8-1)
- `product.search_vector tsvector` is set by a trigger function from:
  - weight A: name;
  - weight B: category name, collection names and colour names;
  - weight C: short description and description text.
- Triggers on `product`, `category`, `collection`, `collection_product` and `product_variant` (colour links), and on `colour` name changes, recompute the affected products.
- Indexes:
  - `GIN(search_vector)`;
  - `GIN(name gin_trgm_ops)` on `product`, for typo tolerance and suggestions;
  - the same on `category.name` for category suggestions.
- `/search/suggest` returns up to 6 results (API spec §3): trigram similarity on product and category names, published items only.
- Facets (size, colour, category, price bands) are computed from published products with active variants (`system-design.md` §8).

### 5.6 Approved safeguards (2026-10-19)
1. **Private originals, public derivatives only, no path traversal.**
   - Originals are stored privately and are never returned by any API response or URL.
   - Public responses carry only derivative URLs under `MEDIA_PUBLIC_BASE_URL`.
   - The development image server (Q8-9) serves only the derivatives folder. It refuses `..`, encoded separators and absolute paths, checks that every resolved path stays inside that folder, and never lists folders.
2. **Safe rich-text links.**
   - The shared rich-text schema (Q8-10) allows only internal links: relative paths that start with `/`, from an allowed set of path patterns.
   - It rejects every scheme (`javascript:`, `data:`, `vbscript:`, `http:`, `https:` and others), protocol-relative `//` links, backslashes and control characters.
   - No HTML is accepted, stored or rendered.
3. **Search-trigger correctness tests.** Database tests prove that the search vector stays correct after:
   - a product update;
   - a category rename;
   - a collection rename and membership change;
   - a variant colour change;
   - a colour rename.

   They include shared entities used by several products: every affected product changes and no other product does.

### 5.7 Upload queue and memory policy (D-088; QP-1 to QP-7 and T-1 to T-7 approved 2026-10-21; not implemented)

**Status:**
- The policy is approved in principle (D-088).
- The values QP-1 to QP-7 below, and T-1 to T-7 (§5.7.7), were proposed and recorded on 2026-10-21 and **formally approved on 2026-10-21**. The capacity maximum was approved separately the same day: `MEDIA_UPLOAD_QUEUE_WAITING` whole numbers 0 to 4 inclusive, default 2.
- The contract choices under "Confirmed contract inputs" below were first recorded as a clarification and are part of that approval. Approval of the contract authorises no implementation, migration or test.
- Nothing in this section has been built or tested. The `sharp` timeout test (T-4) has not been run.

**Approved in principle (D-088):**
1. **One upload at a time:** one image upload is actively processed at a time per API process.
2. **Bounded queue:** waiting uploads go into a queue with a bounded, configurable capacity.
3. **Full queue:** a new upload is rejected with HTTP `429` and a documented error code. Nothing is stored for it.
4. **Bounded memory:** memory used by queued requests is bounded.
5. **Cancellation and timeouts:** an abandoned request must not hold a queue slot indefinitely.
6. **Fixed thread count:** the libvips thread count is fixed explicitly (`sharp.concurrency(4)`, Q8-11), never derived from the CPU count Node reports. In the CPU-limited test container, Node reported 16 CPUs for 4 (§10b).

**Approved values (2026-10-21):**

| # | Policy |
|---|--------|
| QP-1 | **Capacity:** one active upload and at most two waiting uploads per API process (the default of `MEDIA_UPLOAD_QUEUE_WAITING`, T-5). A further upload is rejected at once (QP-3) |
| QP-2 | **Body handling:** reserve admission capacity before reading the body; stream the request with a strict 15 MB limit; apply backpressure; never buffer complete image bodies for waiting requests (§5.7.1) |
| QP-3 | **Full queue:** HTTP `429` with the stable error code `UPLOAD_QUEUE_FULL` (§5.7.3) |
| QP-4 | **Queue wait deadline:** 30 seconds from admission as a waiting job (§5.7.1) |
| QP-5 | **Total job deadline:** 60 seconds **from admission**, covering queue wait, receiving the body and processing (decoding and derivative generation). As clarified by T-3 on 2026-10-21: an absolute deadline, not an extra 60 seconds after waiting (§5.7.2) |
| QP-6 | **Client disconnect:** waiting jobs are removed at once; active work is aborted where that can be done safely; cleanup is guaranteed (§5.7.1, §5.7.2) |
| QP-7 | **Monitoring:** structured logs and basic counters (§5.7.4) |

**Confirmed contract inputs (2026-10-21; approved with QP-1 to QP-7):**

| Item | Confirmed choice |
|------|------------------|
| T-1 Queue-wait timeout | HTTP `503`, code `UPLOAD_QUEUE_TIMEOUT` |
| T-2 Processing or job timeout | HTTP `503`, code `UPLOAD_PROCESSING_TIMEOUT` |
| T-3 Total deadline | 60 s from admission, covering queue wait, body reception and processing |
| T-4 `sharp` timeout test | Stays a **planned prerequisite**; not run; needs separate authorisation |
| T-5 Waiting capacity | Environment variable `MEDIA_UPLOAD_QUEUE_WAITING`, default `2`, approved range whole numbers 0 to 4 inclusive (per API process), validated at start-up |
| T-6 Monitoring | Structured logs and basic in-process counters |
| T-7 Body size | Declared `Content-Length` over 15 MB refused before reading; the same limit enforced while streaming when there is no `Content-Length` or the body is chunked |
| `415` messages | Per-route messages; status and code unchanged (§5.7.3) |
| `Retry-After` and `RateLimit` headers | Kept for `RATE_LIMITED`; neither sent with `UPLOAD_QUEUE_FULL` |
| Client disconnect | Timeout responses are sent only while the client is still connected |
| Processing timeout | The upload is not saved; late output is discarded; no media record is written |
| Server timeout | Node's existing 300 s request timeout is documented separately and not changed |

#### 5.7.1 Admission and streaming
1. **Before admission (no capacity used):**
   - the existing checks run: admin session, CSRF, permission `products.editContent`, allowed `Content-Type`;
   - a declared `Content-Length` over 15 MB is refused with `413` before any body byte is read.
2. **Admission:**
   - **admission** is the moment a request reserves capacity, as the active job or as a waiting job. The **60-second total deadline (QP-5, T-3) starts at admission** and is never restarted;
   - if the active slot is free, the request becomes the active job at once;
   - otherwise, if fewer jobs are waiting than `MEDIA_UPLOAD_QUEUE_WAITING` allows (default 2), it reserves a waiting slot and becomes an **admitted waiting job**. The 30-second queue-wait timer (QP-4) also starts at that moment;
   - otherwise, it is rejected at once with `429 UPLOAD_QUEUE_FULL`, with no `Retry-After` or `RateLimit` header. Its body is not read, and the connection is closed after the response, so the server never reads an unwanted 15 MB body. This `429` comes from the upload queue, not from the rate-limit middleware;
   - if the configured waiting capacity is `0` (allowed by the approved range 0 to 4), there are no waiting slots, and every upload that arrives while one is active gets `429 UPLOAD_QUEUE_FULL`.
3. **While waiting:**
   - the request stream stays paused, so TCP backpressure stops the client sending;
   - no body bytes are held beyond the socket's own small buffers, so waiting jobs never hold image bodies;
   - waiting jobs are served in arrival order.
4. **Activation:**
   - when the active slot frees, the oldest waiting job becomes active and its queue-wait timer stops;
   - the 60-second total deadline keeps running from admission. **The job does not get a fresh 60 seconds:** one that waited close to 30 s has about 30 s left to receive its body and be processed;
   - a waiting job that reaches 30 s is removed from the queue and gets `503 UPLOAD_QUEUE_TIMEOUT` if its client is still connected;
   - the body is then streamed with backpressure, and a byte counter aborts at 15 MB plus 1 byte (`413`) whether or not `Content-Length` was sent, including chunked bodies (T-7). If the server ends the connection mid-stream, a client may see a connection reset instead of a clean `413`; the expected behaviour is tested;
   - the upload route never passes through the JSON body middleware (`requireJson`, `jsonBody`);
   - at most one image body (up to 15 MB) is held per process, for the active job.
5. **Release:**
   - every exit path releases its reservation exactly once: success, rejection, `413`, `415`, validation failure, disconnect, queue timeout, processing timeout and unexpected error;
   - a disconnect while waiting removes the job from the queue at once (QP-6);
   - tests assert that the counts of active and waiting jobs return to zero after each path.
6. **Server timeouts (unchanged):**
   - the API sets no server timeouts today (`main.ts`), so Node's defaults apply: `requestTimeout` 300 s and `headersTimeout` 60 s;
   - the 300 s request timeout is separate from, and longer than, the 30 s queue-wait deadline and the 60 s total deadline, so it does not cut uploads short;
   - this plan changes no server timeout setting.

#### 5.7.2 Processing deadline and native work
1. **Deadline:** 60 s is the absolute deadline for one admitted job, counted from admission. It covers queue wait, body reception and processing (QP-5, T-3).
2. **A JavaScript timer is not enough:**
   - a JavaScript timeout alone does not prove that native `sharp`/libvips work has stopped;
   - `sharp`'s `timeout({ seconds })` asks libvips to stop at its progress checks;
   - whether the AVIF encoder (libheif with aom) honours that during a single frame encode has **not been verified**.
3. **On the deadline:**
   - if the client is still connected and a response can still be written, it gets `503 UPLOAD_PROCESSING_TIMEOUT` at once; otherwise no response is attempted;
   - **the upload is not saved:** any output produced after the deadline is discarded, and no media record is written;
   - the response does not claim that processing has stopped;
   - **the active slot is not released, and no other memory-intensive job starts,** until the underlying processing has actually stopped (every `sharp` promise settled) or has been safely isolated (T-4).
   - Only then are the temporary files removed and the slot released.
4. **No accumulation:** because the slot stays held, there is at most one timed-out job per process, and timed-out jobs cannot pile up. Waiting jobs keep their own 30-second deadline meanwhile.
5. **Cleanup:**
   - each job writes into its own temporary folder, which is removed on every failure and timeout path;
   - a start-up sweep removes temporary folders left by a crash.
6. **Limitation, recorded as a risk (§11):** if native work does not stop, uploads in that process stall until it does. The safe design must be chosen before implementation (T-4):
   - (a) **in process:** `sharp`'s timeout plus a watchdog that marks the upload service unavailable and logs an error after a hard ceiling;
   - (b) **in a child process:** processing runs in a child process (Node's built-in `node:child_process`, no new dependency), which is killed at the deadline. This guarantees the native work stops and its memory is returned, at the cost of process start-up time and passing up to 15 MB between processes.

   **Recommended:** first test whether AVIF encoding stops under `sharp`'s timeout. Use (a) only if it does, otherwise (b).

#### 5.7.3 Error contract
- **Full queue:** `429` with code `UPLOAD_QUEUE_FULL`, in the standard error shape (`api-specification.md` §2), and nothing stored.
- **No `Retry-After` or `RateLimit` header** on `UPLOAD_QUEUE_FULL`: no reliable basis for a value exists, because the wait depends on the jobs ahead, each up to 60 s. `RATE_LIMITED` keeps both headers, sent by the existing rate-limit middleware (express-rate-limit, draft-8 headers); that behaviour is unchanged.
- **Queue-wait timeout (T-1):** `503 UPLOAD_QUEUE_TIMEOUT`.
- **Processing or job timeout (T-2):** `503 UPLOAD_PROCESSING_TIMEOUT`. The upload is not saved.
- **Error shape:** both codes use the standard error shape `{ error: { code, message, details?, requestId } }` (`api-specification.md` §2). The error registry (`API_ERROR_CODES` in `apps/api/src/platform/http/errors.ts`) keeps mapping each code to exactly one status; the two codes are added there when implementation is authorised.
- **Sending a response:**
  - a timeout response is sent only while the client is still connected and a response can safely be written (headers not yet sent);
  - when the body has not been fully read, the connection is closed after the response rather than reused;
  - if the client has gone, only the cleanup runs.
- **Disconnect:** no response is possible; the outcome is logged.
- **`415` messages, per route (to be implemented; not implemented yet):**
  - `415 UNSUPPORTED_MEDIA_TYPE` keeps its status and code;
  - JSON routes keep the JSON-specific message ("Send the request body as application/json.");
  - the media upload route returns an image-specific message;
  - the error shape and `requestId` are unchanged.

  Today the registry holds one fixed message per code, so a per-route message must be reconciled with that mapping when API implementation is authorised. No new error code is introduced and the error shape does not change.

#### 5.7.4 Monitoring (QP-7)
- **Counters, per process:**
  - active uploads (0 or 1);
  - queue depth (0 to the configured waiting capacity, default 2);
  - queue-full rejections;
  - queue-wait timeouts (`UPLOAD_QUEUE_TIMEOUT`);
  - processing timeouts (`UPLOAD_PROCESSING_TIMEOUT`);
  - processing failures.
- **Structured log events** (existing `pino` logger and redaction) for admission, activation, completion and each failure kind. Allowed fields:
  - request ID;
  - outcome;
  - wait time and processing time;
  - byte count;
  - image width, height and format;
  - media asset ID on success.
- **Never logged:**
  - image contents;
  - authentication secrets (cookies, CSRF tokens, session data);
  - the original filename;
  - any other sensitive request data.
- Where the counters are read from is open (T-6). The health endpoint stays free of internal details (P5-AC8).

#### 5.7.5 Deployment topology
- The active and waiting limits apply **per API process**.
- With N processes or replicas, the totals grow:
  - up to N active and N × `MEDIA_UPLOAD_QUEUE_WAITING` waiting uploads across the deployment (2N by default);
  - memory for N active jobs at once.
- Shared admission control across processes is **out of scope** for Phase 8. It must be reconsidered if the deployment topology changes, in the same way as the in-memory rate limits (D-047, Phase 19).

#### 5.7.6 AVIF settings and memory (unchanged)
- **Approved settings, unchanged (Q8-11):**
  - libvips threads fixed at 4;
  - AVIF effort 3;
  - one active image-processing job per API process;
  - synchronous AVIF generation.
- **Prior test observations (§10b, 2026-10-20; not guaranteed production performance):**
  - photo-like uploads took about 1.6 to 2.2 s for the whole upload;
  - the worst case, a 2048 × 8000 noise image, took 12.2 s on Windows and 17.5 s on Linux;
  - the 8000 × 8000 case peaked at about **1.6 GiB in the 2 GB test container** (Linux, 4 CPUs), against 0.66 GiB on Windows, so one active upload can use most of a 2 GB container;
  - the libvips thread count must be fixed, because Node reported 16 CPUs in a container limited to 4.
- **The deadline is tight:** with 60 s from admission, a job that waited close to 30 s has about 30 s for body reception and processing. A slow admin connection uploading up to 15 MB could exhaust it (risk, §11).
- **What the queue does not cover:** it bounds the memory of *waiting* requests, not of the active job. It does not make every accepted image safe under every container memory limit. Memory pressure remains a risk (§11), to be tested and monitored. The memory per API container is decided with Phase 19 hosting.

#### 5.7.7 Technical points T-1 to T-7 (approved 2026-10-21)

| # | Point | Confirmed choice | Still open |
|---|-------|------------------|------------|
| T-1 | Response when a waiting job reaches 30 s | `503 UPLOAD_QUEUE_TIMEOUT`, only if the client is still connected | — |
| T-2 | Response when a job reaches its 60 s deadline | `503 UPLOAD_PROCESSING_TIMEOUT`, only if the client is still connected; upload not saved, late output discarded | — |
| T-3 | When the 60 s deadline starts | At admission. It covers queue wait, body reception and processing, and is absolute | — |
| T-4 | How native work is stopped or isolated | Planned prerequisite: test `sharp`'s timeout in isolation. If native work cannot be reliably stopped, use a killable child process or another explicitly reviewed isolation mechanism. The active slot stays occupied until native work has ended or been safely terminated | **The test has not been run;** it needs separate authorisation |
| T-5 | Waiting capacity configuration | `MEDIA_UPLOAD_QUEUE_WAITING`, default `2`, validated at start-up; accepts only whole numbers 0 to 4 inclusive; `0` means no waiting slots | — (range approved 2026-10-21) |
| T-6 | Monitoring | Structured logs and basic in-process counters (§5.7.4) | Where counters are exposed beyond logs: decided with Phase 19 monitoring |
| T-7 | Bodies without `Content-Length` or chunked | Accepted; the 15 MB limit is enforced while streaming; a declared size over 15 MB is refused before reading. Both cases are tested in the authorised implementation phase | — |

## 6. Specification amendments (applied 2026-10-20)

Applied in `api-specification.md` §2, §4 and §6, `database-design.md` §1, §3.1, §4 and §6, `system-design.md` §8 and §10, and `.env.example`.

| Document | Change |
|----------|--------|
| `api-specification.md` §4 | `POST /admin/media` takes a raw image body, not multipart (D-079). Colour and size-chart routes (Q8-3). Variant create roles (Q8-4) |
| `api-specification.md` §2 | `413 PAYLOAD_TOO_LARGE` also covers uploads over 15 MB; `415 UNSUPPORTED_MEDIA_TYPE` also covers image types that are not allowed |
| `api-specification.md` §6 | `remaining` wording confirmed (Q8-2) |
| `database-design.md` §3.1, §4 | Search column, triggers and indexes as built (Q8-1) |
| `system-design.md` §10 | Development storage and image server (D-080, Q8-9) |
| `.env.example` | New names only, no values: `MEDIA_STORAGE_DIR`, `MEDIA_PUBLIC_BASE_URL` |

## 7. Migration (not written; needs authorisation for step 4, then stop for review)

Proposed name `<timestamp>_catalogue_search`, generated with `prisma migrate diff` plus handwritten SQL:
- `CREATE EXTENSION IF NOT EXISTS "pg_trgm";`
- `product.search_vector` (`Unsupported("tsvector")` in Prisma), `NOT NULL DEFAULT ''`, backfilled in the migration;
- the trigger function or functions and their triggers (§5.5);
- the GIN indexes (§5.5).
- **Upkeep:**
  - `apps/api/src/db/handwritten.ts` gains the extension, functions and triggers;
  - `schema.test.ts` currently asserts that no migration contains `search_vector`, `tsvector` or `pg_trgm` (D-054). That assertion is narrowed to the Phase 6 migration, and a Phase 8 assertion is added;
  - drift checks must stay clean with the `Unsupported` column.
- Validated only on disposable PostgreSQL 18.6 databases, as in Phases 6 and 7.

## 8. Dependencies

| Package | Where | Version | Why |
|---------|-------|---------|-----|
| `sharp` | `@sanea/api`, runtime | `0.35.5`, exact | D-077; already planned in `system-architecture.md` §7. **Added 2026-10-20** on `phase-8-catalogue` |

Nothing else:
- no `multer` or `busboy` (D-079);
- no `file-type` (D-078);
- no static server (Q8-9);
- no search engine (D-110);
- no cloud SDK (D-080).

`sharp` brings prebuilt `libvips` binaries per platform. The compatibility test (§10, step 2) checks that before the repository is touched.

## 9. Tests

- **Unit (no database):**
  - magic-byte detection (valid, truncated, spoofed extension, polyglot header);
  - Zod contracts (slug, money, query limits, unknown fields);
  - cursor encoding (round trip, tampered cursor);
  - availability mapping, including the threshold edge (D-082, Q8-2);
  - publishing-rule evaluation (D-083).
- **Media (fixtures generated in the test, nothing committed that contains real photos):**
  - JPEG, PNG and WebP accepted;
  - GIF, SVG, HEIC and a renamed text file refused;
  - an image over 8000 px refused, and the pixel-bomb header refused without decoding;
  - EXIF and GPS absent from every output;
  - derivative widths correct and never upscaled;
  - a 15 MB plus 1 byte body gets `413`;
  - a JSON body to the upload route gets `415`;
  - no files left after a failed upload.
- **Database and API (`*.db-test.ts`, cloned template):**
  - the role matrix on every new route for all four roles, including a catalogue editor sending price fields (`403`, no write);
  - CSRF required on every write;
  - every write produces an audit row with before and after;
  - publishing rules: unpublished category, no active variant, no primary image, and the slug lock;
  - drafts and archived products never appear publicly;
  - filters and facets: size, colour, category, price range, `inStock`;
  - sort orders and cursor paging with no duplicates or gaps across pages;
  - search: name, category, collection and colour terms, a typo ("anarkalli"), suggestions capped at 6, published only;
  - search rate limit `429` after 60/min;
  - triggers: renaming a colour or category updates search results;
  - `Cache-Control` on public responses and `no-store` on admin responses.
- **Safeguard tests (§5.6):**
  - the development image server refuses traversal (`..`, `%2e%2e`, `%2f`, `%5c`, absolute paths) and requests for originals;
  - the rich-text schema rejects `javascript:`, `data:`, `vbscript:`, `http(s):`, `//host`, backslashes, control characters and HTML;
  - search-trigger tests for every case in §5.6 item 3, including shared entities.
- **Upload queue tests (§5.7, in the separately authorised implementation phase):**
  - with the default capacity, a fourth concurrent upload gets `429 UPLOAD_QUEUE_FULL` without its body being read, and without `Retry-After` or `RateLimit` headers;
  - `RATE_LIMITED` responses still carry both headers;
  - waiting requests hold no body;
  - the 15 MB limit holds for a declared oversize `Content-Length` and for an oversize chunked body; what the client sees when the connection is cut mid-stream is checked;
  - a waiting job that disconnects leaves the queue at once; one that waits 30 s gets `503 UPLOAD_QUEUE_TIMEOUT`;
  - the 60 s deadline runs from admission: a job that waited is not given a fresh 60 s; at the deadline the client gets `503 UPLOAD_PROCESSING_TIMEOUT`, no media record is written, and late output is discarded;
  - **the 60 s absolute deadline expires during request-body reception** (for example, a slow sender after a queue wait): `503 UPLOAD_PROCESSING_TIMEOUT` to a connected client, the partial body is discarded, nothing is saved, and the slot is released exactly once;
  - **the 60 s absolute deadline expires during image processing:** `503 UPLOAD_PROCESSING_TIMEOUT` to a connected client; the active slot stays occupied until native work has stopped or been safely terminated; late output is discarded and no media record is written;
  - no response is written to a client that has disconnected;
  - the media route returns its own `415` message, and JSON routes keep theirs;
  - `MEDIA_UPLOAD_QUEUE_WAITING` is validated at start-up: 0 to 4 accepted; negative, fractional, non-numeric and values over 4 refused; with `0`, a second upload during an active one gets `429 UPLOAD_QUEUE_FULL`;
  - the deadline holds the slot until native work has settled, then cleans up;
  - reservations return to zero after every path;
  - the counters and log fields are correct, with no secrets or image data.
- **Catalogue checks:** the new extension, functions, triggers and indexes exist in the live catalogue (as `catalog.db-test.ts` does).
- **CI:** existing jobs only, with `sharp` installed by `npm ci` on Linux.

## 10. Sequence and stop points

| Step | Work | Needs your approval |
|------|------|---------------------|
| 1 | Decide D-077 to D-084 and Q8-1 to Q8-10 | **Done: approved in principle** |
| 2 | Compatibility test of `sharp` 0.35.5 in a throwaway folder outside the repository: install on Windows and in a Linux container (`node:24.11.0-bookworm-slim`), AVIF encode time at 2048 px, metadata stripping, the pixel cap. Results recorded here | **Done: passed** (§10a) |
| 3 | Decide Q8-11. Branch `phase-8-catalogue` from `main` `6593082`; add `sharp` 0.35.5 exactly; apply the §6 specification amendments; retest AVIF (§10b) | **Done** (2026-10-20), uncommitted |
| 4 | Write the migration and validate it on disposable databases. **Stop for review** | **Yes (next gate):** authorisation to write the migration, then its approval |
| 4a | **Gate:** decide and document the maximum for `MEDIA_UPLOAD_QUEUE_WAITING` | **Done** (2026-10-21): whole numbers 0 to 4 inclusive, default 2 |
| 4b | **Gate:** final review and formal approval of QP-1 to QP-7 and T-1 to T-7 (§5.7) | **Done** (2026-10-21): approved |
| 4c | **Gate (pending):** separately authorise and run the T-4 `sharp` timeout test (disposable location, synthetic images); record its result in this plan; decide and record the native-work approach (in process or a killable child process, §5.7.2) | **Yes:** authorisation to run the test, then approval of the approach |
| 5 | Build the modules and tests, only after steps 4a to 4c are complete; run every local check | Yes: separate authorisation for API modules |
| 6 | Commit, push, open a draft PR into `main` | Yes, each action |
| 7 | Phase 8 UI plan addendum (tokens, admin shell, catalogue screens) | Yes, separately |
| 8 | Phase 8 gate: backend and UI evidence | Yes |

## 10a. Compatibility test results (step 2, 2026-10-19)

**Result: pass, 31 of 31 checks on each platform.** `sharp` 0.35.5 is suitable for repository integration, subject to Q8-11.

- **Where it ran:** a disposable folder in the session scratchpad, outside the repository and outside any git repository. On Linux, it ran in a disposable container with nothing mounted: the script went in through stdin, and the container was removed afterwards.
- **Fixtures:** synthetic images only, with no photographs.
- **Repository:** unchanged, including `package.json`, `package-lock.json` and `node_modules`.

| | Windows | Linux |
|---|---|---|
| Environment | Windows 11 10.0.26200 x64, 16 × i5-1240P; Node 24.11.0, npm 11.1.0 | `node:24.11.0-bookworm-slim` `sha256:76d0ed0ed93bed4f4376211e9d8fddac4d8b3fbdb54cc45955696001a3c91152`; Debian 12.12, glibc 2.36, WSL2 kernel 5.15; Node 24.11.0, npm 11.6.1 |
| Binary loaded | `@img/sharp-win32-x64` (libvips 8.18.7), confirmed in the process's loaded libraries | `@img/sharp-linux-x64` (libvips 8.18.7) |
| `npm audit` | 0 vulnerabilities | 0 vulnerabilities |
| JPEG, PNG, WebP → master plus AVIF and WebP at 480/960/1440/2048; formats confirmed by decoding | Pass | Pass |
| No upscaling (a 1000 px source stays at 1000 px) | Pass | Pass |
| EXIF (including the GPS IFD), XMP and marker strings absent from all 27 outputs | Pass | Pass |
| EXIF orientation applied | Pass | Pass |
| 8000 × 8000 accepted; 8001 × 100 and 8001 × 8000 refused | Pass (1.3 s at 8000²) | Pass (2.2 s) |
| 225-byte PNG claiming 50000 × 50000 refused from its header, no memory growth | Pass | Pass |
| Truncated JPEG/PNG/WebP, header only, random bytes, empty, text renamed `.jpg` | Refused | Refused |
| SVG, GIF, AVIF/HEIF input and animated WebP refused by the allow-list | Pass | Pass |
| No partial output after any failure (temporary folder, then rename) | Pass | Pass |
| AVIF / WebP at 2048 px, median of 5, photo-like 3000 × 4000 source | 1.1 s / 0.54 s | **7.3 s** / 0.52 s |
| Peak memory, whole run | 468 MiB | 854 MiB |

**AVIF and threads** (worst-case pure-noise source, 2048 px, median of 3):

| libvips threads | Windows | Linux |
|---|---|---|
| 1 (the sharp default on glibc Linux) | 46.3 s | 65.7 s |
| 2 | 23.6 s | 34.4 s |
| 16 | 7.4 s | 10.4 s (841 MiB) |
| 1 thread, effort 2 / effort 3 | 3.5 s / 6.3 s | 4.4 s / 8.2 s |

**Findings carried into implementation:**
1. **AVIF on Linux is slow at the defaults:** one upload can take tens of seconds. See Q8-11.
2. **sharp also decodes SVG, GIF, TIFF and HEIF.** The format allow-list and dimension check must run on the header before any decoding; the test confirms this order works.
3. **sharp's error messages name internal libraries.** The API maps them to generic `400` or `415` responses.
4. **npm also installs `@img/sharp-wasm32`** on both platforms (marked extraneous, never loaded). Check `package-lock.json` and `npm ci` in CI at step 3.
5. **Limits of the test:**
   - the Linux timings come from WSL2 on a laptop, not production hardware;
   - the test covers sharp's behaviour only. HTTP limits, magic-byte checks, authorisation and the upload concurrency limit are verified during implementation.

Test files are kept outside the repository and are not committed.

## 10b. AVIF retest at the chosen settings (Q8-11, 2026-10-20)

- **Settings:**
  - libvips threads fixed at 4 (`sharp.concurrency(4)`);
  - AVIF quality 50, effort 3; WebP quality 80;
  - one upload processed at a time;
  - `sharp` cache off, so every upload is measured cold.
- **Pipeline:** the full synchronous upload: header checks, auto-orient, master, then AVIF and WebP at 480, 960, 1440 and 2048 px.
- **Fixtures:** synthetic images, each with a fake EXIF block, run 3 times; medians shown.
- **Environment:** the same disposable folder and container as §10a. The Linux container was limited to 4 CPUs and 2 GB of memory.
- **Acceptance limits, set before measuring:** a representative upload takes at most 15 s on Linux, and the worst case at most 60 s, a common proxy timeout.

| Case (input) | AVIF 2048 output | Linux: AVIF 2048 / whole upload | Windows: AVIF 2048 / whole upload |
|---|---|---|---|
| Representative: photo-like 3000 × 4000 | 2048 × 2731, 38 KB | 0.40 s / 2.0 s | 0.32 s / 1.6 s |
| Representative: photo-like 4000 × 5000 | 2048 × 2560, 15 KB | 0.42 s / 2.2 s | 0.33 s / 1.8 s |
| Stress: pure noise 3000 × 4000 | 2048 × 2731, 1.1 MB | 2.1 s / 6.1 s | 1.7 s / 4.9 s |
| Worst case: pure noise 8000 × 8000 (largest area) | 2048 × 2048, 0.37 MB | 1.7 s / 8.4 s | 1.1 s / 5.8 s |
| Worst case: pure noise 2048 × 8000 (largest 2048-wide output) | 2048 × 8000, 4.2 MB | 5.5 s / **17.5 s** | 3.8 s / 12.2 s |

**Result: within both limits.** The worst observed upload took 17.5 s on Linux (runs 16.7 to 18.3 s), so the latency is acceptable for an admin-only upload.

Checks on both platforms:
- every output decoded as its stated format, at the right width, with no EXIF or XMP;
- a truncated JPEG was refused and left no files behind.

Peak memory:

| | Linux (2 GB limit) | Windows |
|---|---|---|
| Peak memory | **1.6 GiB** | 0.66 GiB |

**What this does not prove:**
- These are a WSL2 laptop and a CPU-limited container, not production hardware.
- Inside the container, Node reported 16 CPUs despite the 4-CPU limit. That is why the thread count must be set explicitly.
- Memory peaked close to the 2 GB limit on the 8000 × 8000 case. Production containers for the API need at least 2 GB, or uploads need their own memory headroom; this is decided with Phase 19 hosting.
- Retest in CI and on production-like hardware before launch (P8-AC11).

## 11. Risks

| Risk | Mitigation |
|------|------------|
| `sharp` native binaries fail on a platform (Windows dev, Linux CI or container) | Compatibility test passed on Windows and Linux (§10a); exact pin; CI on Linux |
| Slow AVIF encoding on Linux ties up the API (§10a) | Q8-11 settings retested: worst case 17.5 s (§10b); one upload at a time; thread count set explicitly; retest before launch |
| Image processing memory: 1.6 GiB peak for an 8000 × 8000 image in a 2 GB container (§10b) | One active job per process; waiting requests hold no body (QP-2); memory monitored (QP-7); memory per API container decided with Phase 19 hosting. The queue does not bound the active job's memory (§5.7.6). Not yet implemented |
| Queue saturation: many uploads at once fill the queue, or abandoned requests hold slots | One active and two waiting per process; `429 UPLOAD_QUEUE_FULL`; 30 s wait and 60 s processing deadlines; removal on disconnect; release on every path (§5.7.1); tests and counters. Limits are per process (§5.7.5). Not yet implemented |
| Native `sharp`/libvips work does not stop at the deadline | The slot is held until the work settles; at most one timed-out job per process; in-process versus child-process design (T-4, §5.7.2) decided before implementation. Not yet implemented |
| Slow processing holds the single slot (worst case 17.5 s, §10b) | 60 s total deadline from admission (QP-5); measured again in CI (P8-AC11); monitored (QP-7). Not yet implemented |
| Slow client connections exhaust the 60 s total deadline: a job that waited close to 30 s has about 30 s to receive up to 15 MB and be processed | Deadline exhaustion is counted and logged (`UPLOAD_PROCESSING_TIMEOUT`); measured during implementation; the deadline value is revisited only with your approval. Not yet implemented |
| Path traversal or exposure of originals through the image server | Safeguard 1 (§5.6) and its tests |
| Unsafe links in rich text (XSS through `javascript:` and similar) | Safeguard 2 (§5.6); no HTML rendered; tests |
| Decompression bombs or malformed images exhaust memory or CPU | `limitInputPixels`, the dimension cap before decoding, a body size limit, a concurrency limit |
| Metadata (GPS) leaks through derivatives | Re-encode everything; a test asserts that no EXIF or XMP remains |
| Search triggers drift silently (Prisma does not see them) | Listed in `handwritten.ts`; migration-SQL and live-catalogue tests |
| Trigger cost on bulk edits (for example renaming a colour used by many products) | Catalogue is small in release one; triggers update only affected rows; measured in tests |
| A catalogue editor changes prices through a mixed request | Field-level permission check before any write; test for each route |
| Public data leaks drafts, exact stock or the private original image | Published-only queries; availability mapping; only derivative URLs returned; tests |
| 60-second caching shows stale availability | Cart and checkout re-check (SR-2); public catalogue only |
| In-memory rate limit is per instance (D-047) | Unchanged single-instance assumption; a shared store is required before Phase 19 |

## 12. Acceptance criteria (backend half)

| ID | Criterion |
|----|-----------|
| P8-AC1 | Dependencies: only `sharp` 0.35.5 added, exact; `npm audit` 0 vulnerabilities |
| P8-AC2 | Migration validated on disposable databases only; both drift checks clean; every new handwritten object verified in the live catalogue |
| P8-AC3 | A product with colour × size variants and images can be created, published, and found by filter and by search (index verification) |
| P8-AC4 | Every new admin route enforces the `security-design.md` §4 table for all four roles, including the price-field rule |
| P8-AC5 | Upload safety: only JPEG, PNG and WebP; magic bytes; 15 MB; 8000 px; metadata stripped; derivatives at the four widths in AVIF and WebP; originals never public |
| P8-AC6 | Publishing rules (D-083) and availability mapping (D-082 as decided) tested; drafts never public |
| P8-AC7 | Every admin write audited with before and after values |
| P8-AC8 | Format, lint, typecheck, unit and integration suites pass locally and in CI on a draft PR; Gitleaks clean |
| P8-AC9 | Specifications amended as in §6 and consistent with the code |
| P8-AC10 | The three safeguards in §5.6 are implemented and tested |
| P8-AC11 | The AVIF settings (Q8-11) are retested in CI on Linux: a representative upload ≤ 15 s and the worst case ≤ 60 s, with the result recorded |
| P8-AC12 | Upload queue (D-088, with the QP values and T-1 to T-7 as finally approved): one active upload per process; the bounded queue (`MEDIA_UPLOAD_QUEUE_WAITING`) returns `429 UPLOAD_QUEUE_FULL` without `Retry-After` or `RateLimit` headers when full; `503 UPLOAD_QUEUE_TIMEOUT` and `503 UPLOAD_PROCESSING_TIMEOUT` sent only to connected clients; nothing saved after a processing timeout; waiting requests hold no body and are removed on disconnect or timeout; the processing deadline never frees the slot before native work has stopped; cleanup on every path; counters and logs as in §5.7.4; additionally: `413 PAYLOAD_TOO_LARGE` for a declared `Content-Length` over 15 MB (refused before reading) and for a chunked body that exceeds 15 MB while streaming; the route-specific `415 UNSUPPORTED_MEDIA_TYPE` message on the upload route, with the same status and code as other routes; start-up validation of `MEDIA_UPLOAD_QUEUE_WAITING` against the approved range (0 to 4, default 2); `RATE_LIMITED` responses keep their existing `Retry-After` and `RateLimit` headers unchanged; each queue reservation is released exactly once on every path; all tested |
