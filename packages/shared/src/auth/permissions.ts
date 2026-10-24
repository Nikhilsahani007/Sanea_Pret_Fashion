// The authorisation matrix from security-design.md §4 as data (D-075). The API
// enforces it; the admin app reads the same table only to hide controls a
// role cannot use. A test in the API compares it with the document.
import { AdminRole } from "../enums/admin-role.ts";

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
  // D-160 (decided 2026-10-25): Fulfilment may decline an unconfirmed COD
  // order, with a reason; cancelling confirmed or packed orders stays O M.
  "orders.declineCod": [O, M, F],
  "content.edit": [O, M, C],
  "content.publishRehma": [O],
  "enquiries.manage": [O, M],
  "settings.store": [O, M],
  "settings.payments": [O],
  // D-169 (decided 2026-10-25): tax settings and GST rules, Owner only.
  "settings.tax": [O],
  "staff.manage": [O],
  "audit.view": [O],
} as const satisfies Record<string, readonly AdminRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: AdminRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly AdminRole[]).includes(role);
}
