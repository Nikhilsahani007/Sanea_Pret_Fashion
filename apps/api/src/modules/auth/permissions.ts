// The authorisation matrix from security-design.md §4 as data (D-075). A test
// parses that table and compares it with this one, so the two cannot drift.
import { AdminRole } from "@sanea/shared";

const { OWNER: O, MANAGER: M, CATALOGUE_EDITOR: C, FULFILMENT: F } = AdminRole;

export const PERMISSIONS = {
  "products.view": [O, M, C, F],
  "products.editContent": [O, M, C],
  "products.editPrices": [O, M],
  "products.publish": [O, M, C],
  "inventory.adjust": [O, M, F],
  "orders.view": [O, M, F],
  "orders.fulfil": [O, M, F],
  "orders.cancelRefund": [O, M],
  "content.edit": [O, M, C],
  "content.publishRehma": [O],
  "enquiries.manage": [O, M],
  "settings.store": [O, M],
  "settings.payments": [O],
  "staff.manage": [O],
  "audit.view": [O],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof PERMISSIONS;

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

export function can(role: AdminRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);
}
