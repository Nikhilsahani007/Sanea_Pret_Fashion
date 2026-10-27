// The PhonePe adapter against a fake PhonePe (Phase 18, D-195): the token is
// fetched once and renewed, a 401 renews it once, requests carry the fields
// of PhonePe's SDK, only a phonepe.com page is accepted, webhooks need the
// SHA-256 of "username:password", and states map onto ours.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createPhonePeProvider,
  isPhonePeUrl,
  merchantOrderId,
  PhonePeError,
} from "./phonepe.ts";
import { InvalidWebhook } from "./provider.ts";

const config = {
  env: "sandbox" as const,
  clientId: "TEST_CLIENT",
  clientSecret: "TEST_SECRET",
  clientVersion: "1",
  webhookUsername: "hook-user",
  webhookPassword: "hook-pass",
  storefrontOrigin: "https://shop.example",
  expireAfterMinutes: 15,
};
const SANDBOX = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const AUTH = createHash("sha256").update("hook-user:hook-pass").digest("hex");

type Call = { url: string; init: RequestInit };

function fakePhonePe(
  answer: (call: Call, n: number) => { status?: number; body: unknown },
  clock: () => number = () => 1000,
) {
  const calls: Call[] = [];
  const fake = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init };
    calls.push(call);
    const a = call.url.endsWith("/v1/oauth/token")
      ? {
          body: {
            access_token: `tok${calls.filter((c) => c.url.endsWith("/token")).length}`,
            token_type: "O-Bearer",
            issued_at: clock(),
            expires_at: clock() + 3600,
          },
        }
      : answer(call, calls.length);
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200 });
  }) as typeof fetch;
  return { fetch: fake, calls };
}

const PAGE = "https://mercury-uat.phonepe.com/transact/uat_v2?token=abc";

