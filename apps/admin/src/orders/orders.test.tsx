// Phase 16 admin screens (phase-16-plan.md): the order list and its filters,
// the next-step moves with the reason a cancellation needs (D-181), shipping
// details, notes, the packing slip without prices, the dashboard by role,
// the enquiries inbox and the store settings.
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ADMINS, renderAt, signedInAs, stubApi } from "../test/helpers.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { Enquiries } from "./Enquiries.tsx";
import { OrderDetail } from "./OrderDetail.tsx";
import { Orders } from "./Orders.tsx";
import { PackingSlip } from "./PackingSlip.tsx";
import { Settings } from "./Settings.tsx";

const NO = "SP-2610-000001";
const row = {
  id: "0199f0a0-0000-7000-8000-000000000001",
  orderNumber: NO,
  status: "PENDING_CONFIRMATION",
  paymentMethod: "COD",
  totalPaise: 349_900,
  itemCount: 1,
  customerName: "TEST Asha",
  city: "Lucknow",
  needsAttention: false,
  attentionReason: null,
  placedAt: "2026-10-26T10:00:00.000Z",
};

const detail = (
  over: object = {},
  nextStatuses = ["CONFIRMED", "CANCELLED"],
) => ({
  order: {
    ...row,
    email: "asha@example.test",
    phone: "+919876543210",
    shippingAddress: {
      fullName: "TEST Asha",
      phone: "+919876543210",
      line1: "TEST 1 Example Road",
      city: "Lucknow",
      state: "uttar-pradesh",
      pinCode: "226001",
    },
    billingAddress: null,
    customerNote: null,
    subtotalPaise: 349_900,
    discountPaise: 0,
    shippingPaise: 0,
    codFeePaise: 0,
    taxPaise: 0,
    items: [
      {
        id: "0199f0a0-0000-7000-8000-0000000000i1",
        sku: "TEST-KURTA-IVORY-M",
        productName: "TEST Kurta",
        variantLabel: "Ivory / M",
        quantity: 1,
        unitPricePaise: 349_900,
        lineTotalPaise: 349_900,
        restocked: 0,
      },
    ],
    events: [
      {
        fromStatus: null,
        toStatus: "PENDING_CONFIRMATION",
        actorType: "CUSTOMER",
        actorName: null,
        note: null,
        reason: null,
        createdAt: "2026-10-26T10:00:00.000Z",
      },
    ],
    payments: [
      {
        id: "p1",
        method: "COD",
        provider: "cod",
        status: "PENDING",
        amountPaise: 349_900,
        failureCode: null,
        createdAt: "2026-10-26T10:00:00.000Z",
        refunds: [],
      },
    ],
    shipments: [],
    notes: [],
    ...over,
  },
  nextStatuses,
});

const at = (path: string, route: string, element: React.ReactNode) =>
  renderAt(path, [{ path: route, element }], { shell: true });

describe("order list", () => {
  it("lists orders and puts the filters in the address", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      "GET /admin/orders": { body: { orders: [row], nextBefore: null } },
    });
    at("/orders", "/orders", <Orders />);
    const link = await screen.findByRole("link", { name: NO });
    expect(link.getAttribute("href")).toBe(`/orders/${NO}`);
    expect(screen.getAllByText("COD to confirm").length).toBeGreaterThan(0);
    expect(screen.getByText("₹3,499")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText(/^Status/), "SHIPPED");
    await user.type(screen.getByLabelText(/^Search/), "asha");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() =>
      expect(
        calls.some(
          (c) =>
            c.path.startsWith("/admin/orders?") &&
            c.path.includes("status=SHIPPED") &&
            c.path.includes("q=asha"),
        ),
      ).toBe(true),
    );
  });
});

