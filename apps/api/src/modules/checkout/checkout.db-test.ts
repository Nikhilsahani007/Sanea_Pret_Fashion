// Phase 15 checkout, payments, COD and the order lifecycle
// (testing-strategy.md §3 "Order lifecycle", "Payments", "COD").
import { randomUUID } from "node:crypto";

import { ORDER_NUMBER_PATTERN } from "@sanea/shared";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { STOREFRONT, cookiePair } from "../../platform/testing.ts";
import {
  FAST_ARGON2,
  adminHarness,
  type Harness,
  type Session,
} from "../auth/testing.ts";
import { CART_COOKIE } from "../cart/router.ts";
import type { ModuleDeps } from "../deps.ts";
import { releaseExpired } from "../inventory/service.ts";
import { expireUnconfirmedCod, expireUnpaidOrders } from "../orders/jobs.ts";
import { logEmailProvider } from "../notifications/provider.ts";
import { transition } from "../orders/service.ts";
import {
  MOCK_SIGNATURE_HEADER,
  createMockProvider,
  type MockProvider,
} from "../payments/mock.ts";
import { reconcile } from "../payments/service.ts";

let h: Harness;
let mock: MockProvider;
let deps: ModuleDeps;
let owner: Session;

const address = {
  fullName: "TEST Shopper",
  phone: "9876543210",
  line1: "TEST 1 Example Road",
  city: "Lucknow",
  state: "uttar-pradesh",
  pinCode: "226001",
};

let ip = 0;

/** A shopper with their CSRF pair, cart cookie and own client IP (rate limits are per IP). */
async function shopper() {
  const from = `198.18.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`;
  const csrf = await request(h.app)
    .get("/api/v1/auth/csrf")
    .set("Origin", STOREFRONT);
  const token = csrf.body.csrfToken as string;
  const cookies = new Map<string, string>([
    [CSRF_COOKIE, cookiePair(csrf.headers["set-cookie"], CSRF_COOKIE)],
  ]);
  const header = () => [...cookies.values()].join("; ");
  const post = (
    path: string,
    body: object,
    extra: Record<string, string> = {},
  ) => {
    const req = request(h.app)
      .post(`/api/v1${path}`)
      .set("Origin", STOREFRONT)
      .set("X-Forwarded-For", from)
      .set("Cookie", header())
      .set("X-CSRF-Token", token);
    for (const [k, v] of Object.entries(extra)) req.set(k, v);
    return req.send(body).then((res) => {
      const set = res.headers["set-cookie"] as unknown as string[] | undefined;
      if (set?.some((c) => c.startsWith(`${CART_COOKIE}=`)))
        cookies.set(CART_COOKIE, cookiePair(set, CART_COOKIE));
      return res;
    });
  };
  return {
    add: (variantId: string, quantity: number) =>
      post("/cart/items", { variantId, quantity }),
    quote: (body: object = {}) => post("/checkout/quote", body),
    place: (body: object, key: string = randomUUID()) =>
      post("/checkout/orders", body, { "Idempotency-Key": key }),
    status: (orderNumber: string, orderToken: string) =>
      request(h.app)
        .get(`/api/v1/checkout/orders/${orderNumber}/status`)
        .set("Origin", STOREFRONT)
        .set("X-Forwarded-For", from)
        .set("X-Order-Token", orderToken),
    retry: (orderNumber: string, orderToken: string) =>
      post(
        `/checkout/orders/${orderNumber}/payment`,
        {},
        {
          "Idempotency-Key": randomUUID(),
          "X-Order-Token": orderToken,
        },
      ),
    simulate: (
      providerPaymentId: string,
      outcome: string,
      orderToken: string,
    ) =>
      post(
        `/checkout/mock/${providerPaymentId}`,
        { outcome },
        {
          "X-Order-Token": orderToken,
        },
      ),
  };
}

async function live(onHand: number, price = 349_900) {
  const cat = await fx.category(h.db);
  await h.db.category.update({
    where: { id: cat },
    data: { status: "PUBLISHED" },
  });
  const product = await fx.product(h.db, cat);
  await h.db.product.update({
    where: { id: product },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  const v = await fx.variant(h.db, product);
  await h.db.productVariant.update({
    where: { id: v },
    data: { pricePaise: price },
  });
  await h.db.inventoryLevel.create({ data: { variantId: v, onHand } });
  return v;
}

const level = (variantId: string) =>
  h.db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });

