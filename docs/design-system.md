# Sanéa Pret — Design System and Direction

Status: Draft for approval · Date: 2026-10-18

## 1. How the design skills were used

| Skill or resource | Status in this workspace | How it is used |
|-------------------|--------------------------|----------------|
| Taste Skill (`design-taste-frontend`) | Installed, instructions read | Primary art direction for the storefront. Its `draw.mjs` dealt three directions; "The name as a monument" was chosen. Sheet saved at `.taste-skill/direction.json` (seed 2101993053). Its `lint.mjs` and `inspect.mjs` gates run during storefront build. |
| UI UX Pro Max (`ui-ux-pro-max`) | Installed, instructions read, Python 3.13 available | Usability, accessibility, responsive and form rules. Used as the primary guide for the admin app. Its generated "Liquid Glass + Cormorant/Montserrat" style recommendation was **rejected**: it is the generic luxury default and conflicts with Taste's no-glass rule. |
| Design Motion Principles (`design-motion-principles`) | Installed, instructions read | Ecommerce weighting: Jakub Krehel primary (production polish), Emil Kowalski secondary (speed for frequent actions), Jhey Tompkins selective (product showcase only). Audit mode runs before each storefront phase sign-off. |
| Awesome Claude Design | **Not installed** in `.claude/skills` or the user skills folder | Not consulted. If you share the repository or files, I will inspect the relevant references. Nothing was installed, per the brief. |
| Design MD Chrome | **Not installed** | Not consulted. Same as above. |
| Other installed skills (`design`, `design-system`, `brand`, `ui-styling`, `banner-design`, `slides`) | Installed, not used | `ui-styling` targets Tailwind and shadcn, which the brief excludes. The others overlap with the three primary skills. |

Where skills disagree, the order is: **your brief and the mandatory Nishorama reference** → accessibility (UI UX Pro Max critical rules) → Taste house rules → Taste direction sheet → motion skill.

## 2. Concept

> On this page, **the name Sanéa Pret, and especially its acute é,** becomes **the monument: a wordmark as wide as the screen, laid over the campaign photograph**.

The é is the one letter that marks the brand as distinct from every other "pret" label. It becomes the brand's single graphic device: the accent appears at full scale in the hero wordmark, as the favicon, as the cart-count dot shape and as the end mark on editorial copy. No other ornament is added.

**Live thing (Taste step 4):** on the product page, choosing a colour swaps the whole gallery and the page's field colour shifts one tone toward the garment's swatch, so "Ivory" and "Rani pink" each feel like their own page. It uses real variant data, works with a thumb, and falls back to a plain colour selector.

Competitor test: another eastern-wear brand cannot use the é device, and the colour-led product page only works with this catalogue's real colourways.

## 3. Landing page composition (Nishorama-derived)

Mandatory structure first, then the Taste direction fitted around it.

### Desktop (1440 × 900 first screen)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Announcement bar (optional, admin-edited, hidden when empty)          32px  │
├──────────────────────────────────────────────────────────────────────────────┤
│ SANÉA PRET (small wordmark)   New in  Shop  Collections   ⌕  ♡  ◯  Bag (2) │ 64px
│ ( Kurtas ) ( Co-ord sets ) ( Suits ) ( Dupattas ) ( Festive ) ( All )       │ 48px pills
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│                   FULL-BLEED CAMPAIGN PHOTOGRAPH (slide 1 of n)              │
│                                                                              │
│   Campaign line, one sentence                              [ Shop the edit ] │
│                                                                              │
│  S A N É A   P R E T     ← wordmark ≈ 92vw, bottom-anchored over the image   │
│  ▬ ▭ ▭ ▭                                                            ❚❚ Pause│
└──────────────────────────────────────────────────────────────────────────────┘
  New Ins                                                         View all →
  [img][img][img][img][img] → horizontal scroll-snap row, 4.5 cards visible
