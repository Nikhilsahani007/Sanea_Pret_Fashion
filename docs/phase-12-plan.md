# Phase 12 Plan — Landing Page

Status: **Built and tested on placeholders. The gate cannot pass yet:** it needs real campaign and product photography (B-06, D-120) and your visual approval (D-013). Date: 2026-10-24, branch `claude/amazing-faraday-21s6uc`.

## Composition (index Phase 12, D-012), in order
1. Announcement bar (published `home.announcement`; hidden when empty)
2. Minimal header: wordmark, header menu, search and bag (no account or wishlist controls, D-034)
3. Category pills (published `home.pills`)
4. Full-width hero: campaign photograph, the SANÉA PRET wordmark laid over it on a bottom scrim, one campaign line, one CTA, slide indicators and a pause control
5. New Ins, directly below the hero
6. A second product row
7. Tabbed products
8. Footer

The editorial band and the Rehma Foundation teaser stay off (OD-23 not answered).

## Implementation
| File | What |
|------|------|
| `apps/storefront/src/pages/Home.tsx` | The page, in the order above |
| `components/Hero.tsx`, `Hero.module.css` | Fills the viewport below the header (`--chrome` measured in `Layout`); on phones it leaves the top of New Ins in view. Wordmark sized from the available width: one line on desktop and tablet, two lines on phones. Crossfade 600 ms with 1.03 → 1 scale; auto-advance every 6 s (provisional, B-03); pauses on hover, focus inside, a hidden tab and the pause button; off under reduced motion; swipe with a threshold so vertical scrolling is never captured; indicators are 44 px buttons "Show slide n of m". Signature move: the wordmark settles from 1 to 0.96 as the hero scrolls away (scroll-driven, static fallback) |
| `components/ProductRow.tsx` | Scroll-snap row, 4.5 cards visible on desktop and 2.3 on phones, arrow buttons on wide screens, "View all" |
| `components/TabbedGrid.tsx` | ARIA tabs (arrow, Home, End keys) over a 4-column grid, 2 on phones |
| `components/QuickAdd.tsx`, `SizePicker.tsx` | "Add" on a card opens the size sheet; colour swatches with names; sold-out sizes visible, struck through and disabled with "sold out" in their name; nothing is added without a size; added items open the bag |
| `lib/reveal.ts` | Section entrances: cards rise into place in order when the section enters the view; they are never hidden while waiting |

## Verification (`e2e/landing.spec.ts`, 11 tests, all passed)
| testing-strategy.md §5 | Result |
|------------------------|--------|
| Hero fills the first viewport below the header at 1440×900, 1024×768, 768×1024, 390×844, 360×800 | Pass (top within 1 px of the header bottom; bottom within 2 px of the viewport, or 72 px above it on phones) |
| Wordmark never wraps unexpectedly or overflows | Pass: 1 line on desktop and tablet, 2 lines on phones, inside the viewport |
| Carousel: indicators, pause, focus, reduced motion | Pass (with a controlled clock) |
| New Ins is the first section after the hero | Pass at every width |
| Pills, search and bag keyboard-reachable and working | Pass |
| No horizontal page scroll | Pass at every width |
| Size picker from New Ins | Pass: sold-out size disabled, add disabled until a size is chosen, the bag opens with the item |

### Screenshots (`docs/reviews/landing/2026-10-24/`)
Every set the index asks for: `desktop-large-1440-first-screen.png`, `-full-page.png`; `desktop-small-1024-…`; `tablet-768-…`; `mobile-390-…`, `mobile-390-hero-slide-2.png`, `mobile-390-size-picker-from-new-ins.png`; `mobile-small-360-…`. **All imagery in them is generated grey "TEST PLACEHOLDER" cards** (D-148), so they show layout only.

### design-system.md §10 gates
| Gate | Status |
|------|--------|
| 1. Taste `lint.mjs` | 0 FAIL. Each shadow, the scrim gradient and the visually-hidden 1 px are marked `taste-skill-ignore` with a reason (focus halo, modal sheet, suggestion menu, allowed scrim). 5 WARN, defended: "Effortless" is the brand tagline (D-001); the outlined boxes are form fields and size buttons |
| 1. Taste `inspect.mjs` (1440, 768, 390) | 3 FAIL, 3 WARN; report saved as `taste-inspect-report.json`. "Eyebrow": the mandated single CTA sits above the wordmark (brief wins, §7). "Gradient": the allowed neutral scrim under the wordmark. "Empty screens 2 and 3": the captures show both screens full of cards; the meter does not count the flat grey placeholders as pictures — to re-run with real photography. WARN "cream palette": ivory is your brief (D-081). WARN "no footage": no honest Sanéa Pret clip exists. WARN "side scroll": the mandated product rows (D-012, §3) |
| 2. Taste critique on screenshots | Done here on placeholders; to repeat with real photography |
| 3. Side-by-side with nishorama.com | Not done: the recording is not supplied (B-03) and the live site was not opened from this environment |
| 4. Motion audit | Motion is limited to transform and opacity with reduced-motion fallbacks; a formal audit with the motion skill waits for real imagery |
| 5. UI UX Pro Max checklist | Covered by the role-based keyboard, focus, tap-size and reflow tests above; no automated axe scan (no axe package approved) |
| 6. Lighthouse | Not run: no Lighthouse package is approved (`system-architecture.md` §7). Needs your approval, also for Phase 17 |

## Gate (your decision)
Blocked by B-06 (real photography: at least one campaign image per slide, desktop and mobile crops, and eight product photographs) and B-03 (reference recording, for motion timing). When they arrive: upload them in the admin, replace the demo content, re-run `npx playwright test e2e/landing.spec.ts` and the Taste gates, and review the new screenshots. Record "approved" or a change list in `DECISION-LOG.md`.

## Defect found by the full end-to-end run and fixed
Run after the other suites, the landing tests failed on phones: in development the API serves media itself, so each landing load (about 36 images) counted against the 300-per-minute API limit (D-048) and the homepage request was refused. Development media serving now sits before the rate limiter; production never serves media from the API. Full run: 31 end-to-end tests passed.
