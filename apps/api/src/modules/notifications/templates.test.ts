import { describe, expect, it } from "vitest";

import { maskEmail } from "./provider.ts";
import { templateFor } from "./service.ts";
import { TEMPLATES, render } from "./templates.ts";

const order = {
  orderNumber: "SP-2610-000001",
  totalPaise: 349_900,
  fullName: "TEST Shopper",
  items: [
    { productName: "TEST Kurta", variantLabel: "Ivory / M", quantity: 1 },
  ],
  shipment: {
    courierName: "TEST Courier",
    trackingNumber: "T1",
    trackingUrl: null,
  },
};

describe("order emails", () => {
  it.each(TEMPLATES)("%s names the order and is plain text", (t) => {
    const e = render(t, order);
    expect(e.subject).toContain("SP-2610-000001");
    expect(e.text).toContain("SP-2610-000001");
    expect(e.text).not.toMatch(/<[a-z]/i);
  });

  it("includes INR totals and tracking", () => {
    expect(render("order.placed_cod", order).text).toContain("₹3,499");
    expect(render("order.shipped", order).text).toContain(
      "Tracking number: T1",
    );
  });

  it("maps status changes to templates", () => {
    expect(templateFor("PENDING_CONFIRMATION", "COD", null)).toBe(
      "order.placed_cod",
    );
    expect(templateFor("PENDING_PAYMENT", "PREPAID", null)).toBeNull();
    expect(templateFor("PACKED", "COD", "CONFIRMED")).toBeNull();
    expect(templateFor("CANCELLED", "COD", "CONFIRMED")).toBe(
      "order.cancelled",
    );
  });

  it("masks addresses in logs", () => {
    expect(maskEmail("shopper@example.test")).toBe("s***@example.test");
  });
});
