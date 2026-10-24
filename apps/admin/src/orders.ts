// Order labels and money formatting shared by the order screens.
import { formatInr, paise } from "@sanea/shared";

export const inr = (v: number) => formatInr(paise(v));

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

export const ATTENTION_LABELS: Record<string, string> = {
  AMOUNT_MISMATCH: "Payment amount did not match the order",
  PAID_NO_STOCK: "Paid after the hold expired; stock gone; refund due",
  PAID_AFTER_CANCEL: "Paid after cancellation; refund due",
};

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
