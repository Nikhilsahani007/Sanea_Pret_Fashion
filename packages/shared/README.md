# @sanea/shared

Shared contracts for Sanéa Pret: money in paise, INR formatting, Indian mobile numbers, PIN codes, addresses, enums, catalogue rules and validation errors. Used by the storefront, admin and API. It also holds the design tokens (CSS) for the storefront and admin; see "Design tokens" below.

- **Import only from `@sanea/shared`.** Deep imports such as `@sanea/shared/src/...` are blocked by the exports map, at runtime and by the type checker.
- The package ships TypeScript source. It runs unbuilt in Vite, Vitest and Node 24 (type stripping). Consumers do **not** use TypeScript project references to it (D-041).
- Runtime dependency: `zod@4.6.7`, classic API (D-042).

## Public API

### Money

| Export | Kind | Description |
|--------|------|-------------|
| `Paise` | type | Branded integer number of paise (₹1 = 100 paise) |
| `paise(n)` | function | Validates a safe integer and returns `Paise`; `-0` becomes `0`. Throws `MoneyError` |
| `isPaise(x)` | function | True for safe integers |
| `MoneyError`, `MoneyErrorCode` | class, type | Thrown for invalid arguments or overflow. `code` is one of `MONEY_INVALID_TYPE`, `MONEY_NOT_INTEGER`, `MONEY_UNSAFE`, `MONEY_OVERFLOW`, `QUANTITY_INVALID`, `BPS_INVALID` |
| `MAX_AMOUNT_PAISE` | constant | 2,147,483,647: temporary cap for amount and price schemas until Phase 6 |
| `addPaise(a, b)`, `subtractPaise(a, b)` | function | Exact; result must stay a safe integer (`MONEY_OVERFLOW`). Subtraction may go negative |
| `multiplyPaise(amount, quantity)` | function | Quantity must be a non-negative safe integer (`QUANTITY_INVALID`) |
| `sumPaise(list)` | function | Empty list sums to 0 |
| `percentageOfPaise(amount, bps)` | function | See rounding policy below |
| `parseRupeesToPaise(text)`, `RupeeParseErrorCode` | function, type | Returns a `Result` |
| `formatInr(amount, options?)`, `FormatInrOptions` | function, type | Indian digit grouping |
| `paiseSchema` | schema | Any safe-integer paise value (deltas) |
| `amountPaiseSchema` | schema | 0 to `MAX_AMOUNT_PAISE` |
| `pricePaiseSchema` | schema | 1 to `MAX_AMOUNT_PAISE` |
| `rupeesInputSchema` | schema | Rupee string to `Paise`, capped at `MAX_AMOUNT_PAISE` |

### Phone

| Export | Kind | Description |
|--------|------|-------------|
| `IndianMobile` | type | `` `+91${string}` `` canonical form |
| `normalizeIndianMobile(text)`, `PhoneErrorCode` | function, type | Returns a `Result`: `PHONE_INVALID` or `PHONE_NOT_MOBILE` |
| `formatIndianMobileForDisplay(mobile)` | function | `+91 98765 43210` |
| `indianMobileSchema` | schema | String to canonical `+91XXXXXXXXXX` |

### Address

| Export | Kind | Description |
|--------|------|-------------|
| `PinCode` | type | Branded normalised 6-digit string |
| `normalizePinCode(text)` | function | Returns a `Result`: `PIN_CODE_INVALID` |
| `pinCodeSchema` | schema | String to normalised PIN code |
| `INDIAN_STATE_NAMES`, `INDIAN_STATE_KEYS`, `IndianState` | constants, type | 28 states and 8 union territories, keyed by our own stable kebab-case keys |
| `indianStateSchema` | schema | Accepts keys only (`maharashtra`), not display names |
| `addressSchema`, `AddressInput`, `Address` | schema, types | Strict object; see below |

### Enums (const objects, not TypeScript `enum`)

| Export | Values |
|--------|--------|
| `OrderStatus`, `orderStatusSchema` | `PENDING_PAYMENT`, `PENDING_CONFIRMATION`, `CONFIRMED`, `PACKED`, `SHIPPED`, `DELIVERED`, `CANCELLED`, `RETURN_TO_ORIGIN`, `RETURN_REQUESTED`, `RETURNED` |
| `PaymentMethod`, `paymentMethodSchema` | `PREPAID`, `COD` |
| `AdminRole`, `adminRoleSchema` | `OWNER`, `MANAGER`, `CATALOGUE_EDITOR`, `FULFILMENT` |

