// Phase 18 against real PostgreSQL with a fake PhonePe (D-195): a prepaid
// order opens PhonePe's page; an authentic "order completed" webhook
// confirms it and a replay is stored once; a failure leaves it waiting for a
// retry; a forged webhook changes nothing; reconciliation asks PhonePe about
// a stuck payment and checks the amount; a staff refund is sent to PhonePe by
// the order job (not marked by hand) and settles from PhonePe's refund
// webhook or status. All data is synthetic, in a disposable database.
import { createHash, randomUUID } from "node:crypto";

import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { STOREFRONT, cookiePair } from "../../platform/testing.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";
import { CART_COOKIE } from "../cart/token.ts";
import { logEmailProvider } from "../notifications/provider.ts";
import { runOrderJobs, type OrderJobDeps } from "../orders/jobs.ts";
import { createPhonePeProvider } from "./phonepe.ts";
import type { PaymentProvider } from "./provider.ts";

const AUTH = createHash("sha256").update("hook-user:hook-pass").digest("hex");
const PAGE = "https://mercury-uat.phonepe.com/transact/uat_v2?token=t";

// What the fake PhonePe answers: order states and refund states by ID.
const orderState = new Map<string, { state: string; amount: number }>();
const refundState = new Map<string, string>();
const refundRequests: { merchantRefundId: string; amount: number }[] = [];

const fakeFetch = (async (url: string, init: RequestInit) => {
  const u = String(url);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  if (u.endsWith("/v1/oauth/token"))
    return json({
      access_token: "tok",
      token_type: "O-Bearer",
      issued_at: Math.floor(Date.now() / 1000),
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    });
  if (u.endsWith("/checkout/v2/pay")) {
    const b = JSON.parse(String(init.body)) as {
      merchantOrderId: string;
      amount: number;
    };
    orderState.set(b.merchantOrderId, { state: "PENDING", amount: b.amount });
    return json({
      orderId: `OMO-${b.merchantOrderId}`,
      state: "PENDING",
      redirectUrl: PAGE,
    });
  }
  const status = /\/checkout\/v2\/order\/([^/]+)\/status/.exec(u);
  if (status) {
    const s = orderState.get(decodeURIComponent(status[1]!));
    return s ? json(s) : json({ code: "NOT_FOUND" }, 404);
  }
  if (u.endsWith("/payments/v2/refund")) {
    const b = JSON.parse(String(init.body)) as {
      merchantRefundId: string;
      amount: number;
    };
    refundRequests.push(b);
    refundState.set(b.merchantRefundId, "PENDING");
    return json({
      refundId: `OMR-${b.merchantRefundId}`,
      amount: b.amount,
      state: "PENDING",
    });
  }
  const refund = /\/payments\/v2\/refund\/([^/]+)\/status/.exec(u);
  if (refund) {
    const s = refundState.get(decodeURIComponent(refund[1]!));
    return s ? json({ state: s }) : json({ code: "NOT_FOUND" }, 404);
  }
  return json({ code: "UNEXPECTED" }, 500);
}) as typeof fetch;

let h: Harness;
let phonepe: PaymentProvider;
let deps: OrderJobDeps;
let owner: Awaited<ReturnType<Harness["signIn"]>>;
let ip = 0;

beforeAll(async () => {
  phonepe = createPhonePeProvider(
    {
      env: "sandbox",
      clientId: "TEST",
      clientSecret: "TEST_SECRET",
      clientVersion: "1",
      webhookUsername: "hook-user",
      webhookPassword: "hook-pass",
      storefrontOrigin: STOREFRONT,
      expireAfterMinutes: 15,
    },
    { fetch: fakeFetch },
  );
  h = await adminHarness({ payments: phonepe, env: { TRUST_PROXY: "1" } });
  owner = await h.signIn(await h.createAdmin("OWNER"));
  deps = {
    db: h.db,
    config: h.config,
    logger: pino({ level: "silent" }),
    now: h.clock.now,
    payments: phonepe,
    email: logEmailProvider(pino({ level: "silent" })),
  };
});
afterAll(() => h.drop());