```

- Hero occupies the viewport below the header (`min-height: calc(100svh - header)`).
- Wordmark: Panchang 700, uppercase, `clamp(64px, 13.5vw, 220px)` so "SANÉA PRET" (10 characters plus a space) fits on one line between 24px margins. Sits on a neutral bottom scrim only, so the photograph stays clean above.
- The Taste sheet's hero ("name under a photograph", wordmark on a flat band) was **adapted**: the brief requires the wordmark overlaid on the hero, which takes precedence.
- Slide indicators: short bars, bottom-left, real buttons with `aria-label="Show slide 2 of 4"`. Pause button bottom-right.
- One CTA per slide, bound to a real collection or category in the admin.

### Mobile (390 × 844)

```
┌────────────────────────────┐
│ ≡   SANÉA PRET     ⌕  Bag 2│ 56px
│ (Kurtas)(Co-ords)(Suits)(→ │ 44px pills, horizontal scroll
├────────────────────────────┤
│                            │
│  PORTRAIT CAMPAIGN IMAGE   │
│  (separate mobile crop)    │
│                            │
│ Campaign line              │
│ [ Shop the edit ]          │
│ SANÉA                      │
│ PRET        ← 2 lines, 24vw│
│ ▬ ▭ ▭                 ❚❚   │
└────────────────────────────┘
 New Ins               View all
 [ img ][ img ][ i  → 2.3 cards visible, swipe
```

- The first screen ends with the top of the New Ins row visible, to signal there is more below.
- Swipe on the hero changes slides, with a movement threshold so vertical scrolling is never captured. Indicators remain tappable (44 × 44 px hit area).

### Sections after the hero, in order

| Order | Section | Composition | Content source |
|-------|---------|-------------|----------------|
| 1 | New Ins | Horizontal scroll-snap row of product cards, 4:5 images, 4.5 visible on desktop, 2.3 on mobile, arrow buttons on desktop | Newest published products |
| 2 | Editorial band | Taste "band of unequal panels": four tall crops with unequal widths, one heading, one caption | Admin `editorial_band` linked to a collection |
| 3 | Second product row | Same card, different row (e.g. a named collection) | Admin `product_row` |
| 4 | Tabbed grid | Tabs as text buttons over a 4-column grid (2 on mobile) | Admin `tabbed_grid` |
| 5 | Rehma Foundation teaser | Only shown once the page is verified and published | Admin |
| 6 | Footer | Wordmark at full width (bottom-cropped, not top-cropped), contact, WhatsApp, policies, live payment methods | Admin `footer` |

Taste's "pinned portraits" about section and "prints dropped on headline" gallery are held back for the About and campaign pages, so the landing page keeps Nishorama's shopping rhythm.

## 4. Type

| Role | Face | Setting |
|------|------|---------|
| Display (wordmark, campaign headings) | **Panchang** 700, uppercase | tracking −0.03em, leading 0.85–0.95 |
| Text and UI | **Switzer** 400 and 500 | leading 1.5, tracking 0 |

Both are from Fontshare under the ITF Free Font Licence, which allows commercial use. They will be **self-hosted** (subset to Latin and Latin-1 Supplement, WOFF2), not loaded from Fontshare's CDN. Before build, confirm Panchang includes a well-drawn `É` (OD-15). Sanéa Pret's own logo, if one exists, replaces the typeset wordmark (OD-02).

Five sizes only:

```css
:root {
  --step-small: clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem);  /* 13–14px labels, prices meta */
  --step-body:  clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem);    /* 17–19px body */
  --step-lead:  clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem);      /* 20–26px product names on PDP */
  --step-head:  clamp(2rem, 1.3rem + 3.2vw, 4rem);             /* 32–64px section headings */
  --step-monument: clamp(4rem, 13.5vw, 13.75rem);              /* wordmark */
}
```

Prices use tabular figures. Indian formatting via `Intl.NumberFormat('en-IN')`.

## 5. Colour

Dealt palette "Blush and aubergine", kept because it suits women's eastern wear without falling into the gold-on-black luxury cliché. It is provisional until brand colours are supplied (OD-02).

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#EDCCBE` blush | page ground |
| `--surface` | `#E8C2B2` | product card image wells, pills at rest |
| `--ink` | `#351A2B` aubergine | text, buttons, header |
| `--muted` | `#6C4857` | secondary text only |
| `--accent` | `#351A2B` | the primary action |
| `--accent-ink` | `#EDCCBE` | text on the primary action |
| `--field-1` / `--field-1-ink` | `#351A2B` / `#EDCCBE` | inverted sections and footer |
| `--paper` | `#FFFFFF` | checkout and form fields, for clarity |
| `--danger` | `#9B1C1C` | errors, always with text |
| `--success` | `#1F6B3A` | confirmations, always with text |

Contrast measured with the WCAG formula:

| Pair | Ratio | Result |
|------|------:|--------|
| ink on bg | 10.48 | AAA |
| ink on surface | 9.59 | AAA |
| muted on bg | 5.17 | AA |
| muted on surface | 4.73 | AA (normal text) |
| bg on ink (inverted) | 10.48 | AAA |

`--danger` and `--success` still need measuring against `--bg` and `--paper` when built.

The admin uses a neutral variant (white and grey surfaces, aubergine ink and actions) because dense data needs a quieter ground.

## 6. Components