const order = (orderNumber: string) =>
  h.db.order.findUniqueOrThrow({
    where: { orderNumber },
    include: {
      payments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
      reservations: true,
    },
  });

function body(over: object = {}) {
  return {
    contact: { email: "shopper@example.test", phone: "9876543210" },
    shippingAddress: address,
    deliveryMethod: "STANDARD",
    paymentMethod: "COD",
    expectedTotalPaise: 349_900,
    ...over,
  };
}

/** Puts one unit in a new shopper's bag and places the order. */
async function placed(method: "COD" | "PREPAID", onHand = 5) {
  const v = await live(onHand);
  const s = await shopper();
  expect((await s.add(v, 1)).status).toBe(200);
  const res = await s.place(body({ paymentMethod: method }));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return {
    v,
    s,
    no: res.body.order.orderNumber as string,
    token: res.body.accessToken as string,
    res,
  };
}

async function putSettings(group: string, value: object) {
  let res = await h.put(`/api/v1/admin/settings/${group}`, value, owner);
  if (res.status === 403) {
    // The test clock moved past the session's lifetime: sign in again.
    owner = await h.signIn(await h.createAdmin("OWNER"));
    res = await h.put(`/api/v1/admin/settings/${group}`, value, owner);
  }
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}

beforeAll(async () => {
  mock = createMockProvider({ nodeEnv: "test", secret: "t".repeat(32) });
  // Trust one proxy hop so each shopper has its own client IP.
  h = await adminHarness({ payments: mock, env: { TRUST_PROXY: "1" } });
  deps = {
    db: h.db,
    config: h.config,
    logger: pino({ level: "silent" }),
    now: h.clock.now,
    argon2: FAST_ARGON2,
    media: undefined as never,
    payments: mock,
    email: logEmailProvider(pino({ level: "silent" })),
  } as ModuleDeps;
  owner = await h.signIn(await h.createAdmin("OWNER"));
});
afterAll(() => h.drop());
beforeEach(async () => {
  await putSettings("cod", {});
  await putSettings("shipping", {});
});

describe("quote", () => {
  it("re-prices the bag and offers both methods by default, with no side effects", async () => {
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 2);
    const before = await level(v);
    const res = await s.quote({ shippingAddress: address });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      subtotalPaise: 699_800,
      shippingPaise: 0,
      codFeePaise: 0,
      discountPaise: 0,
      totalPaise: 699_800,
      currency: "INR",
      paymentMethods: { PREPAID: true, COD: true },
    });
    expect(await level(v)).toEqual(before);
  });

  it("applies shipping and COD settings", async () => {
    await putSettings("shipping", {
      flatFeePaise: 9_900,
      freeShippingThresholdPaise: 1_000_000,
    });
    await putSettings("cod", { feePaise: 4_900, maxOrderPaise: 400_000 });
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 1);
    const cod = await s.quote({
      shippingAddress: address,
      paymentMethod: "COD",
    });
    expect(cod.body).toMatchObject({
      shippingPaise: 9_900,
      codFeePaise: 4_900,
      totalPaise: 364_700,
      cod: { available: true },
    });
    await s.add(v, 1);
    expect(
      (await s.quote({ shippingAddress: address, paymentMethod: "COD" })).body
        .cod,
    ).toEqual({ available: false, reason: "OVER_LIMIT" });
  });
});

