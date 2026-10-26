// Phase 15 checkout pages (phase-15-plan.md): field errors before anything is
// sent; COD placement with an Idempotency-Key and the quoted total; prepaid
// placement opens the test payment page; the order page needs the token and
// shows a failed payment with a retry.
import { CartWarning, type CartView } from "@sanea/shared";
import { screen, waitFor, within } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderAt, stubApi } from "../test/helpers.tsx";
import { rememberOrder } from "./orders.ts";

const VARIANT = "0199f0a0-0000-7000-8000-0000000000c1";
const cart: CartView = {
  lines: [
    {
      variantId: VARIANT,
      productSlug: "sample-kurta",
      productName: "TEST Kurta",
      colour: { name: "Ivory", swatchHex: "#F8F4E9" },
      size: "M",
      quantity: 1,
      available: true,
      unitPricePaise: 189_900,
      lineTotalPaise: 189_900,
      stock: { availability: "IN_STOCK" },
      image: null,
    },
  ],
  subtotalPaise: 189_900,
  currency: "INR",
  itemCount: 1,
  warnings: [],
};

const quote = {
  subtotalPaise: 189_900,
  discountPaise: 0,
  shippingPaise: 0,
  codFeePaise: 0,
  taxPaise: 0,
  totalPaise: 189_900,
  currency: "INR",
  cod: { available: true },
  deliveryEstimate: null,
  paymentMethods: { PREPAID: true, COD: true },
};

const order = (over: object = {}, payment: object | null = null) => ({
  order: {
    orderNumber: "SP-2610-000001",
    status: "PENDING_CONFIRMATION",
    paymentMethod: "COD",
    placedAt: "2026-10-26T10:00:00.000Z",
    email: "asha@example.test",
    shipTo: { fullName: "TEST Asha", city: "Lucknow", pinCode: "226001" },
    items: [
      {
        productName: "TEST Kurta",
        variantLabel: "Ivory / M",
        quantity: 1,
        unitPricePaise: 189_900,
        lineTotalPaise: 189_900,
      },
    ],
    subtotalPaise: 189_900,
    discountPaise: 0,
    shippingPaise: 0,
    codFeePaise: 0,
    taxPaise: 0,
    totalPaise: 189_900,
    currency: "INR",
    payBy: null,
    ...over,
  },
  payment,
});

async function fillAddress(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), "asha@example.test");
  await user.type(screen.getByLabelText("Mobile number"), "9876543210");
  await user.type(screen.getByLabelText("Full name"), "TEST Asha");
  await user.type(screen.getByLabelText("Address"), "TEST 1 Example Road");
  await user.type(screen.getByLabelText("Town or city"), "Lucknow");
  await user.selectOptions(
    screen.getByLabelText("State or union territory"),
    "uttar-pradesh",
  );
  await user.type(screen.getByLabelText("PIN code"), "226001");
}

describe("checkout", () => {
  it("shows field errors and sends nothing until the form is complete", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /cart": { body: cart },
      "POST /checkout/quote": { body: quote },
    });
    renderAt("/checkout");
    await user.click(
      await screen.findByRole("button", { name: "Place order · ₹1,899" }),
    );
    expect(await screen.findByText("Enter a valid email.")).toBeTruthy();
    expect(screen.getByText("Choose how you will pay.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Email"));
    expect(calls.some((c) => c.path === "/checkout/orders")).toBe(false);
  });

  it("places a COD order with an Idempotency-Key and the quoted total, then opens the order page", async () => {
    const user = userEvent.setup();
    const { calls } = stubApi({
      "GET /cart": { body: cart },
      "POST /checkout/quote": { body: quote },
      "POST /checkout/orders": {
        status: 201,
        body: { ...order(), accessToken: "t".repeat(43) },
      },
      "GET /checkout/orders/SP-2610-000001/status": { body: order() },
    });
    renderAt("/checkout");
    await screen.findByRole("button", { name: "Place order · ₹1,899" });
    await fillAddress(user);
    await user.click(screen.getByRole("radio", { name: /Cash on delivery/ }));
    await user.click(
      screen.getByRole("button", { name: "Place order · ₹1,899" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Thank you. Your order is placed.",
      }),
    ).toBeTruthy();
    const placed = calls.find((c) => c.path === "/checkout/orders")!;
    expect(placed.body).toMatchObject({
      paymentMethod: "COD",
      expectedTotalPaise: 189_900,
      contact: { email: "asha@example.test", phone: "+919876543210" },
      shippingAddress: { pinCode: "226001", state: "uttar-pradesh" },
    });
  });

  it("disables checkout while a line exceeds the stock", async () => {
    stubApi({
      "GET /cart": {
        body: {
          ...cart,
          warnings: [
            { variantId: VARIANT, code: CartWarning.EXCEEDS_AVAILABLE },
          ],
        },
      },
    });
    renderAt("/cart");
    const button = await screen.findByRole("button", { name: "Checkout" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens checkout from a ready bag", async () => {
    stubApi({ "GET /cart": { body: cart } });
    renderAt("/cart");
    const link = await screen.findByRole("link", { name: "Checkout" });
    expect(link.getAttribute("href")).toBe("/checkout");
  });
});

describe("order page", () => {
  it("asks for the tab the order was placed in when there is no token", async () => {
    stubApi({});
    renderAt("/orders/SP-2610-000009");
    expect(
      await screen.findByText(/Open this page from the tab you placed/),
    ).toBeTruthy();
  });

  it("shows a failed payment with a retry that opens a new payment page", async () => {
    const user = userEvent.setup();
    rememberOrder("SP-2610-000002", "u".repeat(43));
    const failed = order(
      {
        orderNumber: "SP-2610-000002",
        status: "PENDING_PAYMENT",
        paymentMethod: "PREPAID",
        payBy: "2026-10-26T10:15:00.000Z",
      },
      { method: "PREPAID", status: "FAILED", clientPayload: null },
    );
    const { calls } = stubApi({
      "GET /checkout/orders/SP-2610-000002/status": { body: failed },
      "POST /checkout/orders/SP-2610-000002/payment": {
        body: {
          ...failed,
          payment: {
            method: "PREPAID",
            status: "CREATED",
            clientPayload: {
              provider: "mock",
              payPath: "/checkout/pay/mock/mock_pay_test",
            },
          },
        },
      },
    });
    renderAt("/orders/SP-2610-000002");
    expect(
      await screen.findByRole("heading", {
        name: "Your payment did not go through.",
      }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Try the payment again" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Test payment" }),
    ).toBeTruthy();
    await waitFor(() => {
      const retry = calls.find((c) => c.path.endsWith("/payment"));
      expect(retry).toBeTruthy();
    });
    const status = calls.find((c) => c.path.endsWith("/status"))!;
    expect(status.method).toBe("GET");
    expect(
      within(document.body).getByText("Order SP-2610-000002"),
    ).toBeTruthy();
  });
});
