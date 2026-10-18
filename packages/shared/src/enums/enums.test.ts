import { describe, expect, expectTypeOf, it } from "vitest";

import { toFieldErrors } from "../validation/errors.ts";
import { AdminRole, adminRoleSchema } from "./admin-role.ts";
import { OrderStatus, orderStatusSchema } from "./order-status.ts";
import { PaymentMethod, paymentMethodSchema } from "./payment-method.ts";

describe("const-object enums", () => {
  it("OrderStatus matches system-design.md §5", () => {
    expect(Object.values(OrderStatus)).toEqual([
      "PENDING_PAYMENT",
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
      "RETURN_TO_ORIGIN",
      "RETURN_REQUESTED",
      "RETURNED",
    ]);
    expectTypeOf<OrderStatus>().toEqualTypeOf<
      | "PENDING_PAYMENT"
      | "PENDING_CONFIRMATION"
      | "CONFIRMED"
      | "PACKED"
      | "SHIPPED"
      | "DELIVERED"
      | "CANCELLED"
      | "RETURN_TO_ORIGIN"
      | "RETURN_REQUESTED"
      | "RETURNED"
    >();
  });

  it("PaymentMethod is PREPAID or COD", () => {
    expect(Object.values(PaymentMethod)).toEqual(["PREPAID", "COD"]);
    expectTypeOf<PaymentMethod>().toEqualTypeOf<"PREPAID" | "COD">();
  });

  it("AdminRole matches security-design.md §4", () => {
    expect(Object.values(AdminRole)).toEqual([
      "OWNER",
      "MANAGER",
      "CATALOGUE_EDITOR",
      "FULFILMENT",
    ]);
    expectTypeOf<AdminRole>().toEqualTypeOf<
      "OWNER" | "MANAGER" | "CATALOGUE_EDITOR" | "FULFILMENT"
    >();
  });

  it("keys equal values", () => {
    for (const object of [OrderStatus, PaymentMethod, AdminRole]) {
      for (const [key, value] of Object.entries(object))
        expect(key).toBe(value);
    }
  });
});

describe("enum schemas", () => {
  it.each([
    [orderStatusSchema, "SHIPPED"],
    [paymentMethodSchema, "COD"],
    [adminRoleSchema, "FULFILMENT"],
  ] as const)("accepts a listed value", (schema, value) => {
    expect(schema.parse(value)).toBe(value);
  });

  it.each([
    [orderStatusSchema, "shipped", "INVALID_OPTION"],
    [orderStatusSchema, "NEEDS_ATTENTION", "INVALID_OPTION"],
    [paymentMethodSchema, "UPI", "INVALID_OPTION"],
    [adminRoleSchema, "ADMIN", "INVALID_OPTION"],
    [adminRoleSchema, undefined, "REQUIRED"],
  ] as const)("rejects %#", (schema, value, code) => {
    const result = schema.safeParse(value);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(toFieldErrors(result.error).map((e) => e.code)).toEqual([code]);
  });
});