describe("PhonePe provider", () => {
  it("creates a payment with the SDK's fields and a cached token", async () => {
    const pp = fakePhonePe(() => ({
      body: {
        orderId: "OMO1",
        state: "PENDING",
        expireAt: 1,
        redirectUrl: PAGE,
      },
    }));
    const provider = createPhonePeProvider(config, {
      fetch: pp.fetch,
      nowSeconds: () => 1500,
    });
    const first = await provider.createPayment({
      orderNumber: "SP-2026-000123",
      amountPaise: 749_000,
      idempotencyKey: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    });
    expect(first).toEqual({
      providerPaymentId: "SP-2026-000123_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      clientPayload: { provider: "phonepe", redirectUrl: PAGE },
    });
    await provider.createPayment({
      orderNumber: "SP-2026-000124",
      amountPaise: 100,
      idempotencyKey: "x",
    });

    const [token, pay] = pp.calls;
    expect(token!.url).toBe(`${SANDBOX}/v1/oauth/token`);
    expect(
      Object.fromEntries(new URLSearchParams(String(token!.init.body))),
    ).toEqual({
      client_id: "TEST_CLIENT",
      client_secret: "TEST_SECRET",
      client_version: "1",
      grant_type: "client_credentials",
    });
    expect(pay!.url).toBe(`${SANDBOX}/checkout/v2/pay`);
    expect((pay!.init.headers as Record<string, string>).Authorization).toBe(
      "O-Bearer tok1",
    );
    expect(JSON.parse(String(pay!.init.body))).toEqual({
      merchantOrderId: "SP-2026-000123_0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
      amount: 749_000,
      expireAfter: 900,
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Sanéa Pret order SP-2026-000123",
        merchantUrls: {
          redirectUrl: "https://shop.example/orders/SP-2026-000123",
        },
      },
    });
    // One token for both payments.
    expect(pp.calls.filter((c) => c.url.endsWith("/token"))).toHaveLength(1);
  });

  it("renews the token half-way through its life and after a 401", async () => {
    let now = 1500;
    let reject = false;
    const pp = fakePhonePe(
      () => {
        if (reject) {
          reject = false;
          return { status: 401, body: { code: "UNAUTHORIZED" } };
        }
        return { body: { state: "PENDING", amount: 100 } };
      },
      () => now,
    );
    const provider = createPhonePeProvider(config, {
      fetch: pp.fetch,
      nowSeconds: () => now,
    });
    await provider.fetchStatus("A");
    now = 3301; // past 1500 + 3600 / 2
    await provider.fetchStatus("A");
    reject = true;
    await provider.fetchStatus("A");
    const tokens = pp.calls.filter((c) => c.url.endsWith("/token"));
    expect(tokens).toHaveLength(3);
    const last = pp.calls.at(-1)!;
    expect((last.init.headers as Record<string, string>).Authorization).toBe(
      "O-Bearer tok3",
    );
  });

  it("refuses a payment page that is not PhonePe's, and reports errors without secrets", async () => {
    const evil = fakePhonePe(() => ({
      body: { redirectUrl: "https://evil.example/pay" },
    }));
    const provider = createPhonePeProvider(config, { fetch: evil.fetch });
    await expect(
      provider.createPayment({
        orderNumber: "A",
        amountPaise: 100,
        idempotencyKey: "k",
      }),
    ).rejects.toThrow("REDIRECT_URL_INVALID");

    const down = fakePhonePe(() => ({
      status: 500,
      body: { code: "INTERNAL_SERVER_ERROR" },
    }));
    const failing = createPhonePeProvider(config, { fetch: down.fetch });
    const error = await failing
      .createPayment({
        orderNumber: "A",
        amountPaise: 100,
        idempotencyKey: "k",
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PhonePeError);
    expect(String((error as Error).message)).toBe(
      "PhonePe pay failed (500 INTERNAL_SERVER_ERROR)",
    );
    expect(String((error as Error).message)).not.toContain("TEST_SECRET");
  });

  it("maps order and refund states, and sends a refund with our refund ID", async () => {
    const states = ["COMPLETED", "FAILED", "PENDING"];
    const pp = fakePhonePe((call) => {
      if (call.url.includes("/checkout/v2/order/"))
        return { body: { state: states.shift(), amount: 500 } };
      if (call.url.endsWith("/payments/v2/refund"))
        return { body: { refundId: "OMR1", amount: 500, state: "PENDING" } };
      if (call.url.includes("/refund/missing/"))
        return { status: 404, body: { code: "NOT_FOUND" } };
      return { body: { state: "COMPLETED" } };
    });
    const provider = createPhonePeProvider(config, { fetch: pp.fetch });
    expect(await provider.fetchStatus("M1")).toEqual({
      status: "CAPTURED",
      amountPaise: 500,
    });
    expect((await provider.fetchStatus("M1")).status).toBe("FAILED");
    expect((await provider.fetchStatus("M1")).status).toBe("CREATED");
    expect(pp.calls[1]!.url).toBe(
      `${SANDBOX}/checkout/v2/order/M1/status?details=false`,
    );

    expect(
      await provider.refund({
        providerPaymentId: "M1",
        refundId: "R1",
        amountPaise: 500,
        reason: "x",
      }),
    ).toEqual({ providerRefundId: "R1", status: "PENDING" });
    const refund = pp.calls.find((c) => c.url.endsWith("/payments/v2/refund"))!;
    expect(JSON.parse(String(refund.init.body))).toEqual({
      merchantRefundId: "R1",
      originalMerchantOrderId: "M1",
      amount: 500,
    });
    expect(await provider.fetchRefundStatus("R1")).toBe("REFUNDED");
    expect(await provider.fetchRefundStatus("missing")).toBe("NOT_FOUND");
  });

  it("accepts only webhooks carrying SHA-256 of username:password, and maps their events", () => {
    const provider = createPhonePeProvider(config, {
      fetch: fakePhonePe(() => ({ body: {} })).fetch,
    });
    const body = (event: string, payload: object) =>
      Buffer.from(JSON.stringify({ event, payload }));
    const paid = body("checkout.order.completed", {
      merchantOrderId: "M1",
      orderId: "OMO1",
      state: "COMPLETED",
      amount: 500,
    });

    expect(() => provider.verifyWebhook(paid, {})).toThrow(InvalidWebhook);
    expect(() =>
      provider.verifyWebhook(paid, {
        authorization: createHash("sha256")
          .update("hook-user:wrong")
          .digest("hex"),
      }),
    ).toThrow("SIGNATURE_MISMATCH");
    expect(() =>
      provider.verifyWebhook(Buffer.from("{not json"), { authorization: AUTH }),
    ).toThrow("BODY_INVALID");

    const event = provider.verifyWebhook(paid, { authorization: AUTH });
    expect(event).toMatchObject({
      providerEventId: "checkout.order.completed:OMO1:COMPLETED",
      type: "payment.captured",
      providerPaymentId: "M1",
      amountPaise: 500,
      currency: "INR",
    });
    // A replay is the same event ID, so it is stored once.
    expect(
      provider.verifyWebhook(paid, { authorization: AUTH.toUpperCase() })
        .providerEventId,
    ).toBe(event.providerEventId);

    expect(
      provider.verifyWebhook(
        body("checkout.order.failed", {
          merchantOrderId: "M1",
          orderId: "OMO1",
          state: "FAILED",
          amount: 500,
          errorCode: "PAYMENT_DECLINED",
        }),
        { authorization: AUTH },
      ),
    ).toMatchObject({
      type: "payment.failed",
      failureCode: "PAYMENT_DECLINED",
    });

    // The SDK's enum names work too.
    expect(
      provider.verifyWebhook(
        Buffer.from(
          JSON.stringify({
            type: "PG_REFUND_COMPLETED",
            payload: {
              originalMerchantOrderId: "M1",
              merchantRefundId: "R1",
              refundId: "OMR1",
              state: "COMPLETED",
              amount: 500,
            },
          }),
        ),
        { authorization: AUTH },
      ),
    ).toMatchObject({
      type: "refund.completed",
      providerPaymentId: "M1",
      providerRefundId: "R1",
      providerEventId: "PG_REFUND_COMPLETED:OMR1:COMPLETED",
    });

    expect(
      provider.verifyWebhook(
        body("checkout.transaction.attempt.failed", {
          merchantOrderId: "M1",
          orderId: "OMO1",
          state: "PENDING",
        }),
        { authorization: AUTH },
      ).type,
    ).toBe("ignored");
  });

  it("builds merchant order IDs within PhonePe's limits and accepts only phonepe.com pages", () => {
    const id = merchantOrderId(
      "SP/2026 #1".repeat(5),
      "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b",
    );
    expect(id.length).toBeLessThanOrEqual(63);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(isPhonePeUrl(PAGE)).toBe(true);
    expect(isPhonePeUrl("http://mercury.phonepe.com/x")).toBe(false);
    expect(isPhonePeUrl("https://phonepe.com.evil.example/x")).toBe(false);
    expect(isPhonePeUrl("javascript:alert(1)")).toBe(false);
  });
});
