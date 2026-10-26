// Order screens (phase-16-plan.md): the API's shapes and the words staff see
// for statuses, moves and flags.
import type { CancelReason } from "@sanea/shared";

export type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: "PREPAID" | "COD";
  totalPaise: number;
  itemCount: number;
  customerName: string;
  city: string;
  needsAttention: boolean;
  attentionReason: string | null;
  placedAt: string;
};

export type ShipTo = {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  pinCode: string;
};

export type OrderDetail = {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentMethod: "PREPAID" | "COD";
    needsAttention: boolean;
    attentionReason: string | null;
    email: string;
    phone: string;
    shippingAddress: ShipTo;
    customerNote: string | null;
    subtotalPaise: number;
    discountPaise: number;
    shippingPaise: number;
    codFeePaise: number;
    taxPaise: number;
    totalPaise: number;
    placedAt: string;
    items: {
      id: string;
      sku: string;
      productName: string;
      variantLabel: string;
      quantity: number;
      unitPricePaise: number;
      lineTotalPaise: number;
      restocked: number;
    }[];
    events: {
      fromStatus: string | null;
      toStatus: string;
      actorType: string;
      actorName: string | null;
      note: string | null;
      reason: CancelReason | null;
      createdAt: string;
    }[];
    payments: {
      id: string;
      method: "PREPAID" | "COD";
      provider: string;
      status: string;
      amountPaise: number;
      failureCode: string | null;
      createdAt: string;
      refunds: {
        id: string;
        amountPaise: number;
        reason: string;
        status: string;
        reference: string | null;
        byStaff: boolean;
        createdAt: string;
      }[];
    }[];
    shipments: {
      id: string;
      courierName: string;
      trackingNumber: string;
      trackingUrl: string | null;
      shippedAt: string;
      deliveredAt: string | null;
    }[];
    notes: { id: string; body: string; by: string; createdAt: string }[];
  };
  nextStatuses: string[];
};

export const STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PENDING_CONFIRMATION: "COD to confirm",
  CONFIRMED: "Confirmed",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURN_TO_ORIGIN: "Returned to origin",
  RETURN_REQUESTED: "Return requested",
  RETURNED: "Returned",
};

/** The button label for moving an order to a status. */
export const ACTION_LABELS: Record<string, string> = {
  CONFIRMED: "Confirm order",
  PACKED: "Mark packed",
  SHIPPED: "Mark shipped",
  DELIVERED: "Mark delivered",
  CANCELLED: "Cancel order",
  RETURN_TO_ORIGIN: "Mark returned to origin",
  RETURN_REQUESTED: "Record return request",
  RETURNED: "Mark returned",
};

/** Declining an unconfirmed COD order reads differently from cancelling (D-181). */
export const actionLabel = (from: string, to: string) =>
  to === "CANCELLED" && from === "PENDING_CONFIRMATION"
    ? "Decline COD order"
    : (ACTION_LABELS[to] ?? to);

export const ATTENTION_LABELS: Record<string, string> = {
  AMOUNT_MISMATCH: "Payment amount did not match the order",
  PAID_NO_STOCK: "Paid after the hold expired; stock gone; refund due",
  PAID_AFTER_CANCEL: "Paid after cancellation; refund due",
};

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  CREATED: "Started, not paid",
  PENDING: "To collect on delivery",
  CAPTURED: "Paid",
  FAILED: "Failed",
  EXPIRED: "Expired",
  COLLECTED: "Collected",
  NOT_COLLECTED: "Not collected",
  REFUND_PENDING: "Refund pending",
  REFUNDED: "Refunded",
  REFUND_FAILED: "Refund failed",
};

export const ACTOR_LABELS: Record<string, string> = {
  SYSTEM: "System",
  CUSTOMER: "Customer",
  PROVIDER: "Payment provider",
  ADMIN: "Staff",
};

export const methodLabel = (m: "PREPAID" | "COD") =>
  m === "COD" ? "Cash on delivery" : "Online";