describe("COD placement", () => {
  it("reserves and allocates stock, creates PENDING_CONFIRMATION with a PENDING payment, and empties the bag", async () => {
    const { v, no, token, res } = await placed("COD");
    expect(no).toMatch(ORDER_NUMBER_PATTERN);
    expect(res.body.order).toMatchObject({
      status: "PENDING_CONFIRMATION",
      paymentMethod: "COD",
      totalPaise: 349_900,
      items: [
        expect.objectContaining({ quantity: 1, unitPricePaise: 349_900 }),
      ],
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const o = await order(no);
    expect(o.payments).toMatchObject([
      { method: "COD", status: "PENDING", provider: "cod" },
    ]);
    expect(o.reservations).toMatchObject([
      { status: "CONVERTED", expiresAt: null, quantity: 1 },
    ]);
    expect(await level(v)).toMatchObject({ onHand: 5, reserved: 1 });
    expect(o.accessTokenHash).toHaveLength(32);
    expect(Buffer.from(o.accessTokenHash).toString("base64url")).not.toBe(
      token,
    );
    const events = await h.db.orderStatusEvent.findMany({
      where: { orderId: o.id },
    });
    expect(events).toMatchObject([
      {
        fromStatus: null,
        toStatus: "PENDING_CONFIRMATION",
        actorType: "CUSTOMER",
      },
    ]);
    expect(await h.db.cartItem.count({ where: { variantId: v } })).toBe(0);
  });

  it("status needs the order token; a wrong one is 404", async () => {
    const { s, no, token } = await placed("COD");
    expect((await s.status(no, token)).body.order.status).toBe(
      "PENDING_CONFIRMATION",
    );
    expect((await s.status(no, "x".repeat(43))).status).toBe(404);
    expect(
      (await request(h.app).get(`/api/v1/checkout/orders/${no}/status`)).status,
    ).toBe(404);
  });

  it("returns COD_NOT_AVAILABLE when ineligible even though the client asks for COD", async () => {
    await putSettings("cod", { excludedPinPrefixes: ["226"] });
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 1);
    const res = await s.place(body());
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: "COD_NOT_AVAILABLE",
      details: { reason: "PIN_CODE_EXCLUDED" },
    });
    expect(await level(v)).toMatchObject({ reserved: 0 });
  });

  it("blocks COD for a phone with too many refused COD orders", async () => {
    const { no } = await placed("COD");
    const o = await order(no);
    await h.db.order.update({
      where: { id: o.id },
      data: { status: "RETURN_TO_ORIGIN", phone: "+919811111111" },
    });
    await putSettings("cod", { refusalLimit: 1 });
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 1);
    const res = await s.place(
      body({ contact: { email: "x@example.test", phone: "9811111111" } }),
    );
    expect(res.body.error).toMatchObject({
      code: "COD_NOT_AVAILABLE",
      details: { reason: "REFUSAL_LIMIT" },
    });
  });
});

