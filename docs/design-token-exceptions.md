# Design Token Exceptions Register

Status: **Active** · Created: 2026-10-22 · Rules: `technology-decisions.md` TD-002 ("CI check for hard-coded design values")

The check `npm run check:tokens` (`scripts/check-design-tokens.mjs`, also run by `npm run lint` and therefore in CI) fails on a literal colour or font family in `apps/*/src`. A literal is allowed only when the same line, or the line above, carries a marker naming a row below:

```css
/* design-token-exception: DTX-001 */
```

In TypeScript the marker is the `//` comment equivalent.

**Rules:**
- A token is used wherever one can be read. An exception is for a value that must be literal, such as a third-party embed that accepts only literal colour strings, or a value that must match a browser API exactly.
- Each row needs an ID (`DTX-` plus three digits), the one file that uses it, a reason, who approved it and the date (`YYYY-MM-DD`).
- The check fails when:
  - a marker names an unknown ID;
  - a marker is used in a file other than the one registered;
  - a row is missing a field.
- The check prints every exception in use, so they stay visible in review.

## Exceptions

| ID | File | Reason | Approved by | Date |
|----|------|--------|-------------|------|

None yet.

## Literal copies outside the scan

These files need literal values and are not scanned (TD-002). Their values are copied from `packages/shared/src/tokens/brand.css`, and each copy is listed here.

| File | Value | Copied from |
|------|-------|-------------|

None yet. Expected later:
- `index.html` `<meta name="theme-color">`;
- the web manifest;
- the email templates (Phase 16).
