// Public API of @sanea/shared. Only names exported here are supported.
// Deep imports into src/ are blocked by the package exports map.

// Money
export { MAX_AMOUNT_PAISE, MoneyError, isPaise, paise } from "./money/paise.ts";
export type { MoneyErrorCode, Paise } from "./money/paise.ts";
export {
  addPaise,
  multiplyPaise,
  subtractPaise,
  sumPaise,
} from "./money/arithmetic.ts";
export { percentageOfPaise } from "./money/percentage.ts";
export { parseRupeesToPaise } from "./money/parse.ts";
export type { RupeeParseErrorCode } from "./money/parse.ts";
export { formatInr } from "./money/format.ts";
export type { FormatInrOptions } from "./money/format.ts";
export {
  amountPaiseSchema,
  paiseSchema,
  pricePaiseSchema,
  rupeesInputSchema,
} from "./money/schemas.ts";

// Phone
export {
  formatIndianMobileForDisplay,
  indianMobileSchema,
  normalizeIndianMobile,
} from "./phone/indian-mobile.ts";
export type { IndianMobile, PhoneErrorCode } from "./phone/indian-mobile.ts";

// Address
export { normalizePinCode, pinCodeSchema } from "./address/pin-code.ts";
export type { PinCode } from "./address/pin-code.ts";
export {
  INDIAN_STATE_KEYS,
  INDIAN_STATE_NAMES,
  indianStateSchema,
} from "./address/indian-states.ts";
export type { IndianState } from "./address/indian-states.ts";
export { addressSchema } from "./address/address.ts";
export type { Address, AddressInput } from "./address/address.ts";

// Enums
export { OrderStatus, orderStatusSchema } from "./enums/order-status.ts";
export { PaymentMethod, paymentMethodSchema } from "./enums/payment-method.ts";
export { AdminRole, adminRoleSchema } from "./enums/admin-role.ts";

// Catalogue
export { SLUG_MAX_LENGTH, SLUG_PATTERN, slugSchema } from "./catalogue/slug.ts";
export { ProductLabel, productLabelSchema } from "./catalogue/labels.ts";
export { Availability, availabilityOf } from "./catalogue/availability.ts";
export type { VariantAvailability } from "./catalogue/availability.ts";
export {
  EMPTY_RICH_TEXT,
  INTERNAL_LINK_PATTERN,
  RICH_TEXT_LIMITS,
  isInternalLink,
  richTextSchema,
} from "./catalogue/rich-text.ts";
export type { RichText } from "./catalogue/rich-text.ts";

// Validation
export {
  VALIDATION_CODES,
  toFieldErrors,
  validationMessage,
} from "./validation/errors.ts";
export type { FieldError, ValidationCode } from "./validation/errors.ts";
export type { Result } from "./validation/result.ts";
