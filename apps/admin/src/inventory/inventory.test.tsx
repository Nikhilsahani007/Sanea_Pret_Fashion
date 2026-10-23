// Inventory screens: roles, the stock-change form (signed change, the
// reserved floor, the API's 409), the low-stock level, and the movement list.
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { Movement, StockRow } from "../api/types.ts";
import {
  ADMINS,
  apiError,
  renderAt,
  signedInAs,
  stubApi,
} from "../test/helpers.tsx";
import { Inventory, adjustmentDelta } from "./Inventory.tsx";
import { Movements, signed } from "./Movements.tsx";

const ROW: StockRow = {
  variantId: "v1",
  sku: "TEST-ROSE-S",
  productId: "p1",
  productName: "Rose Silk Kurta",
  productStatus: "PUBLISHED",
  colour: "Rose",
  size: "S",
  isActive: true,
  onHand: 10,
  reserved: 4,
  available: 6,
  lowStockThreshold: 2,
  lowStock: false,
};

const stock = (rows: StockRow[] = [ROW]) => ({
  body: { items: rows, nextCursor: null },
});

function openInventory() {
  return renderAt(
    "/inventory",
    [{ path: "/inventory", element: <Inventory /> }],
    { shell: true },
  );
}

describe("inventory list", () => {
  it("shows stock to a catalogue editor without change controls", async () => {
    stubApi({
      ...signedInAs(ADMINS.CATALOGUE_EDITOR),
      "GET /admin/inventory": stock(),
    });
    openInventory();
    const table = await screen.findByRole("table");
    const cells = within(table)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells).toEqual(
      expect.arrayContaining(["TEST-ROSE-S", "10", "4", "6", "In stock"]),
    );
    expect(screen.queryByRole("button", { name: /Change stock/ })).toBeNull();
    expect(screen.getByText(/can view stock but not change it/)).toBeTruthy();
  });

  it("labels sold-out, low and inactive rows with text", async () => {
    stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      "GET /admin/inventory": stock([
        {
          ...ROW,
          variantId: "a",
          sku: "TEST-A",
          available: 0,
          reserved: 10,
          lowStock: true,
        },
        {
          ...ROW,
          variantId: "b",
          sku: "TEST-B",
          available: 1,
          reserved: 9,
          lowStock: true,
        },
        { ...ROW, variantId: "c", sku: "TEST-C", isActive: false },
      ]),
    });
    openInventory();
    await screen.findByRole("table");
    expect(screen.getByText("Sold out")).toBeTruthy();
    expect(screen.getByText("Low stock")).toBeTruthy();
    expect(screen.getByText("Inactive")).toBeTruthy();
  });

  it("sends the low-stock filter and the SKU search", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.OWNER),
      "GET /admin/inventory": stock(),
    });
    openInventory();
    await screen.findByRole("table");
    await user.click(screen.getByLabelText("Low stock only"));
    await user.type(screen.getByLabelText(/SKU starts with/), "test-r");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(
        calls.filter((c) => c.path.startsWith("/admin/inventory")).at(-1)?.path,
      ).toBe("/admin/inventory?lowStock=true&sku=TEST-R&limit=100"),
    );
  });
});

