import { describe, expect, it } from "vitest";

import { AdminRole } from "../enums/admin-role.ts";
import { OrderStatus } from "../enums/order-status.ts";
import { PERMISSIONS } from "../auth/permissions.ts";
import {
  CANCEL_REASONS,
  ORDER_NUMBER_PATTERN,
  ORDER_TRANSITIONS,
  STAFF_CANCEL_REASONS,
  canTransition,
  nextStatuses,
} from "./transitions.ts";

const ALL = Object.values(OrderStatus);

describe("order transitions (system-design.md §5)", () => {
  it("lists each move once", () => {
    const keys = ORDER_TRANSITIONS.map((t) => `${t.from}>${t.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("refuses every move that is not in the table, for every actor", () => {
    for (const from of ALL)
      for (const to of ALL) {
        const listed = ORDER_TRANSITIONS.some(
          (t) => t.from === from && t.to === to,
        );
        if (!listed) {
          expect(canTransition(from, to, "SYSTEM"), `${from}>${to}`).toBe(
            false,
          );
          for (const role of Object.values(AdminRole))
            expect(canTransition(from, to, role)).toBe(false);
        }
      }
  });

  it("keeps payment moves for the system and cancellation after confirmation for Owner and Manager", () => {
    expect(nextStatuses("PENDING_PAYMENT", "OWNER")).toEqual([]);
    expect(nextStatuses("PENDING_PAYMENT", "SYSTEM")).toEqual([
      "CONFIRMED",
      "CANCELLED",
    ]);
    expect(canTransition("CONFIRMED", "CANCELLED", "FULFILMENT")).toBe(false);
    expect(canTransition("CONFIRMED", "CANCELLED", "MANAGER")).toBe(true);
    expect(canTransition("PACKED", "SHIPPED", "FULFILMENT")).toBe(true);
    expect(canTransition("PACKED", "SHIPPED", "CATALOGUE_EDITOR")).toBe(false);
    expect(canTransition("DELIVERED", "RETURN_REQUESTED", "FULFILMENT")).toBe(
      false,
    );
  });

  it("has no way out of CANCELLED or RETURNED", () => {
    expect(nextStatuses("CANCELLED", "SYSTEM")).toEqual([]);
    expect(nextStatuses("RETURNED", "SYSTEM")).toEqual([]);
  });

  it("matches order numbers", () => {
    expect(ORDER_NUMBER_PATTERN.test("SP-2610-000123")).toBe(true);
    expect(ORDER_NUMBER_PATTERN.test("SP-261-000123")).toBe(false);
  });
});

describe("cancellation (D-160)", () => {
  it("Fulfilment may decline only an unconfirmed COD order; Owner and Manager may cancel until dispatch", () => {
    expect(
      canTransition("PENDING_CONFIRMATION", "CANCELLED", "FULFILMENT"),
    ).toBe(true);
    for (const from of ["CONFIRMED", "PACKED"] as const) {
      expect(canTransition(from, "CANCELLED", "FULFILMENT")).toBe(false);
      expect(canTransition(from, "CANCELLED", "OWNER")).toBe(true);
      expect(canTransition(from, "CANCELLED", "MANAGER")).toBe(true);
    }
    for (const from of ["SHIPPED", "DELIVERED", "RETURN_TO_ORIGIN"] as const)
      expect(canTransition(from, "CANCELLED", "SYSTEM")).toBe(false);
    expect(
      canTransition("PENDING_CONFIRMATION", "CANCELLED", "CATALOGUE_EDITOR"),
    ).toBe(false);
  });

  it("cancellation moves carry the permission the API checks, and roles follow it", () => {
    const cancels = ORDER_TRANSITIONS.filter(
      (t) => t.to === "CANCELLED" && t.roles.length,
    );
    expect(cancels.map((t) => [t.from, t.permission])).toEqual([
      ["PENDING_CONFIRMATION", "orders.declineCod"],
      ["CONFIRMED", "orders.cancelRefund"],
      ["PACKED", "orders.cancelRefund"],
    ]);
    for (const t of cancels)
      expect(t.roles).toEqual(PERMISSIONS[t.permission!]);
  });

  it("staff reasons are a subset of all reasons and include OTHER", () => {
    for (const r of STAFF_CANCEL_REASONS)
      expect(CANCEL_REASONS[r]).toBeTruthy();
    expect(STAFF_CANCEL_REASONS).toContain("OTHER");
    expect(STAFF_CANCEL_REASONS).not.toContain("PAID_NO_STOCK");
  });
});