describe("order detail", () => {
  it("cancelling needs a reason before anything is sent; OTHER needs a note", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      [`GET /admin/orders/${NO}`]: { body: detail() },
      [`POST /admin/orders/${NO}/transitions`]: {
        body: { status: "CANCELLED" },
      },
    });
    at(`/orders/${NO}`, "/orders/:orderNumber", <OrderDetail />);
    // Fulfilment declines an unconfirmed COD order (D-181).
    await user.click(
      await screen.findByRole("button", { name: "Decline COD order" }),
    );
    const form = screen.getByRole("form", { name: "Decline COD order" });
    await user.click(
      within(form).getByRole("button", { name: "Decline COD order" }),
    );
    expect(
      await within(form).findAllByText("Choose why the order is cancelled."),
    ).toBeTruthy();
    await user.selectOptions(within(form).getByLabelText(/^Reason/), "OTHER");
    await user.click(
      within(form).getByRole("button", { name: "Decline COD order" }),
    );
    expect(
      (await within(form).findAllByText("Describe the reason in the note."))
        .length,
    ).toBeGreaterThan(0);
    expect(calls.some((c) => c.path.endsWith("/transitions"))).toBe(false);
    await user.type(
      within(form).getByLabelText(/^Note for the order history/),
      "TEST ordered twice",
    );
    await user.click(
      within(form).getByRole("button", { name: "Decline COD order" }),
    );
    await waitFor(() => {
      const move = calls.find((c) => c.path.endsWith("/transitions"));
      expect(move?.body).toEqual({
        toStatus: "CANCELLED",
        reason: "OTHER",
        note: "TEST ordered twice",
      });
    });
  });

  it("shipping sends the courier and tracking number", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      [`GET /admin/orders/${NO}`]: {
        body: detail({ status: "PACKED" }, ["SHIPPED"]),
      },
      [`POST /admin/orders/${NO}/transitions`]: { body: { status: "SHIPPED" } },
    });
    at(`/orders/${NO}`, "/orders/:orderNumber", <OrderDetail />);
    await user.click(
      await screen.findByRole("button", { name: "Mark shipped" }),
    );
    const form = screen.getByRole("form", { name: "Mark shipped" });
    await user.type(within(form).getByLabelText(/^Courier/), "TEST Courier");
    await user.type(within(form).getByLabelText(/^Tracking number/), "TRK1");
    await user.type(
      within(form).getByLabelText(/^Tracking link/),
      "http://track.example.test",
    );
    await user.click(
      within(form).getByRole("button", { name: "Mark shipped" }),
    );
    expect(
      (
        await within(form).findAllByText(
          "The tracking link must start with https://.",
        )
      ).length,
    ).toBeGreaterThan(0);
    await user.clear(within(form).getByLabelText(/^Tracking link/));
    await user.click(
      within(form).getByRole("button", { name: "Mark shipped" }),
    );
    await waitFor(() => {
      const move = calls.find((c) => c.path.endsWith("/transitions"));
      expect(move?.body).toEqual({
        toStatus: "SHIPPED",
        shipment: { courierName: "TEST Courier", trackingNumber: "TRK1" },
      });
    });
  });

  it("adds an internal note and offers no moves the role lacks", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      [`GET /admin/orders/${NO}`]: {
        body: detail({ status: "CONFIRMED" }, ["PACKED"]),
      },
      [`POST /admin/orders/${NO}/notes`]: { status: 201, body: { note: {} } },
    });
    at(`/orders/${NO}`, "/orders/:orderNumber", <OrderDetail />);
    expect(
      await screen.findByRole("button", { name: "Mark packed" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
    // COD: no refund form, nothing has been paid.
    expect(screen.queryByRole("form", { name: "Record a refund" })).toBeNull();
    await user.type(screen.getByLabelText(/^New note/), "TEST evening call");
    await user.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/notes"))?.body).toEqual({
        body: "TEST evening call",
      }),
    );
  });

  it("Owner records a refund in rupees as paise", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.OWNER),
      [`GET /admin/orders/${NO}`]: {
        body: detail(
          {
            status: "DELIVERED",
            paymentMethod: "PREPAID",
            payments: [
              {
                id: "p1",
                method: "PREPAID",
                provider: "mock",
                status: "CAPTURED",
                amountPaise: 349_900,
                failureCode: null,
                createdAt: "2026-10-26T10:00:00.000Z",
                refunds: [],
              },
            ],
          },
          ["RETURN_REQUESTED"],
        ),
      },
      [`POST /admin/orders/${NO}/refunds`]: {
        status: 201,
        body: { refund: { id: "r1", status: "PENDING" } },
      },
    });
    at(`/orders/${NO}`, "/orders/:orderNumber", <OrderDetail />);
    const form = await screen.findByRole("form", { name: "Record a refund" });
    await user.type(within(form).getByLabelText(/^Amount in rupees/), "500.50");
    await user.type(within(form).getByLabelText(/^Reason/), "TEST goodwill");
    await user.click(
      within(form).getByRole("button", { name: "Record refund" }),
    );
    await waitFor(() =>
      expect(calls.find((c) => c.path.endsWith("/refunds"))?.body).toEqual({
        amountPaise: 50_050,
        reason: "TEST goodwill",
      }),
    );
  });
});

describe("packing slip", () => {
  it("shows what to pack and what to collect, without prices", async () => {
    stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      [`GET /admin/orders/${NO}/packing-slip`]: {
        body: {
          packingSlip: {
            orderNumber: NO,
            placedAt: "2026-10-26T10:00:00.000Z",
            paymentMethod: "COD",
            collectPaise: 349_900,
            shipTo: detail().order.shippingAddress,
            phone: "+919876543210",
            items: [
              {
                sku: "TEST-KURTA-IVORY-M",
                productName: "TEST Kurta",
                variantLabel: "Ivory / M",
                quantity: 1,
              },
            ],
          },
        },
      },
    });
    at(
      `/orders/${NO}/packing-slip`,
      "/orders/:orderNumber/packing-slip",
      <PackingSlip />,
    );
    expect(
      await screen.findByText("Cash on delivery: collect ₹3,499"),
    ).toBeTruthy();
    const slip = screen.getByRole("article");
    expect(within(slip).getByText("TEST-KURTA-IVORY-M")).toBeTruthy();
    expect(within(slip).queryByText(/Line total|Price/)).toBeNull();
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
  });
});