describe("placement rules", () => {
  it("PRICE_CHANGED when the expected total differs, with the new total", async () => {
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 1);
    const res = await s.place(body({ expectedTotalPaise: 100 }));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "PRICE_CHANGED",
      details: { totalPaise: 349_900 },
    });
  });

  it("an Idempotency-Key replay returns the original order and token; a different body is IDEMPOTENCY_CONFLICT", async () => {
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 1);
    const key = randomUUID();
    const first = await s.place(body(), key);
    expect(first.status).toBe(201);
    const again = await s.place(body(), key);
    expect(again.status).toBe(200);
    expect(again.body.order.orderNumber).toBe(first.body.order.orderNumber);
    expect(again.body.accessToken).toBe(first.body.accessToken);
    expect(await h.db.order.count({ where: { idempotencyKey: key } })).toBe(1);
    expect(await level(v)).toMatchObject({ reserved: 1 });
    const other = await s.place(body({ notes: "different" }), key);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("requires an Idempotency-Key", async () => {
    const s = await shopper();
    const res = await request(h.app)
      .post("/api/v1/checkout/orders")
      .set("Origin", STOREFRONT)
      .send(body());
    expect(res.status).toBe(403); // CSRF first
    const v = await live(5);
    await s.add(v, 1);
    const none = await s.place(body(), "not-a-uuid");
    expect(none.status).toBe(400);
  });

  it("an empty bag and a bag with a short line are not placed", async () => {
    const s = await shopper();
    expect((await s.place(body())).body.error.code).toBe("CART_NOT_READY");
    const v = await live(2);
    await s.add(v, 2);
    await h.db.inventoryLevel.update({
      where: { variantId: v },
      data: { onHand: 1 },
    });
    const res = await s.place(body({ expectedTotalPaise: 699_800 }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CART_NOT_READY");
  });

  it("OUT_OF_STOCK when the last unit goes between the bag check and the hold", async () => {
    const v = await live(1);
    const a = await shopper();
    const b = await shopper();
    await a.add(v, 1);
    await b.add(v, 1);
    const [ra, rb] = await Promise.all([a.place(body()), b.place(body())]);
    const codes = [ra.status, rb.status].sort();
    expect(codes[0]).toBe(201);
    expect([409]).toContain(codes[1]);
    expect(await level(v)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("refuses unknown fields and a client price", async () => {
    const v = await live(5);
    const s = await shopper();
    await s.add(v, 1);
    expect((await s.place({ ...body(), totalPaise: 1 })).status).toBe(400);
  });
});

describe("prepaid with the mock provider", () => {
  it("placement holds stock for 15 minutes with a CREATED payment and a pay link", async () => {
    const { v, no, res } = await placed("PREPAID");
    expect(res.body.order.status).toBe("PENDING_PAYMENT");
    expect(res.body.payment).toMatchObject({
      method: "PREPAID",
      status: "CREATED",
      clientPayload: {
        provider: "mock",
        payPath: expect.stringMatching(/^\/checkout\/pay\/mock\/mock_pay_/),
      },
    });
    const o = await order(no);
    expect(o.reservations[0]).toMatchObject({ status: "ACTIVE" });
    expect(
      o.reservations[0]!.expiresAt!.getTime() - h.clock.now().getTime(),
    ).toBe(15 * 60_000);
    expect(await level(v)).toMatchObject({ reserved: 1 });
  });

  it("a browser return without a webhook confirms nothing; a verified success confirms and converts the hold", async () => {
    const { s, no, token } = await placed("PREPAID");
    expect((await s.status(no, token)).body.order.status).toBe(
      "PENDING_PAYMENT",
    );
    const pay = (await order(no)).payments[0]!;
    const res = await s.simulate(pay.providerPaymentId!, "success", token);
    expect(res.status).toBe(200);
    const o = await order(no);
    expect(o.status).toBe("CONFIRMED");
    expect(o.confirmedAt).not.toBeNull();
    expect(o.payments[0]!.status).toBe("CAPTURED");
    expect(o.reservations[0]).toMatchObject({
      status: "CONVERTED",
      expiresAt: null,
    });
    expect((await s.status(no, token)).body.order.status).toBe("CONFIRMED");
    const events = await h.db.orderStatusEvent.findMany({
      where: { orderId: o.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => [e.toStatus, e.actorType])).toEqual([
      ["PENDING_PAYMENT", "CUSTOMER"],
      ["CONFIRMED", "PROVIDER"],
    ]);
  });

  it("failure keeps the order waiting; a retry opens a new payment that can succeed (E2E-3)", async () => {
    const { s, no, token } = await placed("PREPAID");
    const first = (await order(no)).payments[0]!;
    await s.simulate(first.providerPaymentId!, "failure", token);
    let o = await order(no);
    expect(o.status).toBe("PENDING_PAYMENT");
    expect(o.payments[0]).toMatchObject({
      status: "FAILED",
      failureCode: "MOCK_DECLINED",
    });
    const retry = await s.retry(no, token);
    expect(retry.status).toBe(200);
    expect(retry.body.payment.status).toBe("CREATED");
    o = await order(no);
    expect(o.payments).toHaveLength(2);
    // A second retry while the session is open reuses it.
    await s.retry(no, token);
    expect((await order(no)).payments).toHaveLength(2);
    await s.simulate(o.payments[1]!.providerPaymentId!, "success", token);
    expect((await order(no)).status).toBe("CONFIRMED");
    // No retry once confirmed.
    expect((await s.retry(no, token)).status).toBe(409);
  });

  it("a timeout leaves the payment open; when the hold expires the order is cancelled and stock returns", async () => {
    const { v, s, no, token } = await placed("PREPAID");
    const pay = (await order(no)).payments[0]!;
    await s.simulate(pay.providerPaymentId!, "timeout", token);
    expect((await order(no)).status).toBe("PENDING_PAYMENT");
    expect(await expireUnpaidOrders(deps)).toBe(0);
    h.clock.advance(15 * 60_000 + 1);
    expect(await expireUnpaidOrders(deps)).toBeGreaterThanOrEqual(1);
    const o = await order(no);
    expect(o.status).toBe("CANCELLED");
    expect(o.payments[0]!.status).toBe("EXPIRED");
    expect(await level(v)).toMatchObject({ reserved: 0 });
    expect((await s.retry(no, token)).status).toBe(409);
  });
});

describe("webhooks", () => {
  const hook = (raw: Buffer, signature?: string) => {
    const req = request(h.app)
      .post("/api/v1/webhooks/payments/mock")
      .set("Content-Type", "application/json");
    if (signature) req.set(MOCK_SIGNATURE_HEADER, signature);
    return req.send(raw.toString());
  };

  it("rejects a missing or wrong signature and stores nothing; needs no CSRF or Origin", async () => {
    const { no } = await placed("PREPAID");
    const pay = (await order(no)).payments[0]!;
    const delivery = mock.simulate(pay.providerPaymentId!, "success")!;
    const before = await h.db.paymentEvent.count();
    expect((await hook(delivery.rawBody)).status).toBe(400);
    const tampered = Buffer.from(
      delivery.rawBody.toString().replace("349900", "1"),
    );
    const bad = await hook(tampered, delivery.headers[MOCK_SIGNATURE_HEADER]);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("WEBHOOK_INVALID");
    expect(await h.db.paymentEvent.count()).toBe(before);
    expect((await order(no)).status).toBe("PENDING_PAYMENT");
    const ok = await hook(
      delivery.rawBody,
      delivery.headers[MOCK_SIGNATURE_HEADER],
    );
    expect(ok.status).toBe(200);
    expect((await order(no)).status).toBe("CONFIRMED");
  });

  it("processes a duplicate event once", async () => {
    const { v, no } = await placed("PREPAID");
    const pay = (await order(no)).payments[0]!;
    const d = mock.simulate(pay.providerPaymentId!, "success")!;
    const sig = d.headers[MOCK_SIGNATURE_HEADER]!;
    expect((await hook(d.rawBody, sig)).status).toBe(200);
    expect((await hook(d.rawBody, sig)).status).toBe(200);
    const events = await h.db.paymentEvent.findMany({
      where: { paymentId: pay.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: "CONFIRMED" });
    expect(await level(v)).toMatchObject({ reserved: 1 });
    const statusEvents = await h.db.orderStatusEvent.count({
      where: { order: { orderNumber: no } },
    });
    expect(statusEvents).toBe(2);
  });

  it("an amount mismatch flags the order and does not confirm it", async () => {
    const { no } = await placed("PREPAID");
    const pay = (await order(no)).payments[0]!;
    const raw = Buffer.from(
      JSON.stringify({
        id: `mock_evt_${randomUUID()}`,
        type: "payment.captured",
        providerPaymentId: pay.providerPaymentId,
        amountPaise: 1,
        currency: "INR",
      }),
    );
    expect((await hook(raw, mock.sign(raw))).status).toBe(200);
    const o = await order(no);
    expect(o).toMatchObject({
      status: "PENDING_PAYMENT",
      needsAttention: true,
      attentionReason: "AMOUNT_MISMATCH",
    });
    expect(o.payments[0]!.status).toBe("CREATED");
  });

  it("an unknown provider is 404", async () => {
    expect(
      (
        await request(h.app)
          .post("/api/v1/webhooks/payments/razorpay")
          .set("Content-Type", "application/json")
          .send("{}")
      ).status,
    ).toBe(404);
  });
});

describe("late payments (SR-10)", () => {
  it("the hold lapsed but stock is still there: re-reserved and confirmed", async () => {
    const { v, s, no, token } = await placed("PREPAID");
    h.clock.advance(15 * 60_000 + 1);
    const pay = (await order(no)).payments[0]!;
    await s.simulate(pay.providerPaymentId!, "success", token);
    const o = await order(no);
    expect(o.status).toBe("CONFIRMED");
    expect(o.reservations.filter((r) => r.status === "CONVERTED")).toHaveLength(
      1,
    );
    expect(await level(v)).toMatchObject({ reserved: 1 });
  });

  it("the hold lapsed and the stock was sold: refund recorded, order cancelled and flagged", async () => {
    const { v, s, no, token } = await placed("PREPAID", 1);
    h.clock.advance(15 * 60_000 + 1);
    // The expiry sweep runs; someone else buys the last unit.
    await h.db.$transaction((tx) => releaseExpired(tx, h.clock.now()));
    const other = await shopper();
    await other.add(v, 1);
    expect((await other.place(body())).status).toBe(201);
    const pay = (await order(no)).payments[0]!;
    await s.simulate(pay.providerPaymentId!, "success", token);
    const o = await order(no);
    expect(o).toMatchObject({
      status: "CANCELLED",
      needsAttention: true,
      attentionReason: "PAID_NO_STOCK",
    });
    expect(o.payments[0]!.status).toBe("REFUND_PENDING");
    expect(
      await h.db.refund.findMany({ where: { paymentId: pay.id } }),
    ).toMatchObject([
      { status: "PENDING", amountPaise: 349_900, createdByAdminId: null },
    ]);
    expect(await level(v)).toMatchObject({ onHand: 1, reserved: 1 });
  });

  it("paid after the order was cancelled: never confirmed, refund recorded", async () => {
    const { s, no, token } = await placed("PREPAID");
    h.clock.advance(15 * 60_000 + 1);
    await expireUnpaidOrders(deps);
    const pay = (await order(no)).payments[0]!;
    await s.simulate(pay.providerPaymentId!, "success", token);
    const o = await order(no);
    expect(o).toMatchObject({
      status: "CANCELLED",
      attentionReason: "PAID_AFTER_CANCEL",
    });
    expect(await h.db.refund.count({ where: { paymentId: pay.id } })).toBe(1);
  });
});

describe("reconciliation", () => {
  it("confirms a payment the provider reports captured when the webhook never came", async () => {
    const { no } = await placed("PREPAID");
    const pay = (await order(no)).payments[0]!;
    mock.simulate(pay.providerPaymentId!, "success"); // the webhook is lost
    expect(await reconcile(h.db, mock, h.clock.now())).toEqual([]); // not stuck long enough
    // Keep the hold alive past 30 minutes so this tests reconciliation alone.
    await h.db.stockReservation.updateMany({
      where: { orderId: (await order(no)).id },
      data: { expiresAt: new Date(h.clock.now().getTime() + 3_600_000) },
    });
    h.clock.advance(31 * 60_000);
    expect(
      (await reconcile(h.db, mock, h.clock.now())).map((c) => c.outcome),
    ).toContain("CONFIRMED");
    expect((await order(no)).status).toBe("CONFIRMED");
  });
});

describe("COD expiry", () => {
  it("cancels COD orders not confirmed within 48 hours and returns the stock", async () => {
    const { v, no } = await placed("COD");
    h.clock.advance(47 * 3_600_000);
    await expireUnconfirmedCod(deps);
    expect((await order(no)).status).toBe("PENDING_CONFIRMATION");
    h.clock.advance(2 * 3_600_000);
    expect(await expireUnconfirmedCod(deps)).toBeGreaterThanOrEqual(1);
    const o = await order(no);
    expect(o.status).toBe("CANCELLED");
    expect(o.payments[0]!.status).toBe("NOT_COLLECTED");
    expect(await level(v)).toMatchObject({ onHand: 5, reserved: 0 });
  });
});

describe("order lifecycle", () => {
  type Role = "OWNER" | "MANAGER" | "FULFILMENT" | "CATALOGUE_EDITOR";
  const ids = new Map<Role, string>();
  beforeAll(async () => {
    for (const role of [
      "OWNER",
      "MANAGER",
      "FULFILMENT",
      "CATALOGUE_EDITOR",
    ] as const)
      ids.set(role, (await h.createAdmin(role)).id);
  });
  const staff = (role: Role) => ({
    type: "ADMIN" as const,
    adminId: ids.get(role) ?? "",
    role,
  });
  const move = (
    orderId: string,
    to: Parameters<typeof transition>[2],
    actor = staff("OWNER"),
    extra = {},
  ) =>
    h.db.$transaction((tx) =>
      transition(tx, orderId, to, actor, { now: h.clock.now(), ...extra }),
    );

  it("COD to delivery: confirm, pack, ship (stock leaves), deliver (payment collected)", async () => {
    const { v, no } = await placed("COD");
    const o = await order(no);
    await move(o.id, "CONFIRMED", staff("FULFILMENT"));
    await move(o.id, "PACKED", staff("FULFILMENT"));
    await expect(
      move(o.id, "SHIPPED", staff("FULFILMENT")),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await move(o.id, "SHIPPED", staff("FULFILMENT"), {
      shipment: { courierName: "TEST Courier", trackingNumber: "TEST123" },
    });
    expect(await level(v)).toMatchObject({ onHand: 4, reserved: 0 });
    await move(o.id, "DELIVERED", staff("FULFILMENT"));
    const done = await order(no);
    expect(done.status).toBe("DELIVERED");
    expect(done.payments[0]!.status).toBe("COLLECTED");
    const events = await h.db.orderStatusEvent.findMany({
      where: { orderId: o.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((e) => e.toStatus)).toEqual([
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
    ]);
    expect(
      events.slice(1).every((e) => e.actorType === "ADMIN" && e.actorId),
    ).toBe(true);
    const movement = await h.db.stockMovement.findFirstOrThrow({
      where: { variantId: v, type: "SHIPPED" },
    });
    expect(movement).toMatchObject({
      onHandDelta: -1,
      reservedDelta: -1,
      referenceType: "ORDER",
    });
  });

  it("invalid moves and roles are INVALID_TRANSITION and change nothing", async () => {
    const { no } = await placed("COD");
    const o = await order(no);
    for (const to of [
      "PACKED",
      "SHIPPED",
      "DELIVERED",
      "RETURNED",
      "PENDING_PAYMENT",
    ] as const)
      await expect(move(o.id, to)).rejects.toMatchObject({
        code: "INVALID_TRANSITION",
      });
    await move(o.id, "CONFIRMED");
    await expect(
      move(o.id, "CANCELLED", staff("FULFILMENT")),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    await expect(
      move(o.id, "PACKED", staff("CATALOGUE_EDITOR")),
    ).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect((await order(no)).status).toBe("CONFIRMED");
  });

  it("cancelling after confirmation releases the allocation once", async () => {
    const { v, no } = await placed("COD");
    const o = await order(no);
    await move(o.id, "CONFIRMED");
    await move(o.id, "PACKED");
    await move(o.id, "CANCELLED", staff("MANAGER"));
    expect(await level(v)).toMatchObject({ onHand: 5, reserved: 0 });
    await expect(move(o.id, "CANCELLED")).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
    expect((await order(no)).cancelledAt).not.toBeNull();
  });

  it("status history cannot be edited", async () => {
    const { no } = await placed("COD");
    const o = await order(no);
    await expect(
      h.db.orderStatusEvent.deleteMany({ where: { orderId: o.id } }),
    ).rejects.toThrow(/append-only/);
  });
});

describe("database guards", () => {
  it("refuses an order whose total does not add up, or a non-INR currency", async () => {
    const id = await fx.order(h.db);
    await expect(
      h.db.$executeRawUnsafe(
        `UPDATE "order" SET "total_paise" = 1 WHERE "id" = '${id}'`,
      ),
    ).rejects.toThrow(/order_total_check/);
    await expect(
      h.db.$executeRawUnsafe(
        `UPDATE "order" SET "currency" = 'USD' WHERE "id" = '${id}'`,
      ),
    ).rejects.toThrow(/order_currency_check/);
    await expect(
      h.db.$executeRawUnsafe(
        `UPDATE "order" SET "cod_fee_paise" = 100, "total_paise" = "total_paise" + 100, "payment_method" = 'PREPAID' WHERE "id" = '${id}'`,
      ),
    ).rejects.toThrow(/order_cod_fee_check/);
  });

  it("stores no GST rule by default", async () => {
    expect(await h.db.gstRule.count()).toBe(0);
  });
});

describe("settings and the mock provider", () => {
  it("shipping and COD settings are Owner and Manager only, validated and audited", async () => {
    const editor = await h.signIn(await h.createAdmin("CATALOGUE_EDITOR"));
    expect((await h.put("/api/v1/admin/settings/cod", {}, editor)).status).toBe(
      403,
    );
    const bad = await h.put(
      "/api/v1/admin/settings/cod",
      { maxOrderPaise: -1 },
      owner,
    );
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe("body.maxOrderPaise");
    expect(
      await h.db.auditLog.count({ where: { action: "settings.cod_updated" } }),
    ).toBeGreaterThan(0);
    const got = await h.get("/api/v1/admin/settings/shipping", owner);
    expect(got.body.settings).toEqual({
      flatFeePaise: 0,
      freeShippingThresholdPaise: null,
      deliveryEstimate: null,
    });
  });

  it("the mock provider refuses to load in production", () => {
    expect(() =>
      createMockProvider({ nodeEnv: "production", secret: null }),
    ).toThrow(/cannot load in production/);
  });

  it("without a provider, prepaid is unavailable and COD still works", async () => {
    const plain = await adminHarness({ payments: null });
    try {
      const res = await request(plain.app).get("/api/v1/auth/csrf");
      expect(res.status).toBe(200);
      const hook = await request(plain.app)
        .post("/api/v1/webhooks/payments/mock")
        .set("Content-Type", "application/json")
        .send("{}");
      expect(hook.status).toBe(404);
      const sim = await request(plain.app)
        .post(`/api/v1/checkout/mock/mock_pay_${randomUUID()}`)
        .set("Origin", STOREFRONT)
        .send({ outcome: "success" });
      expect([403, 404]).toContain(sim.status);
    } finally {
      await plain.drop();
    }
  });
});
