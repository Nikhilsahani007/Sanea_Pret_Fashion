// The authorisation matrix (security-design.md §4, D-075) lives in
// @sanea/shared, so the admin app hides exactly the controls the API refuses.
// A test parses the security-design table and compares it with that one, so
// the two cannot drift.
import type { Permission } from "@sanea/shared";

export { PERMISSIONS, can } from "@sanea/shared";
export type { Permission } from "@sanea/shared";

/** The row label in security-design.md §4 for each permission. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  "products.view": "View products",
  "products.editContent": "Edit product content",
  "products.editPrices": "Edit prices",
  "products.publish": "Publish or archive products",
  "inventory.adjust": "Adjust inventory",
  "orders.view": "View orders and customer details",
  "orders.fulfil": "Fulfilment transitions",
  "orders.cancelRefund": "Cancel orders, issue refunds",
  "orders.declineCod": "Decline unconfirmed COD orders",
  "content.edit": "Edit homepage and pages",
  "content.publishRehma": "Publish Rehma Foundation page",
  "enquiries.manage": "Enquiries",
  "settings.store": "Store, shipping, COD settings",
  "settings.payments": "Payment settings",
  "staff.manage": "Staff management",
  "audit.view": "Audit log",
};
