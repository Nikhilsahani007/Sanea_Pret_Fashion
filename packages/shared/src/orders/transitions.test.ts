import { describe, expect, it } from "vitest";

import { AdminRole } from "../enums/admin-role.ts";
import { OrderStatus } from "../enums/order-status.ts";
import {
  ORDER_NUMBER_PATTERN,
  ORDER_TRANSITIONS,
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
