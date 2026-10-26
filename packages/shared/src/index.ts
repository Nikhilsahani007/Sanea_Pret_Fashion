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
export { PERMISSIONS, can } from "./enums/permissions.ts";
export type { Permission } from "./enums/permissions.ts";

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
  pageRichTextSchema,
  plainTextSchema,
  richTextSchema,
} from "./catalogue/rich-text.ts";
export type { PageRichText, RichText } from "./catalogue/rich-text.ts";

// Content (Phase 10)
export {
  CONTENT_BLOCKS,
  CONTENT_BLOCK_KEYS,
  NAV_MENUS,
  SOCIAL_HOSTS,
  contentTargetSchema,
  isAllowedSocialUrl,
  isContentBlockKey,
  isNavMenu,
  navItemSchema,
  navMenuSchema,
  productSourceSchema,
} from "./content/blocks.ts";
export type {
  ContentBlockKey,
  ContentTarget,
  NavItem,
  NavMenu,
  ProductSource,
  SocialNetwork,
} from "./content/blocks.ts";

// Guest cart (D-099)
export {
  CART_CURRENCY,
  CART_LINE_CEILING,
  CART_MAX_LINES,
  CartWarning,
  EMPTY_CART,
  cartItemAddSchema,
  cartItemUpdateSchema,
} from "./cart/cart.ts";
export type { CartImage, CartLine, CartView } from "./cart/cart.ts";

// Enquiries and WhatsApp (Phase 13)
export {
  ENQUIRY_LIMITS,
  enquirySchema,
  sitePathSchema,
  whatsAppClickSchema,
  whatsAppLink,
} from "./enquiry/enquiry.ts";
export type { EnquiryInput, PublicSettings } from "./enquiry/enquiry.ts";

// Checkout (system-design.md §4; D-186)
export {
  DeliveryMethod,
  checkoutContactSchema,
  checkoutQuoteSchema,
  codSettingsSchema,
  deliveryMethodSchema,
  placeOrderSchema,
  shippingSettingsSchema,
} from "./checkout/checkout.ts";
export type {
  CodIneligibleReason,
  CodSettings,
  PlaceOrderInput,
  ShippingSettings,
} from "./checkout/checkout.ts";

// Orders (system-design.md §5)
export {
  CANCEL_REASONS,
  ORDER_NUMBER_PATTERN,
  ORDER_TRANSITIONS,
  STAFF_CANCEL_REASONS,
  canTransition,
  nextStatuses,
} from "./orders/transitions.ts";
export type { CancelReason } from "./orders/transitions.ts";

// Validation
export {
  VALIDATION_CODES,
  toFieldErrors,
  validationMessage,
} from "./validation/errors.ts";
export type { FieldError, ValidationCode } from "./validation/errors.ts";
export type { Result } from "./validation/result.ts";
