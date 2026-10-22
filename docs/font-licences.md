# Font Licences

Status: **Verified 2026-10-22** (U8-4) · Fonts: Panchang 700, Switzer 400 and 500 (`design-system.md` §4)

## Source and licence

| Font | Source | Licence | Files used |
|------|--------|---------|------------|
| Panchang | Fontshare by Indian Type Foundry: official download `https://api.fontshare.com/v2/fonts/download/panchang` | ITF Free Font License (FFL) v2.0, 17 Aug 2026, `License/FFL.txt` in the download | `Panchang-Bold.woff2` |
| Switzer | Fontshare: `https://api.fontshare.com/v2/fonts/download/switzer` | Same FFL v2.0 (byte-identical licence file) | `Switzer-Regular.woff2`, `Switzer-Medium.woff2` |

The licence was read in full from the official download, not from a summary.

## What the licence allows and forbids (FFL v2.0)

| Question | Answer | Clause |
|----------|--------|--------|
| Commercial use | **Allowed**, free of charge | §01 |
| Self-hosting on our own website with CSS `@font-face` | **Allowed** ("permitted and recommended") | §01 |
| Attribution | Not required (optional) | §01 |
| Subsetting, format conversion, renaming, editing | **Forbidden** without written consent | §02, §05 |
| Making the files available through a repository or a publicly accessible server, or to third parties | **Forbidden** | §02 |
| Giving the files to agencies or contractors | **Forbidden**: they obtain their own copy from Fontshare | §02 |

## Consequences for this project

- **The font files are not committed.** The GitHub repository is public, and §02 forbids distributing the files through a repository or a public server.
- **Fetching:** `npm run fonts:fetch` (`scripts/fetch-fonts.mjs`) downloads each environment's own official copy from Fontshare. The files go, unmodified, into `apps/admin/public/fonts/` and `apps/storefront/public/fonts/`, which are git-ignored, with the licence text (`panchang-FFL.txt`, `switzer-FFL.txt`) next to them.
- **Serving:** the apps serve them from `/fonts/` on their own origin, which is the self-hosting §01 allows.
- **No subsetting.** `design-system.md` §4 planned subset files. That is not allowed, so the official WOFF2 files are used as they are: about 21 KB, 17 KB and 20 KB.
- **Fallback:** without the files, the fallback stacks in `packages/shared/src/tokens/brand.css` render, and nothing breaks.
- **Deployment (Phase 19):** the build pipeline runs `npm run fonts:fetch` before `vite build`. Build artefacts containing the fonts must not be published anywhere public other than the site itself.
- **Open:** OD-15 (Panchang's `É`) is to be confirmed on the storefront wordmark in Phase 12. It renders correctly in the admin header (`docs/reviews/admin/2026-10-22/`).