| Component | Rules |
|-----------|-------|
| Buttons | Flat fill, **square corners**, 48px tall (44px minimum on mobile), sentence case. Primary: ink fill. Secondary: surface fill. No gradients or resting shadows. |
| Category pills | Fully rounded, flat `--surface` fill, 40px tall (44px hit area), sentence case. Active pill is ink-filled. Horizontal scroll on mobile with the last pill partly visible. Real links. |
| Product card | 4:5 image, square corners. Second image on hover (desktop) only when one exists. Name at body size, price under it. Compact label (e.g. "New", "Only 2 left", "Sold out") at 13px sentence case on a flat chip in the image's top-left. "Add" opens a size sheet; it never adds a default size silently. |
| Size selector | Buttons, not a dropdown. Sold-out sizes are visible, struck through and disabled, with "Sold out" in the accessible name. |
| Colour selector | Swatches with visible names, 44px targets. |
| Cart drawer | Right-side sheet on desktop, full-height sheet on mobile. Focus trapped, Escape closes, returns focus to the trigger. Only floating element with a shadow. |
| Forms | Visible labels, errors under fields linked by `aria-describedby`, correct `inputmode` (numeric for PIN code and phone), autocomplete attributes for addresses. |
| Header | Plain bar in `--bg`, no blur, sticky. Icon buttons have visible text on desktop ("Bag 2") and accessible names on mobile. |

## 7. Conflicts between skills and the brief

| Topic | Taste rule | Brief or reference | Decision |
|-------|-----------|--------------------|----------|
| Pill navigation | Bans floating pill navigation and pill badges | Requires compact pill category navigation | Brief wins. Pills are flat, not floating, no blur or shadow, and act as real links. |
| Wordmark on photo | "Name under a photograph" on a flat band | Wordmark overlaid on the hero | Brief wins. Neutral scrim at the bottom only. |
| Rows of identical cards | Bans rows of identical cards | Requires horizontal product cards | Brief wins for product rows. Editorial sections between rows use Taste blueprints for contrast. |
| Header icons | Navigation as text links only | Shopping controls and cart in header | Brief wins. Icons paired with text where width allows. |
| Small labels | Bans tiny uppercase tracked labels | Requires compact product labels | Labels at 13px, sentence case, no tracking. Complies with both. |
| Imagery | Real photographs required; dealt Unsplash photos for atmosphere | No copied assets; Sanéa Pret's own photography | Only Sanéa Pret's own photography in product and campaign slots. Development uses clearly marked grey placeholders, never stock photos posing as products. |

## 8. Motion

Weighting from the motion skill for ecommerce: Jakub primary, Emil secondary, Jhey only on the product showcase.

| Interaction | Frequency | Motion |
|-------------|-----------|--------|
| Hero slide change | Occasional | Crossfade 600ms plus 1.03 → 1 scale on the incoming image. Auto-advance every 6s (reference timing unverified). Pauses on hover, focus, tab hidden, pause button, and is off under reduced motion. |
| Wordmark (signature move) | Once per visit | Scales from 1 to 0.96 as the hero scrolls out, using a scroll-driven timeline. Static fallback where unsupported. |
| Section entrances | Once per section | Heading, then text, then images, 70ms stagger, 20px rise with opacity, 400ms ease-out. Content is visible if scripts fail. |
| Product card hover | Frequent | Second image crossfade 250ms. No scale on the card. |
| Buttons and pills press | Very frequent | 0.97 scale for 100ms. |
| Add to bag | Frequent | Bag count updates instantly; drawer slides in 280ms, exits 200ms. |
| Filters and sorting | Very frequent | No animation beyond a 150ms content crossfade. |
| Admin app | Very frequent | Near-instant. Only drawers and toasts animate. |

Only `transform` and `opacity` animate. Every motion has a `prefers-reduced-motion: reduce` fallback that keeps the content and removes the travel.

## 9. Imagery requirements (for the brand team)

| Slot | Ratio | Minimum size | Notes |
|------|-------|-------------|-------|
| Hero desktop | 16:9 to 21:9 | 2400 × 1350 | Calm area in the lower third for the wordmark. |
| Hero mobile | 4:5 or 9:16 | 1080 × 1350 | Separate art-directed crop. |
| Product images | 4:5 | 1440 × 1800 | Consistent background and light across the catalogue; front, back, detail, styled. |
| Editorial band | Tall slices | 1200 × 1800 each | Four related frames from one shoot. |

## 10. Quality gates for every storefront phase
1. Taste `lint.mjs` and `inspect.mjs` at 1440, 768 and 390 px, with documented exceptions only for the conflicts in §7.
2. Taste critique pass on the screenshots, up to three rounds.
3. Side-by-side visual review against nishorama.com (layout rhythm only) at desktop and mobile.
4. Motion audit with the motion skill.
5. UI UX Pro Max pre-delivery checklist: contrast, focus, tap targets, reduced motion, 375/768/1024/1440 widths.
6. Lighthouse performance and accessibility on a throttled mobile profile.