/** One unit in a new shopper's bag, placed as a prepaid order. */
async function placed() {
  const cat = await fx.category(h.db);
  await h.db.category.update({
    where: { id: cat },
    data: { status: "PUBLISHED" },
  });
  const product = await fx.product(h.db, cat);
  await h.db.product.update({
    where: { id: product },
    data: { status: "PUBLISHED", publishedAt: new Date("2026-10-01") },
  });
  const v = await fx.variant(h.db, product);
  await h.db.productVariant.update({
    where: { id: v },
    data: { pricePaise: 349_900 },
  });
  await h.db.inventoryLevel.create({ data: { variantId: v, onHand: 5 } });

  const from = `198.19.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`;
  const csrf = await request(h.app)
    .get("/api/v1/auth/csrf")
    .set("Origin", STOREFRONT);
  const cookies = new Map([
    [CSRF_COOKIE, cookiePair(csrf.headers["set-cookie"], CSRF_COOKIE)],
  ]);
  const post = async (
    path: string,
    body: object,
    extra: Record<string, string> = {},
  ) => {
    const req = request(h.app)
      .post(`/api/v1${path}`)
      .set("Origin", STOREFRONT)
      .set("X-Forwarded-For", from)
      .set("Cookie", [...cookies.values()].join("; "))
      .set("X-CSRF-Token", csrf.body.csrfToken as string);
    for (const [k, val] of Object.entries(extra)) req.set(k, val);
    const res = await req.send(body);
    const set = res.headers["set-cookie"] as unknown as string[] | undefined;
    if (set?.some((c) => c.startsWith(`${CART_COOKIE}=`)))
      cookies.set(CART_COOKIE, cookiePair(set, CART_COOKIE));
    return res;
  };
  expect(
    (await post("/cart/items", { variantId: v, quantity: 1 })).status,
  ).toBe(200);
  const res = await post(
    "/checkout/orders",
    {
      contact: { email: "shopper@example.test", phone: "9876543210" },
      shippingAddress: {
        fullName: "TEST Shopper",
        phone: "9876543210",
        line1: "TEST 1 Example Road",
        city: "Lucknow",
        state: "uttar-pradesh",
        pinCode: "226001",
      },
      deliveryMethod: "STANDARD",
      paymentMethod: "PREPAID",
      expectedTotalPaise: 349_900,
    },
    { "Idempotency-Key": randomUUID() },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const no = res.body.order.orderNumber as string;
  const payment = await h.db.payment.findFirstOrThrow({
    where: { order: { orderNumber: no } },
  });
  return { no, res, payment, v };
}

const orderOf = (orderNumber: string) =>
  h.db.order.findUniqueOrThrow({
    where: { orderNumber },
    include: { payments: { include: { refunds: true } } },
  });

function webhook(event: string, payload: object, auth: string | null = AUTH) {
  const req = request(h.app)
    .post("/api/v1/webhooks/payments/phonepe")
    .set("Content-Type", "application/json");
  if (auth) req.set("Authorization", auth);
  return req.send(JSON.stringify({ event, payload }));
}

describe("PhonePe payments (Phase 18)", () => {
  it("sends the shopper to PhonePe's page and confirms only from an authentic webhook, once", async () => {
    const { no, res, payment } = await placed();
    expect(res.body.payment.clientPayload).toEqual({
      provider: "phonepe",
      redirectUrl: PAGE,
    });
    expect(payment.provider).toBe("phonepe");
    const id = payment.providerPaymentId!;
    expect(orderState.get(id)).toEqual({ state: "PENDING", amount: 349_900 });

    const paid = {
      merchantOrderId: id,
      orderId: `OMO-${id}`,
      state: "COMPLETED",
      amount: 349_900,
    };
    // Forged: wrong or missing Authorization; nothing stored or changed.
    expect(
      (await webhook("checkout.order.completed", paid, "0".repeat(64))).status,
    ).toBe(400);
    expect((await webhook("checkout.order.completed", paid, null)).status).toBe(
      400,
    );
    expect(
      await h.db.paymentEvent.count({ where: { provider: "phonepe" } }),
    ).toBe(0);
    expect((await orderOf(no)).status).toBe("PENDING_PAYMENT");

    expect((await webhook("checkout.order.completed", paid)).status).toBe(200);
    const o = await orderOf(no);
    expect(o.status).toBe("CONFIRMED");
    expect(o.payments[0]!.status).toBe("CAPTURED");
    // A replay is stored once and changes nothing.
    expect((await webhook("checkout.order.completed", paid)).status).toBe(200);
    expect(
      await h.db.paymentEvent.count({
        where: { provider: "phonepe", paymentId: payment.id },
      }),
    ).toBe(1);
  });

  it("a failed payment waits for a retry; an amount that does not match is flagged, not confirmed", async () => {
    const failed = await placed();
    const fid = failed.payment.providerPaymentId!;
    await webhook("checkout.order.failed", {
      merchantOrderId: fid,
      orderId: `OMO-${fid}`,
      state: "FAILED",
      amount: 349_900,
      errorCode: "PAYMENT_DECLINED",
    });
    const f = await orderOf(failed.no);
    expect(f.status).toBe("PENDING_PAYMENT");
    expect(f.payments[0]).toMatchObject({
      status: "FAILED",
      failureCode: "PAYMENT_DECLINED",
    });

    const short = await placed();
    const sid = short.payment.providerPaymentId!;
    await webhook("checkout.order.completed", {
      merchantOrderId: sid,
      orderId: `OMO-${sid}`,
      state: "COMPLETED",
      amount: 100,
    });
    expect((await orderOf(short.no)).status).toBe("PENDING_PAYMENT");
    const event = await h.db.paymentEvent.findFirstOrThrow({
      where: { paymentId: short.payment.id },
    });
    expect(event.outcome).toBe("AMOUNT_MISMATCH");
  });

  it("reconciliation asks PhonePe about a stuck payment and applies what it reports", async () => {
    const { no, payment } = await placed();
    orderState.set(payment.providerPaymentId!, {
      state: "COMPLETED",
      amount: 349_900,
    });
    await h.db.payment.update({
      where: { id: payment.id },
      data: { createdAt: new Date(h.clock.now().getTime() - 31 * 60 * 1000) },
    });
    const r = await runOrderJobs(deps);
    expect(r.reconciled).toBeGreaterThanOrEqual(1);
    expect((await orderOf(no)).status).toBe("CONFIRMED");
  });

  it("sends a staff refund to PhonePe once, refuses marking it by hand, and settles it from PhonePe", async () => {
    const { no, payment } = await placed();
    const id = payment.providerPaymentId!;
    await webhook("checkout.order.completed", {
      merchantOrderId: id,
      orderId: `OMO-${id}`,
      state: "COMPLETED",
      amount: 349_900,
    });
    const recorded = await h.post(
      `/api/v1/admin/orders/${no}/refunds`,
      { amountPaise: 100_000, reason: "TEST partial refund" },
      owner,
    );
    expect(recorded.status, JSON.stringify(recorded.body)).toBe(201);
    const refundId = recorded.body.refund.id as string;

    // Not by hand: the gateway settles it.
    const byHand = await h.post(
      `/api/v1/admin/orders/${no}/refunds/${refundId}/complete`,
      { outcome: "REFUNDED", reference: "X" },
      owner,
    );
    expect(byHand.status).toBe(409);
    expect(byHand.body.error.details).toMatchObject({
      reason: "GATEWAY_REFUND",
    });

    // The job sends it; a second run asks for its status and does not resend.
    await runOrderJobs(deps);
    await runOrderJobs(deps);
    expect(
      refundRequests.filter((r) => r.merchantRefundId === refundId),
    ).toEqual([
      {
        merchantRefundId: refundId,
        originalMerchantOrderId: id,
        amount: 100_000,
      },
    ]);
    let o = await orderOf(no);
    expect(o.payments[0]!.status).toBe("REFUND_PENDING");
    expect(o.payments[0]!.refunds[0]).toMatchObject({
      status: "PENDING",
      providerRefundId: refundId,
    });

    // PhonePe's refund webhook settles it, once.
    const done = {
      originalMerchantOrderId: id,
      merchantRefundId: refundId,
      refundId: `OMR-${refundId}`,
      state: "COMPLETED",
      amount: 100_000,
    };
    expect((await webhook("pg.refund.completed", done)).status).toBe(200);
    expect((await webhook("pg.refund.completed", done)).status).toBe(200);
    o = await orderOf(no);
    expect(o.payments[0]!.refunds[0]!.status).toBe("REFUNDED");
    // Partly refunded: the payment stays captured.
    expect(o.payments[0]!.status).toBe("CAPTURED");
  });

  it("settles a refund from PhonePe's status when no webhook arrives", async () => {
    const { no, payment } = await placed();
    const id = payment.providerPaymentId!;
    await webhook("checkout.order.completed", {
      merchantOrderId: id,
      orderId: `OMO-${id}`,
      state: "COMPLETED",
      amount: 349_900,
    });
    const recorded = await h.post(
      `/api/v1/admin/orders/${no}/refunds`,
      { amountPaise: 349_900, reason: "TEST full refund" },
      owner,
    );
    const refundId = recorded.body.refund.id as string;
    await runOrderJobs(deps);
    refundState.set(refundId, "COMPLETED");
    await runOrderJobs(deps);
    const o = await orderOf(no);
    expect(o.payments[0]!.refunds[0]!.status).toBe("REFUNDED");
    expect(o.payments[0]!.status).toBe("REFUNDED");
  });
});
