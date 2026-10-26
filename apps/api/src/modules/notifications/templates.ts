// Transactional email text (system-design.md §11). Plain text built from the
// order; no HTML, so nothing in an order can inject markup. Wording avoids
// promises that are not decided yet (delivery times, returns terms).
import { formatInr, paise } from "@sanea/shared";

export const TEMPLATES = [
  "order.placed_cod",
  "order.confirmed",
  "order.shipped",
  "order.cancelled",
] as const;
export type Template = (typeof TEMPLATES)[number];

export type OrderFacts = {
  orderNumber: string;
  totalPaise: number;
  fullName: string;
  items: { productName: string; variantLabel: string; quantity: number }[];
  shipment?: {
    courierName: string;
    trackingNumber: string;
    trackingUrl: string | null;
  } | null;
};

export type Email = { subject: string; text: string };

function lines(o: OrderFacts) {
  return o.items
    .map((i) => `- ${i.productName} (${i.variantLabel}) × ${i.quantity}`)
    .join("\n");
}

export function render(template: Template, o: OrderFacts): Email {
  const total = formatInr(paise(o.totalPaise));
  const hello = `Hello ${o.fullName},`;
  const sign = "Sanéa Pret";
  switch (template) {
    case "order.placed_cod":
      return {
        subject: `Order ${o.orderNumber} placed`,
        text: `${hello}\n\nThank you for your order ${o.orderNumber}. You pay ${total} in cash on delivery. We will contact you to confirm it before it is packed.\n\n${lines(o)}\n\n${sign}`,
      };
    case "order.confirmed":
      return {
        subject: `Order ${o.orderNumber} confirmed`,
        text: `${hello}\n\nYour order ${o.orderNumber} (${total}) is confirmed. We will email you when it ships.\n\n${lines(o)}\n\n${sign}`,
      };
    case "order.shipped": {
      const s = o.shipment;
      const track = s
        ? `Courier: ${s.courierName}\nTracking number: ${s.trackingNumber}${s.trackingUrl ? `\nTrack it: ${s.trackingUrl}` : ""}`
        : "";
      return {
        subject: `Order ${o.orderNumber} has shipped`,
        text: `${hello}\n\nYour order ${o.orderNumber} is on its way.\n\n${track}\n\n${sign}`,
      };
    }
    case "order.cancelled":
      return {
        subject: `Order ${o.orderNumber} cancelled`,
        text: `${hello}\n\nYour order ${o.orderNumber} has been cancelled. If you paid online, the refund is being processed.\n\n${sign}`,
      };
  }
}
