// The allowed-transitions table (system-design.md §5). The orders service
// enforces it; the admin app reads it to show only the moves a role can make.
import { AdminRole } from "../enums/admin-role.ts";
import { OrderStatus } from "../enums/order-status.ts";

const { OWNER: O, MANAGER: M, FULFILMENT: F } = AdminRole;
const S = OrderStatus;

type Transition = {
  readonly from: OrderStatus;
  readonly to: OrderStatus;
  /** Staff roles that may make the move; the system may make every move. */
  readonly roles: readonly AdminRole[];
};

export const ORDER_TRANSITIONS: readonly Transition[] = [
  // System only: payment captured, or payment failed or expired.
  { from: S.PENDING_PAYMENT, to: S.CONFIRMED, roles: [] },
  { from: S.PENDING_PAYMENT, to: S.CANCELLED, roles: [] },
  { from: S.PENDING_CONFIRMATION, to: S.CONFIRMED, roles: [O, M, F] },
  { from: S.PENDING_CONFIRMATION, to: S.CANCELLED, roles: [O, M, F] },
  { from: S.CONFIRMED, to: S.PACKED, roles: [O, M, F] },
  { from: S.CONFIRMED, to: S.CANCELLED, roles: [O, M] },
  { from: S.PACKED, to: S.SHIPPED, roles: [O, M, F] },
  { from: S.PACKED, to: S.CANCELLED, roles: [O, M] },
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