describe("stock changes", () => {
  it("removes units with a reason and sends a negative change", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      "GET /admin/inventory": stock(),
      "POST /admin/inventory/v1/adjustments": {
        status: 201,
        body: { onHand: 8, reserved: 4, lowStockThreshold: 2 },
      },
    });
    openInventory();
    await user.click(
      await screen.findByRole("button", {
        name: "Change stock for TEST-ROSE-S",
      }),
    );
    const form = screen.getByRole("form", {
      name: "Change stock for TEST-ROSE-S",
    });
    await user.selectOptions(
      within(form).getByLabelText("Kind of change"),
      "ADJUSTMENT",
    );
    await user.type(within(form).getByLabelText("Units"), "2");
    expect(
      within(form).getByText(/from 10 to 8; available from 6 to 4/),
    ).toBeTruthy();
    await user.type(
      within(form).getByLabelText("Reason"),
      "Two damaged in storage",
    );
    await user.click(
      within(form).getByRole("button", { name: "Save stock change" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "POST")?.body).toEqual({
        type: "ADJUSTMENT",
        delta: -2,
        reason: "Two damaged in storage",
      }),
    );
    expect(
      await screen.findByText("TEST-ROSE-S: on hand 10 → 8."),
    ).toBeTruthy();
  });

  it("refuses locally to go below reserved, and needs a reason for adjustments", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.MANAGER),
      "GET /admin/inventory": stock(),
    });
    openInventory();
    await user.click(
      await screen.findByRole("button", {
        name: "Change stock for TEST-ROSE-S",
      }),
    );
    const form = screen.getByRole("form", {
      name: "Change stock for TEST-ROSE-S",
    });
    await user.selectOptions(
      within(form).getByLabelText("Kind of change"),
      "CORRECTION",
    );
    await user.type(within(form).getByLabelText("Units"), "7");
    await user.click(
      within(form).getByRole("button", { name: "Save stock change" }),
    );
    const units = within(form).getByLabelText("Units");
    expect(units.getAttribute("aria-invalid")).toBe("true");
    expect(
      within(form).getByText(/cannot go below the 4 units reserved/),
    ).toBeTruthy();
    expect(
      within(form).getByLabelText("Reason").getAttribute("aria-invalid"),
    ).toBe("true");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("explains the API's 409 when reservations changed meanwhile", async () => {
    const user = userEvent.setup();
    stubApi({
      ...signedInAs(ADMINS.OWNER),
      "GET /admin/inventory": stock(),
      "POST /admin/inventory/v1/adjustments": apiError(
        409,
        "CONFLICT",
        "This change conflicts with the current state.",
        [
          {
            path: "body.delta",
            code: "STOCK_BELOW_RESERVED",
            onHand: 10,
            reserved: 9,
          },
        ],
      ),
    });
    openInventory();
    await user.click(
      await screen.findByRole("button", {
        name: "Change stock for TEST-ROSE-S",
      }),
    );
    const form = screen.getByRole("form", {
      name: "Change stock for TEST-ROSE-S",
    });
    await user.selectOptions(
      within(form).getByLabelText("Kind of change"),
      "ADJUSTMENT",
    );
    await user.type(within(form).getByLabelText("Units"), "3");
    await user.type(within(form).getByLabelText("Reason"), "Recount");
    await user.click(
      within(form).getByRole("button", { name: "Save stock change" }),
    );
    expect(await within(form).findByText(/9 units now reserved/)).toBeTruthy();
    expect(
      within(form).getByText("At most 1 unit can be removed now."),
    ).toBeTruthy();
  });

  it("sets the low-stock level", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      "GET /admin/inventory": stock(),
      "PATCH /admin/inventory/v1": {
        body: { onHand: 10, reserved: 4, lowStockThreshold: 5 },
      },
    });
    openInventory();
    await user.click(
      await screen.findByRole("button", {
        name: "Change stock for TEST-ROSE-S",
      }),
    );
    const form = screen.getByRole("form", {
      name: "Low-stock level for TEST-ROSE-S",
    });
    const field = within(form).getByLabelText("Low-stock level");
    await user.clear(field);
    await user.type(field, "5");
    await user.click(
      within(form).getByRole("button", { name: "Save low-stock level" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
        lowStockThreshold: 5,
      }),
    );
  });

  it("computes the signed change", () => {
    expect(adjustmentDelta("RECEIVED", "remove", "5")).toEqual({
      ok: true,
      delta: 5,
    });
    expect(adjustmentDelta("ADJUSTMENT", "remove", "5")).toEqual({
      ok: true,
      delta: -5,
    });
    expect(adjustmentDelta("CORRECTION", "add", "5")).toEqual({
      ok: true,
      delta: 5,
    });
    for (const bad of ["", "0", "10001", "1.5", "-3"])
      expect(adjustmentDelta("RECEIVED", "add", bad).ok).toBe(false);
  });
});

describe("movements", () => {
  const MOVES: Movement[] = [
    {
      id: "m2",
      variantId: "v1",
      sku: "TEST-ROSE-S",
      type: "RESERVED",
      onHandDelta: 0,
      reservedDelta: 2,
      reason: null,
      referenceType: "RESERVATION",
      actorName: null,
      createdAt: "2026-10-23T06:00:00Z",
    },
    {
      id: "m1",
      variantId: "v1",
      sku: "TEST-ROSE-S",
      type: "ADJUSTMENT",
      onHandDelta: -3,
      reservedDelta: 0,
      reason: "Damaged",
      referenceType: "ADMIN",
      actorName: "Farid Fulfilment",
      createdAt: "2026-10-23T05:00:00Z",
    },
  ];

  it("lists signed changes, who made them, and filters by variant", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      "GET /admin/inventory/movements": {
        body: { items: MOVES, nextCursor: null },
      },
    });
    renderAt(
      "/inventory/movements",
      [{ path: "/inventory/movements", element: <Movements /> }],
      { shell: true },
    );
    const table = await screen.findByRole("table");
    const text = table.textContent ?? "";
    expect(text).toContain("Reserved for a customer");
    expect(text).toContain("−3");
    expect(text).toContain("System");
    expect(text).toContain("Farid Fulfilment");
    await user.click(
      screen.getAllByRole("button", {
        name: "Show movements for TEST-ROSE-S",
      })[0]!,
    );
    await waitFor(() =>
      expect(calls.at(-1)?.path).toBe(
        "/admin/inventory/movements?variantId=v1&limit=50",
      ),
    );
  });

  it("formats deltas with a true minus sign", () => {
    expect([signed(3), signed(-2), signed(0)]).toEqual(["+3", "−2", "—"]);
  });
});
