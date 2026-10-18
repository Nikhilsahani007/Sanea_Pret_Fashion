# Phase 4 Plan — Shared Contracts

Status: **Implemented locally on branch `phase-4-shared-contracts`, not committed. Completion gate not passed:** it needs your review of the results in `PROJECT-STATUS.md`. · Date: 2026-10-18

Decisions: D-040 (design), D-041 (no project references to `@sanea/shared`), D-042 (classic Zod). Package documentation: `packages/shared/README.md`.

## Scope
All work is in `packages/shared`, plus `tsconfig.base.json` (two flags), `package-lock.json` (Zod) and `docs/`.

- Money in branded integer paise: safe arithmetic, basis-point percentages (half away from zero, `BigInt` intermediate), strict rupee parsing, INR formatting with Indian grouping, money schemas capped at 2,147,483,647 paise.
- Indian mobile numbers (mobile only, canonical `+91XXXXXXXXXX`), PIN codes, 28 states and 8 union territories, address schema with inferred input and output types.
- Const-object enums: `OrderStatus`, `PaymentMethod`, `AdminRole`.
- Stable validation codes and `toFieldErrors`.
- Explicit named exports only; deep imports blocked.

## Out of scope
API routes, database schemas and migrations, GST and invoicing, catalogue, inventory, checkout, payment integration, React UI, styling, infrastructure. Phase 5 has not started.

## Implementation notes (for your review)
These are details the plan left open. None changes a decision, but each is listed so nothing is silent.

1. **Error codes travel in the issue `message`.** Each schema sets one of our codes as the Zod issue message, and `toFieldErrors` adds the English text. Reason: Zod 4 does not report a missing field's input by default, so the code has to be chosen when the issue is created.
2. **Additional codes beyond the plan's examples:** `MONEY_NOT_POSITIVE` (price of 0 or less), `MONEY_ABOVE_LIMIT` (above the 2,147,483,647 cap), `RUPEES_INVALID`, `RUPEES_OUT_OF_RANGE`, `INVALID_OPTION` (enums), `INVALID` (fallback). `MoneyError` also has `MONEY_INVALID_TYPE` and `MONEY_OVERFLOW`. Full list in the package README.
3. **Non-finite numbers** (`NaN`, `Infinity`) in money schemas report `INVALID_TYPE`, because Zod's number type already rejects them.
4. **Blank strings** in phone, PIN and rupee schemas report `REQUIRED`, not a format error.
5. **Public names** settled during implementation: `isPaise`, `MAX_AMOUNT_PAISE`, `validationMessage`, `INDIAN_STATE_NAMES`, `INDIAN_STATE_KEYS`, and the types `PinCode`, `IndianMobile`, `IndianState`, `Result`, `FieldError`, `ValidationCode`. 33 runtime exports in total, pinned by `public-api.test.ts`.
6. **Separators in phone numbers:** a single space or hyphen between digit groups. Double separators and leading or trailing separators are rejected.
7. **Verification command adjusted:** the plan's `git grep '\benum\b'` would also match `z.enum(...)`. The check searches for TypeScript `enum` declarations instead; `erasableSyntaxOnly` enforces the same rule at compile time.
8. **Review fixes (approved 2026-10-18):** phone separators are limited to ASCII space, non-breaking space and hyphen; address text rejects control characters (`TEXT_INVALID_CHARACTERS`) and treats zero-width-only text as `REQUIRED`.

## Acceptance criteria
AC1 to AC10 as in the approved plan. Results: `PROJECT-STATUS.md`. AC9 (CI on draft PR #2) and AC10 (your review) are open.