Each name is both a value (`OrderStatus.SHIPPED`) and a type (`OrderStatus`).

### Permissions

| Export | Kind | Description |
|--------|------|-------------|
| `PERMISSIONS`, `Permission`, `can(role, permission)` | constant, type, function | The role matrix from `security-design.md` §4 (D-075). The API enforces it; the admin app uses it only to hide controls a role cannot use |

### Catalogue (Phase 8)

| Export | Kind | Description |
|--------|------|-------------|
| `slugSchema`, `SLUG_PATTERN`, `SLUG_MAX_LENGTH` | schema, constants | Lowercase `a-z0-9` words joined by single hyphens, at most 100 characters (`SLUG_INVALID`) |
| `ProductLabel`, `productLabelSchema` | const object, schema | Admin-set labels; release one allows only `NEW` (Q8-8) |
| `Availability`, `availabilityOf(stock)`, `VariantAvailability` | const object, function, type | `IN_STOCK`, `LOW_STOCK` with `remaining` (0 < available ≤ threshold), `SOLD_OUT` (D-082, Q8-2) |
| `richTextSchema`, `RichText`, `EMPTY_RICH_TEXT`, `RICH_TEXT_LIMITS` | schema, type, constants | Structured rich text (Q8-10): `doc` of paragraphs, headings (2, 3) and lists; inline `text` (with `bold`/`italic`) and `link`. Words live under `text` (R2). No HTML |
| `isInternalLink(href)`, `INTERNAL_LINK_PATTERN` | function, constant | Internal links only (safeguard 2): `/`, `/products/<slug>`, `/collections/<slug>`, `/categories/<slug>`, `/pages/<slug>`, `/search?q=…` (`LINK_NOT_INTERNAL`) |

### Validation

| Export | Kind | Description |
|--------|------|-------------|
| `VALIDATION_CODES`, `ValidationCode` | constant, type | All stable codes |
| `toFieldErrors(zodError)`, `FieldError` | function, type | `{ path, code, message }[]` in Zod's issue order; unknown keys give one entry each |
| `validationMessage(code)` | function | English message for a code |
| `Result<T, E>` | type | `{ ok: true, value }` or `{ ok: false, code }` |

## Rules

### Money and rounding
- Money is integer paise in a JavaScript `number`, always within `Number.isSafeInteger`. Results outside that range throw `MONEY_OVERFLOW`; nothing is silently rounded.
- `percentageOfPaise(amount, bps)`: `bps` is an integer from 0 to 10,000 (100%). The exact value `amount × bps / 10,000` is rounded to the nearest paise, **halves away from zero**, using `BigInt` (no float error, no overflow). Examples: 999 at 50% → 500; 50 at 1% → 1; 49 at 1% → 0; −50 at 1% → −1.
- This is for discounts and similar calculations only. **GST rounding is not implemented here**; it needs accountant review (D-030, D-033).

### Rupee input (`parseRupeesToPaise`, `rupeesInputSchema`)
- Outer whitespace is trimmed. Format: ASCII digits, optionally `.` and 1–2 digits. `"1299"` → 129,900; `"1299.5"` → 129,950; `"0.01"` → 1.
- Rejected: grouping commas, `₹` or `Rs`, signs, exponents, leading or trailing dot, internal spaces, non-ASCII digits (`RUPEES_INVALID`); 3+ decimals (`RUPEES_TOO_MANY_DECIMALS`); above the safe range (`RUPEES_OUT_OF_RANGE`). The schema also rejects values above `MAX_AMOUNT_PAISE` (`MONEY_ABOVE_LIMIT`).

### INR formatting (`formatInr`)
- `en-IN` grouping: `₹1,29,999`, `₹1,00,00,000`. `auto` (default) hides `.00`: `₹1,299` vs `₹1,299.50`; `always` shows `₹1,299.00`. Negative: `-₹1,299`.
- The amount is passed to `Intl.NumberFormat` as an exact decimal string, so even `Number.MAX_SAFE_INTEGER` paise formats exactly (`₹9,00,71,99,25,47,409.91`).

