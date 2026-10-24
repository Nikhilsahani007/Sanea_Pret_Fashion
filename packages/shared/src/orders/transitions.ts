// The allowed-transitions table (system-design.md §5). The orders service
// enforces it; the admin app reads it to show only the moves a role can make.
import { PERMISSIONS, type Permission } from "../auth/permissions.ts";
import { AdminRole } from "../enums/admin-role.ts";
import { OrderStatus } from "../enums/order-status.ts";

const { OWNER: O, MANAGER: M, FULFILMENT: F } = AdminRole;
const S = OrderStatus;

type Transition = {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  /** Staff roles that may make the move; the system may make every move. */
  readonly roles: readonly AdminRole[];
  /** The permission the API also checks for this move (cancellations, D-160). */
  readonly permission?: Permission;
};

// Cancellation roles come from the permission matrix, so the two cannot drift.
const decline = {
  roles: PERMISSIONS["orders.declineCod"],
  permission: "orders.declineCod",
} as const;
const cancel = {
  roles: PERMISSIONS["orders.cancelRefund"],
  permission: "orders.cancelRefund",
} as const;

export const ORDER_TRANSITIONS: readonly Transition[] = [
  // System only: payment captured, or payment failed or expired.
  { from: S.PENDING_PAYMENT, to: S.CONFIRMED, roles: [] },
  { from: S.PENDING_PAYMENT, to: S.CANCELLED, roles: [] },
  { from: S.PENDING_CONFIRMATION, to: S.CONFIRMED, roles: [O, M, F] },
  // D-160: declining an unconfirmed COD order (O M F, reason required).
  { from: S.PENDING_CONFIRMATION, to: S.CANCELLED, ...decline },
  { from: S.CONFIRMED, to: S.PACKED, roles: [O, M, F] },
  { from: S.CONFIRMED, to: S.CANCELLED, ...cancel },
  { from: S.PACKED, to: S.SHIPPED, roles: [O, M, F] },
  { from: S.PACKED, to: S.CANCELLED, ...cancel },
  // Nothing is cancelled after dispatch: return to origin or a return instead.
  { from: S.SHIPPED, to: S.DELIVERED, roles: [O, M, F] },
  { from: S.SHIPPED, to: S.RETURN_TO_ORIGIN, roles: [O, M, F] },
  { from: S.DELIVERED, to: S.RETURN_REQUESTED, roles: [O, M] },
  { from: S.RETURN_REQUESTED, to: S.RETURNED, roles: [O, M] },
];

/** True when `actor` (a staff role, or `SYSTEM`) may move an order from `from` to `to`. */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  actor: AdminRole | "SYSTEM",
): boolean {
  const t = ORDER_TRANSITIONS.find((x) => x.from === from && x.to === to);
  if (!t) return false;
  return actor === "SYSTEM" || t.roles.includes(actor);
}

/** The statuses `actor` may move an order to from `from`. */
export function nextStatuses(
  from: OrderStatus,
  actor: AdminRole | "SYSTEM",
): OrderStatus[] {
  return ORDER_TRANSITIONS.filter(
    (t) => t.from === from && canTransition(t.from, t.to, actor),
  ).map((t) => t.to);
}

/** Order numbers are `SP-YYMM-NNNNNN` (D-115). */
export const ORDER_NUMBER_PATTERN = /^SP-[0-9]{4}-[0-9]{6}$/;

/**
 * Why an order was cancelled (D-160). Staff choose one of the first six;
 * `OTHER` needs a note. The system uses the last three. The code goes into
 * the order history and the audit log; the note only into the order history.
 */
export const CANCEL_REASONS = {
  CUSTOMER_REQUESTED: "Customer asked to cancel",
  CUSTOMER_UNREACHABLE: "Customer could not be reached to confirm",
  SUSPECTED_FRAUD: "Suspected fraud",
  OUT_OF_STOCK: "Out of stock",
  ADDRESS_UNSERVICEABLE: "Address cannot be served",
  OTHER: "Other (note required)",
  PAYMENT_NOT_COMPLETED: "Payment not completed in time",
  NOT_CONFIRMED_IN_WINDOW: "Not confirmed within the confirmation window",
  PAID_NO_STOCK: "Paid after the hold expired; stock gone",
} as const;
export type CancelReason = keyof typeof CANCEL_REASONS;

/** The reasons staff may choose. */
export const STAFF_CANCEL_REASONS = [
  "CUSTOMER_REQUESTED",
  "CUSTOMER_UNREACHABLE",
  "SUSPECTED_FRAUD",
  "OUT_OF_STOCK",
  "ADDRESS_UNSERVICEABLE",
  "OTHER",
] as const satisfies readonly CancelReason[];
