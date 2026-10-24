# Phase 12 Plan — Landing Page

Status: **Written 2026-10-24; implementation authorised by you within this plan. The gate is your visual approval (index Phase 12) and cannot pass on placeholders (D-120).** · Base: `phase-12-landing` from `phase-11-storefront` at `c18bcfb` (Phase 11 gate passed, D-136; draft PRs #6 to #9 open and unmerged)

## 1. Scope (from the index)

The mandatory Nishorama composition (D-012), in this order:

1. announcement bar;
2. minimal header with search and bag (no account or wishlist controls, D-034);
3. category pills;
4. full-width hero with the oversized wordmark overlaid, campaign line, one CTA, slide indicators and a pause control;
5. New Ins, immediately below the hero;
6. further product rows;
7. tabbed products;
8. footer.

Items 1 to 3 and 8 exist from Phase 11 and are kept. Phase 12 builds 4 to 7, the monument, landing motion and the landing SEO.

**Out of scope:**
- **The editorial band and the Rehma Foundation teaser.** They stay off (OD-23) unless you approve them at this gate. The `home.editorial` block is not served by the API (Phase 10).
- **Anything about the Foundation.** Q11-5 is open; the `rehma-foundation` page stays unpublished and unrenamed; no charitable claims.
- **Product detail and listing pages** (Phase 13); **checkout** (Phase 15).

## 2. Current state

| Item | State |
|------|-------|
| Branch | `phase-12-landing` from `phase-11-storefront` at `c18bcfb`; working tree clean apart from untracked admin screenshots of 2026-10-24 |
| Content API | `GET /content/home`: published `announcement`, `hero.slides` (derivative images; slides whose target is not public are dropped), `newIns`, `row2` (`{ title, items }`, catalogue summaries), `tabbedGrid.tabs`; `GET /content/navigation` |
| Admin | Block editors for every landing block (Phase 10) |
| Storefront | Shell, search, size sheet, cart drawer (Phase 11); `/` is a placeholder heading |
| Logo | Raster crop only (`docs/brand/`); vector needed (B-04) |

## 3. Blockers (visible until resolved)

| ID | Blocker | Effect |
|----|---------|--------|
| **B-04** | No vector logo. Needed: SVG or PDF, or a transparent PNG at least 3000 px wide | The monument renders from the raster crop for development only; **the visual gate cannot pass** without the vector |
| **B-06** | No real product data and no real photography. Needed: real products and at least eight real product photographs, plus campaign photographs for the hero | Development uses clearly labelled placeholders; **the gate cannot pass on them** (D-120) |
| **B-03** | No Nishorama screen recording (OD-01) | Motion timing (slide duration, transitions, hover) stays **provisional**; layout rhythm is taken from the live reference where accessible (§6.6) |

None of them blocks building; all of them block the gate.

## 4. Decisions with defaults (none blocks implementation)

| # | Decision | Default used |
|---|----------|--------------|
| P12-1 | **The monument** | The supplied logo image, "SANÉA" as supplied (Q11-1, Q11-4), never retyped; accessible name "Sanéa Pret". Raster now; the vector replaces it with no layout change |
| P12-2 | **Display face** (deferred from Q11-2) | No new face: the logo is the only serif; headings stay in Switzer. Reversible; a new face would need a licence check and a record |
| P12-3 | **No published hero slide** | The monument on the deep aubergine field, no picture, no CTA. Nothing fake is shown in a real environment |
| P12-4 | **Development placeholders** | Flat images labelled "PLACEHOLDER" and naming the missing asset, created only by the end-to-end seed in the disposable database, served through the normal derivative path |
| P12-5 | **Motion** (provisional, B-03) | Slides auto-advance every 6 s; 600 ms crossfade with a 1.03 → 1 scale; pause on hover, focus, hidden tab and the pause button; none under reduced motion. Monument scales 1 → 0.96 as the hero scrolls out (scroll-driven, static fallback). Section entrances: 20 px rise with opacity, 70 ms stagger, once |
| P12-6 | **OD-23** | Editorial band and Rehma teaser stay off |
| P12-7 | **SEO** | Title "Sanéa Pret · Effortless Elegance"; a factual meta description; no structured-data claims. The SPA limit stays (OD-14: a link-preview meta endpoint in Phase 17) |
| P12-8 | **Second image on hover** in product cards | Not in this phase: catalogue summaries carry one image. Added with Phase 13's product data if you want it |
| P12-9 | **Cards per row** (after your first review) | Fewer, larger pictures: 1.6 on a phone, 2.4 on a tablet, 3.4 on desktop, instead of `design-system.md` §3's 2.3 and 4.5. For your review |

## 5. Sections

### 5.1 Hero (index item 4; `design-system.md` §3)

- **Height:** fills the viewport below the header (`min-height: calc(100svh - header)`); the top of New Ins shows on a phone.
- **Picture:** the slide's desktop image (wide) or mobile image (portrait), as `<picture>` with derivatives; focal point from the slide.
- **Monument:** the logo, bottom-anchored over the picture on a neutral bottom scrim, about 92 % of the width (`clamp` against the viewport); never wraps or overflows (it is one image).
- **Campaign line and CTA:** from the slide; one CTA, linked to the slide's public target.
- **Controls:** slide indicators as buttons ("Show slide 2 of 4", 44 px targets), a pause/play button; arrow keys when an indicator has focus; swipe with a movement threshold on touch.
- **Live region:** off while playing, polite when the shopper changes slides.

### 5.2 New Ins (item 5) and the second row (item 6)

A horizontal scroll-snap row of product cards: 4.5 visible on desktop, 2.3 on a phone, arrow buttons on desktop, "View all" only when the row's source has a public page. "Add" opens the Phase 11 size sheet.

### 5.3 Tabbed products (item 7)

Tabs as text buttons (WAI-ARIA tabs: arrow keys, Home and End), a 4-column grid on desktop and 2 on a phone, from `tabbedGrid.tabs`.

### 5.4 Empty states

A block that is unpublished, or whose products are not visible, is not drawn (the API returns null). Nothing is invented.

## 6. Checks

### 6.1 Tests

| Test | Proves |
|------|--------|
| L-1 | The hero fills the first viewport below the header at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 and 360 × 800 (`testing-strategy.md` §5) |
| L-2 | The monument never wraps or overflows at any tested width |
| L-3 | Indicators change the slide; pause stops auto-advance; focus inside stops it; reduced motion disables it |
| L-4 | New Ins is the first section after the hero at every width |
| L-5 | Pills, search and bag are keyboard-reachable and work |
| L-6 | No horizontal page scroll at any width |
| L-7 | Order of sections matches D-012; the editorial band and Rehma teaser are absent |
| L-8 | Empty landing (nothing published): the monument on its field, no broken sections |

Component tests cover the carousel state machine, tabs keyboard behaviour and the row arrows. Axe runs at every width.

### 6.2 Screenshots (`docs/reviews/landing/<date>/`)

First screen and full page at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 and 360 × 800; at 390 × 844 also hero slide 2 and the size picker opened from New Ins. Every placeholder is visibly labelled.

### 6.3 `design-system.md` §10 gates (all six)

1. Taste lint and inspector at 1440, 768 and 390 px; exceptions only for the conflicts in §7 and the missing real photography.
2. Taste critique on the screenshots, up to three rounds, written down.
3. Side-by-side with the live reference: layout rhythm only. Reference screenshots stay outside the repository (scratchpad); observations are written down. No reference asset enters the product.
4. Motion audit with `design-motion-principles`.
5. UI UX Pro Max checklist at 375, 768, 1024 and 1440 px.
6. Lighthouse 13.5.0 (D-098), mobile, throttled.

### 6.4 Performance

The hero picture is the LCP element: `fetchpriority="high"`, eager, the right derivative per width; other images lazy. No new dependency. Target: performance ≥ 90 and CLS < 0.1 on the throttled mobile profile, measured with placeholders and again with real assets.

### 6.5 Accessibility

Carousel: WAI-ARIA carousel pattern (`aria-roledescription="carousel"`/`"slide"`), visible pause, no auto-advance under reduced motion or while focused. The monument's accessible name is "Sanéa Pret". Contrast: campaign text sits on the scrim, checked on each real photograph (§3.4 pairs on the field).

### 6.6 Reference (B-03)

The live nishorama.com is reviewed where accessible for layout rhythm (order, proportions, spacing); findings are written in §9. Motion details stay provisional until the recording exists.

## 7. Asset requirements (from you or the brand team)

| Asset | Requirement | Blocks |
|-------|-------------|--------|
| Logo | SVG or PDF, or transparent PNG ≥ 3000 px wide | Gate (B-04) |
| Hero photographs | Per slide: desktop 16:9 to 21:9, ≥ 2400 × 1350, calm lower third; mobile 4:5 or 9:16, ≥ 1080 × 1350 (`design-system.md` §9) | Gate (B-06) |
| Products | Real products with at least eight real photographs, 4:5, ≥ 1440 × 1800 | Gate (B-06) |
| Reference | The nishorama.com screen recording (OD-01) | Final motion values (B-03) |

## 8. Acceptance criteria

1. The composition and order of D-012; the editorial band and Rehma teaser off.
2. L-1 to L-8 pass; axe clean at every tested width; no horizontal scroll.
3. The monument from the supplied logo (the vector before the gate), never retyped.
4. Motion as P12-5 with reduced-motion fallbacks; the motion audit recorded.
5. All six gates run and recorded.
6. Real photography and the vector logo in place for the gate (B-04, B-06).
7. **Your visual approval recorded in `DECISION-LOG.md`.** Phase 13 does not start without it.

## 9. Progress and evidence

### 9.1 Built (2026-10-24)

- **`apps/storefront/src/landing/`:**
  - `Landing.tsx` replaces the Phase 11 placeholder at `/`, with a visually hidden `h1` "Sanéa Pret";
  - `Hero.tsx`: carousel, monument, scrim, campaign line, CTA, indicators, pause, swipe threshold, measured height;
  - `useCarousel.ts`: auto-advance 6 s, paused by the button, hover, focus, a hidden tab, reduced motion or a single slide;
  - `ProductRow.tsx`: scroll-snap row with arrows; `TabbedGrid.tsx`: WAI-ARIA tabs; `useReveal.ts`: entrances; `landing.module.css`.
- **`Monument`** in `shell/Logo.tsx`: the raster wordmark, decorative (the `h1` carries the name).
- **Main region:** full width on `/` (`shell.module.css` `.wide`), so the hero runs edge to edge without `100vw` overflow.
- **Tests:** `landing/landing.test.tsx` (5 component tests); `e2e/landing.spec.ts` (L-1 to L-8); `e2e/support/seed-landing.ts` (labelled placeholders, P12-4).
- **Changes from what the screenshots showed:**
  - the campaign line and CTA sat under the monument on desktop; they now sit above it (the logo is 236/889 of its width high);
  - the scrim now starts a third of the way down, so the text sits on it.
- **Test-only fix:** axe waits for time-based entrance animations to end, so it measures final contrast.
- **Not deleted:** `pages/Home.tsx` and its `.home` style are now unused. File deletion needs your approval.

### 9.2 Results

| Check | Result |
|-------|--------|
| Unit and component | 718 passed (40 files) |
| Integration | 403 passed (19 files); no API change in this phase |
| End to end (Edge) | 20 passed: 11 admin, 5 landing (L-1 to L-8 at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 and 360 × 800, axe at each), 4 storefront |
| Lint, design tokens, format, typecheck | clean |
| Build | storefront JS 92.76 kB gzipped |
| `npm run audit` | 0 vulnerabilities |

### 9.3 Gates so far (with placeholders; not the gate)

| Gate | Result |
|------|--------|
| 1 Taste lint | 0 FAIL, 0 WARN. Two marked lines: the scrim gradient (the one allowed exception) and the logo's tagline |
| 1 Taste inspector | **Not obtained:** the inspector timed out capturing the landing page's screenshot on two runs (`CDP timeout: Page.captureScreenshot`), even after a warm-up page. To be retried |
| 2 Critique | One round on the screenshots (the overlap above fixed). The written critique runs with real photographs |
| 3 Reference | **Not run yet.** The live reference is to be reviewed for layout rhythm (B-03) |
| 4 Motion audit | **Not run yet** |
| 5 Checklist | axe clean at five viewports; no horizontal scroll; 44 px targets; reduced motion stops the carousel and the entrances |
| 6 Lighthouse 13.5.0 | `/` with placeholders: accessibility 100, performance 90 (88 on the first run), LCP 3.4 s, TBT 60 ms, CLS 0. Report in `docs/reviews/landing/2026-10-24/` |

### 9.4 Screenshots

`docs/reviews/landing/2026-10-24/`:
- first screen and full page at 1440, 1024, 768, 390 and 360;
- hero slide 2 at 390; the size picker from New Ins at 390;
- the empty landing at 1440.

Every hero and product image is a labelled placeholder (B-06). The monument is the raster crop (B-04).

### 9.5 Still needed for the gate

Your vector logo (B-04); real product data and at least eight real photographs, plus campaign photographs (B-06); the reference recording (B-03); gates 1 (inspector), 2, 3 and 4 with real assets; **your visual approval**.

## 10. Stop points

| Step | Work | Stop |
|------|------|------|
| 1 | This plan | Done |
| 2 | Landing sections, motion, tests, placeholders, screenshots, gates 1, 4, 5, 6 | Commit and push; draft PR only with your authorisation |
| 3 | Your review of the screenshots and running page with placeholders | **Your change list** |
| 4 | Real assets in place (B-04, B-06); gates 2 and 3 with them | **Your visual approval (the gate)** |

## 11. Risks

| Risk | Mitigation |
|------|------------|
| A placeholder reaches production | Placeholders exist only in the e2e seed; labelled; the gate refuses them (D-120) |
| The raster monument looks soft on large screens | Development only; the vector is required (B-04) |
| Motion values differ from the reference | Provisional until the recording (B-03); one token file to change |
| The hero picture slows the first screen | Derivatives, `fetchpriority`, no extra libraries; measured with real photographs before the gate |

## 12. Redesign after your first visual review (2026-10-24)

**Your feedback:** not premium enough, so rethink the design; the hero wordmark too large; spacing to adjust; motion subtle and elegant.

### 12.1 What changed

| Area | Before | After |
|------|--------|-------|
| **Hero** | The wordmark at about 92 % of the width, over the bottom of the picture | **Campaign first.** The photograph fills the frame. The campaign line is the headline (Switzer regular, 32 to 60 px, two lines at most), bottom left, with one quiet outlined CTA. The wordmark is a **masthead** at the top centre, `clamp(9rem, 24vw, 21rem)`: about a quarter of the width, and never above the raster's native 889 px at 2× (no stretching; B-04 stands). The indicators are fine 2 px bars, and pause sits bottom right. The scrim darkens only the top (for the masthead) and the bottom (for the headline) |
| **Header** | Logo left, links, a filled search button, bag | **The logo centred** (144 px on desktop); main links left; on the right, search as an underlined field with a text control, then the bag. On a phone: menu, logo, bag, then search. The pills are outlined and centred |
| **Product cards** | Smaller images, a boxed "Add" | **The picture leads** (4:5, larger). The name and price sit on one line under it ("From" in taupe), with a quiet underlined "Add" (44 px target, same accessible name). A slight 1.02 settle on hover where a pointer can hover |
| **Rows** | 4.5 cards on desktop, 2.3 on a phone; large heavy titles | 3.4, 2.4 and 1.6 cards (P12-9); titles at regular weight, 24 to 40 px; arrows as quiet text controls |
| **Tabs** | Left aligned | Centred text tabs with a fine underline |
| **Spacing** | Fixed gaps | A section rhythm of `clamp(4.5rem, 3rem + 6vw, 9rem)` and a gutter of `clamp(1rem, 0.5rem + 3.5vw, 3.5rem)`, shared by the header, hero and sections |
| **Motion** | 600 ms crossfade; a 1.03 scale; the monument scaling on scroll; 20 px entrances on every item | 1100 ms crossfade, a 1.015 settle over 2.4 s, no scroll-linked move; entrances of 12 px over 600 ms on a section's title and first four pictures only, 60 ms apart. Nothing moves under reduced motion. The 6 s interval stays provisional (B-03) |

The palette is unchanged (D-096); `admin.css` is unchanged.

### 12.2 Evidence

| Check | Result |
|-------|--------|
| Unit and component | 718 passed (40 files) |
| Lint, design tokens, format, typecheck | clean |
| Storefront build | JS 92.85 kB gzipped, CSS 5.39 kB |
| End to end | 20 passed (11 admin, 5 landing, 4 storefront) on the redesign; after the last CSS change (hidden faded slides) the 5 landing tests passed again |
| Lighthouse 13.5.0 (`/`, mobile, throttled, placeholders) | **Accessibility 100, performance 91**, FCP 1.8 s, LCP 3.3 s, TBT 50 ms, CLS 0 |
| Taste lint | 0 FAIL, 0 WARN |
| **Taste inspector** (obtained this time) | **2 FAIL, 3 WARN.** One finding fixed: `covered-text` (the hidden slides' headlines were under the current one; faded slides are now hidden). Recorded, not hidden: `gradient` (the neutral scrim over the photograph, the one allowed exception); `still-page` (5 elements move; the inspector wants 8 or more, and your direction is subtle motion); `palette-cream` (your approved ivory, D-096); `no-footage` (none exists); `side-scroll` (the horizontal product rows D-012 requires) |

**Screenshots** in `docs/reviews/landing/2026-10-24/`, regenerated for the redesign (the earlier versions are in commit `2c25dbb`):
- first screen and full page at 1440, 1024, 768, 390 and 360;
- hero slide 2 at 390; the size picker from New Ins at 390;
- the empty landing at 1440.

### 12.3 Still pending (not claimed)

- **The live-reference comparison** (gate 3) and **the motion audit** (gate 4): not performed.
- **Real assets:** B-04 (vector logo), B-06 (at least eight real product photographs and campaign photographs) and B-03 (the reference recording). Every image here is a labelled placeholder.
- **Your visual review of the redesign.** Phase 12 is not passed.

## 13. Refinements after the second review (2026-10-24)

### 13.1 What changed

- **Carousel edges:** the product rows run past the right-hand gutter to the edge of the screen (at the page's maximum width, to the column's edge), so the partly shown card reads as more to come rather than a clipped box. The arrow buttons are disabled at each end.
- **Responsive card text:** each card is a size container. On narrow cards (phones, the 2-column grid) the name sits above the price; on wider cards they share a line. Names scale gently and wrap rather than overflow.
- **Footer hierarchy:**
  - the logo and tagline in their own column (12rem on a phone, 15rem on desktop, below the raster's native width);
  - the published menus as quiet columns beside it, each with a small title;
  - contact and social links in titled columns of their own, shown only when published.
- **`TEST` labels:** kept. They come from the synthetic seed data (`e2e/support/seed-*.ts`), not from the code; **no approved real content exists to replace them** (B-06). The same names are used by the tests.

Kept as approved: the ivory and aubergine direction, the smaller centred masthead, the campaign-first hero, the larger cards (P12-9) and the subtle motion.

### 13.2 Evidence

| Check | Result |
|-------|--------|
| Unit and component | 718 passed (40 files) |
| Lint, design tokens, format, typecheck | clean |
| Taste lint | 0 FAIL, 0 WARN |
| Storefront build | JS 92.99 kB gzipped, CSS 5.56 kB |
| Checks against the running preview (`localhost:5173`, synthetic data; the preview stays up at your request) | At 1440, 1024, 768, 390 and 360: the hero fills the first screen; the masthead fits (336, 246, 184, 144 and 144 px wide); no horizontal scroll; order hero > New Ins > second row > tabs; **axe: no violations**, including the size picker at 390 |
| **Not run this round** | The Playwright end-to-end suite and Lighthouse: both need ports 4100, 4101 and 5173, which the preview holds, and you asked for the preview to stay up. Last results, at `f252387`: 20 end-to-end tests passed; Lighthouse accessibility 100, performance 91 |

**Screenshots** in `docs/reviews/landing/2026-10-24/`, regenerated from the preview (synthetic data, with the header menus, pills and footer seeded); earlier versions are in `f252387` and `2c25dbb`:
- first screen and full page at 1440, 1024, 768, 390 and 360;
- hero slide 2 at 390; the size picker from New Ins at 390.

`landing-empty-1440.png` is unchanged from `f252387`.

### 13.3 Assets (checked 2026-10-24)

| Asset | Found | Blocker |
|-------|-------|---------|
| Vector logo, or transparent PNG ≥ 3000 px | No. Only the raster crops in `docs/brand/` | **B-04 open** |
| ≥ 8 genuine product photographs | No | **B-06 open** |
| Campaign photography | No | **B-06 open** |
| Nishorama screen recording | No (`docs/reference/` does not exist) | **B-03 open** |

The live-reference comparison and the motion audit are **not performed**: they wait for the reference evidence (B-03). Phase 12 is **not passed**.