### Indian mobile numbers
Canonical form: `+91` followed by 10 digits starting 6–9.

1. Trim outer whitespace (including non-breaking spaces).
2. Only digits, `+` and separators are allowed. A separator is one ASCII space, non-breaking space or hyphen, only between digit groups; tabs, newlines and other Unicode spaces are rejected. `+` only as the first character, immediately followed by `91`.
3. After removing separators, exactly one shape: 10 digits; `0` + 10; `91` + 10; `+91` + 10; `0091` + 10.
4. The 10-digit number must start with 6–9. Other 10-digit numbers (for example landlines) → `PHONE_NOT_MOBILE`; everything else → `PHONE_INVALID`.

Rejected examples: other country codes, `+91` followed by a trunk `0`, letters, dots, slashes, parentheses, `++`, `+ 91`, double separators, extensions, two numbers in one field, Devanagari or full-width digits. Nothing is guessed or corrected.

### PIN codes
Six ASCII digits, first digit 1–9. Outer whitespace trimmed; one ASCII space after the third digit allowed and removed (`"110 001"` → `"110001"`). Strings only. Format check only; delivery serviceability is checked elsewhere.

### Addresses (`addressSchema`)
- Fields: `fullName` (1–100), `phone`, `line1` (1–200), `line2` (optional, ≤200), `landmark` (optional, ≤200), `city` (1–100), `state` (key), `pinCode`.
- Text is trimmed; blank required text, or text made only of zero-width characters, → `REQUIRED` (in optional fields it becomes `undefined`); control characters (including line breaks, tabs and NUL) → `TEXT_INVALID_CHARACTERS`; empty optional text becomes `undefined`; unknown keys → `UNKNOWN_FIELD`. Country is always India and is not a field.

### Validation codes
Schemas put a stable code in each issue's `message`; `toFieldErrors` adds the English message. Codes: `REQUIRED`, `INVALID_TYPE`, `TOO_SHORT`, `TOO_LONG`, `INVALID_OPTION`, `UNKNOWN_FIELD`, `INVALID`, `MONEY_NOT_INTEGER`, `MONEY_UNSAFE`, `MONEY_NEGATIVE`, `MONEY_NOT_POSITIVE`, `MONEY_ABOVE_LIMIT`, `RUPEES_INVALID`, `RUPEES_TOO_MANY_DECIMALS`, `RUPEES_OUT_OF_RANGE`, `PHONE_INVALID`, `PHONE_NOT_MOBILE`, `PIN_CODE_INVALID`, `STATE_INVALID`, `TEXT_INVALID_CHARACTERS`, `SLUG_INVALID`, `LINK_NOT_INTERNAL`. Built-in Zod issues without our code map to `INVALID_TYPE`, `TOO_SHORT`, `TOO_LONG`, `INVALID_OPTION`, `UNKNOWN_FIELD` or `INVALID`. Non-finite numbers (`NaN`, `Infinity`) are `INVALID_TYPE`.

## Design tokens (TD-002, D-086)

CSS custom properties for the storefront and admin, exported as CSS subpaths. They are not part of the TypeScript entry, and the API is blocked from importing them by an ESLint rule.

| Subpath | Contents |
|---------|----------|
| `@sanea/shared/tokens/brand.css` | Primitives with the `--sp-` prefix: colour, faces, weights, the five type steps, spacing, control sizes, focus, layout widths, motion (`design-system.md` §4, §5, §8) |
| `@sanea/shared/tokens/storefront.css` | Semantic layer: blush ground, aubergine ink |
| `@sanea/shared/tokens/admin.css` | Semantic layer: white and grey surfaces, the same ink, actions and focus |
| `@sanea/shared/tokens/fonts.css` | `@font-face` rules; empty until the font files exist (B-04) |

Each app imports `fonts.css`, `brand.css` and its own layer once, from its global stylesheet. Components read only the semantic names, for example `var(--sp-ink)`, `var(--sp-surface)` or `var(--sp-focus)`.

Literal colours and font families in `apps/storefront/src` and `apps/admin/src` fail `npm run check:tokens`, which runs as part of `npm run lint`. Exceptions are registered in `docs/design-token-exceptions.md`.

## Not in this package (later phases)
API routes, database schemas, GST and invoicing, catalogue route bodies, inventory, checkout, payments, UI components, infrastructure.