describe("dashboard", () => {
  it("shows each figure the API returns, linking to its list", async () => {
    stubApi({
      ...signedInAs(ADMINS.FULFILMENT),
      "GET /admin/dashboard": {
        body: {
          orders: {
            today: 3,
            todayValuePaise: 1_049_700,
            pendingCodConfirmation: 2,
            needsAttention: 0,
            toDispatch: 1,
          },
          lowStockVariants: 4,
        },
      },
    });
    at("/", "/", <Dashboard />);
    const cod = await screen.findByRole("link", {
      name: /COD orders to confirm/,
    });
    expect(cod.getAttribute("href")).toBe(
      "/orders?status=PENDING_CONFIRMATION",
    );
    expect(within(cod).getByText("2")).toBeTruthy();
    expect(screen.getByText(/₹10,497 placed/)).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Low-stock variants/ })
        .getAttribute("href"),
    ).toBe("/inventory?lowStock=true");
    expect(screen.queryByRole("link", { name: /Open enquiries/ })).toBeNull();
  });
});

describe("enquiries", () => {
  it("changes the status and the assignee", async () => {
    const user = userEvent.setup();
    const enquiry = {
      id: "0199f0a0-0000-7000-8000-0000000000e1",
      name: "TEST Asker",
      email: "asker@example.test",
      phone: null,
      message: "TEST is this in L?",
      status: "NEW",
      sourcePath: "/products/test-kurta",
      product: { name: "TEST Kurta", slug: "test-kurta" },
      sku: null,
      assignedTo: null,
      createdAt: "2026-10-26T10:00:00.000Z",
    };
    const { calls } = stubApi({
      ...signedInAs(ADMINS.MANAGER),
      "GET /admin/enquiries": {
        body: { enquiries: [enquiry], nextBefore: null },
      },
      "GET /admin/enquiries/assignees": {
        body: { assignees: [{ id: "a1", name: "Olivia Owner" }] },
      },
      "GET /admin/enquiries/whatsapp-clicks": {
        body: { days: 30, products: [] },
      },
      [`PATCH /admin/enquiries/${enquiry.id}`]: { body: { ok: true } },
    });
    at("/enquiries", "/enquiries", <Enquiries />);
    expect(await screen.findByText("TEST is this in L?")).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Status of the enquiry from TEST Asker"),
      "IN_PROGRESS",
    );
    await user.selectOptions(
      screen.getByLabelText("Assign the enquiry from TEST Asker"),
      "a1",
    );
    await waitFor(() => {
      const patches = calls.filter((c) => c.method === "PATCH");
      expect(patches.map((c) => c.body)).toEqual([
        { status: "IN_PROGRESS" },
        { assignedAdminId: "a1" },
      ]);
    });
    expect(screen.getByText(/No WhatsApp button taps/)).toBeTruthy();
  });
});

describe("store settings", () => {
  it("saves delivery charges in paise and the WhatsApp number", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      ...signedInAs(ADMINS.OWNER),
      "GET /admin/settings/shipping": {
        body: {
          settings: {
            flatFeePaise: 0,
            freeShippingThresholdPaise: null,
            deliveryEstimate: null,
          },
        },
      },
      "GET /admin/settings/cod": {
        body: {
          settings: {
            enabled: true,
            maxOrderPaise: 1_500_000,
            feePaise: 0,
            excludedPinPrefixes: [],
            refusalLimit: null,
            confirmWithinHours: 48,
          },
        },
      },
      "GET /admin/settings/whatsapp": { body: { settings: null } },
      "PUT /admin/settings/shipping": (c) => ({ body: { settings: c.body } }),
      "PUT /admin/settings/whatsapp": {
        body: { settings: { number: "+919876543210", hours: "" } },
      },
    });
    at("/settings", "/settings", <Settings />);
    const ship = await screen.findByRole("form", { name: "Delivery settings" });
    const fee = within(ship).getByLabelText(/^Delivery charge/);
    await user.clear(fee);
    await user.type(fee, "99");
    await user.type(within(ship).getByLabelText(/^Free delivery from/), "3000");
    await user.click(
      within(ship).getByRole("button", { name: "Save delivery" }),
    );
    await waitFor(() =>
      expect(
        calls.find((c) => c.method === "PUT" && c.path.endsWith("/shipping"))
          ?.body,
      ).toEqual({
        flatFeePaise: 9_900,
        freeShippingThresholdPaise: 300_000,
        deliveryEstimate: null,
      }),
    );
    expect(await within(ship).findByText("Delivery saved.")).toBeTruthy();

    const wa = screen.getByRole("form", { name: "WhatsApp settings" });
    expect(within(wa).getByText(/shows no WhatsApp button/)).toBeTruthy();
    await user.type(
      within(wa).getByLabelText(/^WhatsApp number/),
      "98765 43210",
    );
    await user.click(within(wa).getByRole("button", { name: "Save WhatsApp" }));
    expect(
      await within(wa).findByText(/shows a WhatsApp button with this number/),
    ).toBeTruthy();
  });
});
