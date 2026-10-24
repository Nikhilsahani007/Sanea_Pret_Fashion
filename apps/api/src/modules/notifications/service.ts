// Sends an order email after the change that caused it has committed, and
// records the attempt. A failed send never undoes the order change.
import type { Address } from "@sanea/shared";

import type { Db } from "../../platform/db.ts";
import type { EmailProvider } from "./provider.ts";
import { render, type Template } from "./templates.ts";

export async function notifyOrder(
  db: Db,
  provider: EmailProvider,
  orderId: string,
  template: Template,
): Promise<"SENT" | "FAILED"> {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      shipments: { orderBy: { shippedAt: "desc" }, take: 1 },
    },
  });
  const email = render(template, {
    orderNumber: o.orderNumber,
    totalPaise: o.totalPaise,
    fullName: (o.shippingAddress as Address).fullName,
    items: o.items,
    shipment: o.shipments[0] ?? null,
  });
  let error: string | null = null;
  try {
    await provider.send(o.email, email);
  } catch (err) {
    error = err instanceof Error ? err.message.slice(0, 500) : "SEND_FAILED";
  }
  await db.notification.create({
    data: {
      orderId,
      template,
      recipient: o.email,
      provider: provider.name,
      status: error ? "FAILED" : "SENT",
      error,
    },
  });
  return error ? "FAILED" : "SENT";
}

/** The email, if any, that a status change sends (system-design.md §11). */
export function templateFor(
  to: string,
  method: "PREPAID" | "COD",
  from: string | null,
): Template | null {
  if (to === "PENDING_CONFIRMATION" && from === null && method === "COD")
    return "order.placed_cod";
  if (to === "CONFIRMED") return "order.confirmed";
  if (to === "SHIPPED") return "order.shipped";
  if (to === "CANCELLED") return "order.cancelled";
  return null;
}

/** Sends and records, never throws: an email problem is logged, not surfaced. */
export async function notify(
  deps: {
    db: Db;
    email: EmailProvider;
    logger: { error: (o: object, m: string) => void };
  },
  orderId: string,
  template: Template | null,
) {
  if (!template) return;
  try {
    await notifyOrder(deps.db, deps.email, orderId, template);
  } catch (err) {
    deps.logger.error({ err, orderId, template }, "order email not recorded");
  }
}
