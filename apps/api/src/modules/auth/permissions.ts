// The authorisation matrix from security-design.md §4 as data (D-075). A test
// parses that table and compares it with this one, so the two cannot drift.
import { PERMISSIONS, can, type Permission } from "@sanea/shared";

export { PERMISSIONS, can };
export type { Permission };

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
  "content.edit": "Edit homepage and pages",
  "content.publishRehma": "Publish Rehma Foundation page",
  "enquiries.manage": "Enquiries",
  "settings.store": "Store, shipping, COD settings",
  "settings.payments": "Payment settings",
  "staff.manage": "Staff management",
  "audit.view": "Audit log",
};
