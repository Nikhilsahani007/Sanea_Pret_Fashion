# Design token exceptions

The register for `scripts/check-design-tokens.ts` (TD-002). A literal colour or font family in `apps/*/src` is allowed only with a marker `design-token-exception: DTX-nnn` on the same line or the line above, and a row here with a reason.

| ID | File | Reason | Approved by | Date |
|----|------|--------|-------------|------|
| DTX-001 | `apps/admin/src/pages/Colours.tsx` | An `<input type="color">` value must be a literal `#rrggbb`; the default is the swatch a new colour starts from (`--sp-ivory-deep`), not page styling. | Pending your review (Phase 8 gate) | 2026-10-24 |

Not scanned, values copied from `packages/shared/src/tokens/brand.css`: `index.html` `<meta name="theme-color">` in both apps (`--sp-ivory`, `--sp-porcelain`), web manifests, and email templates (Phase 16).
