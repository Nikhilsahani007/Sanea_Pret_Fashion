// MockPaymentProvider (D-107): simulates a hosted payment page, success,
// failure and a payment that never completes, with HMAC-signed webhooks so
// the real verification path runs. It refuses to load in production, and the
// configuration refuses PAYMENT_PROVIDER=mock there too.
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  InvalidWebhook,
  type PaymentProvider,
  type ProviderPaymentStatus,
  type WebhookEvent,
} from "./provider.ts";

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

export type MockOutcome = "success" | "failure" | "timeout";

export type MockProvider = PaymentProvider & {
  /** Builds the signed webhook the "gateway" would send for an outcome; `null` for a timeout. */
  simulate(
    providerPaymentId: string,
    outcome: MockOutcome,
  ): { rawBody: Buffer; headers: Record<string, string> } | null;
  /** Signs any body, for tests of tampered or mismatched events. */
  sign(rawBody: Buffer): string;
};

type Stored = { amountPaise: number; status: ProviderPaymentStatus };

export function createMockProvider(options: {
  nodeEnv: "development" | "test" | "production";
  secret: string | null;
}): MockProvider {
  if (options.nodeEnv === "production")
    throw new Error("The mock payment provider cannot load in production");
  const secret = options.secret ?? randomBytes(32).toString("base64url");
  const payments = new Map<string, Stored>();
  const sign = (raw: Buffer) =>
    createHmac("sha256", secret).update(raw).digest("hex");

  return {
    name: "mock",
    gatewayRefunds: false,
    sign,

    async createPayment({ amountPaise }) {
      const providerPaymentId = `mock_pay_${randomUUID()}`;
      payments.set(providerPaymentId, { amountPaise, status: "CREATED" });
      return {
        providerPaymentId,
        // The storefront's stand-in for a gateway's hosted page.
        clientPayload: {
          provider: "mock",
          payPath: `/checkout/pay/mock/${providerPaymentId}`,
        },
      };
    },

    simulate(providerPaymentId, outcome) {
      const stored = payments.get(providerPaymentId);
      if (!stored) return null;
      if (outcome === "timeout") return null;
      stored.status = outcome === "success" ? "CAPTURED" : "FAILED";
      const body = {
        id: `mock_evt_${randomUUID()}`,
        type: outcome === "success" ? "payment.captured" : "payment.failed",
        providerPaymentId,
        amountPaise: stored.amountPaise,
        currency: "INR",
        ...(outcome === "failure"
          ? { failureCode: "MOCK_DECLINED", failureMessage: "TEST decline" }
          : {}),
      };
      const rawBody = Buffer.from(JSON.stringify(body));
      return {
        rawBody,
        headers: {
          "content-type": "application/json",
          [MOCK_SIGNATURE_HEADER]: sign(rawBody),
        },
      };
    },

    verifyWebhook(rawBody, headers): WebhookEvent {
      const given = headers[MOCK_SIGNATURE_HEADER];
      if (typeof given !== "string" || !/^[0-9a-f]{64}$/.test(given))
        throw new InvalidWebhook("SIGNATURE_MISSING");
      const expected = Buffer.from(sign(rawBody), "hex");
      if (!timingSafeEqual(expected, Buffer.from(given, "hex")))
        throw new InvalidWebhook("SIGNATURE_MISMATCH");
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
      } catch {
        throw new InvalidWebhook("BODY_INVALID");
      }
      const { id, type, providerPaymentId, amountPaise, currency } = body;
      if (
        typeof id !== "string" ||
        (type !== "payment.captured" && type !== "payment.failed") ||
        typeof providerPaymentId !== "string" ||
        typeof amountPaise !== "number" ||
        !Number.isInteger(amountPaise) ||
        typeof currency !== "string"
      )
        throw new InvalidWebhook("BODY_INVALID");
      return {
        providerEventId: id,
        type,
        providerPaymentId,
        amountPaise,
        currency,
        ...(typeof body.failureCode === "string"
          ? { failureCode: body.failureCode }
          : {}),
        ...(typeof body.failureMessage === "string"
          ? { failureMessage: body.failureMessage }
          : {}),
        payload: body,
      };
    },

    async fetchStatus(providerPaymentId) {
      const stored = payments.get(providerPaymentId);
      return {
        status: stored?.status ?? "CREATED",
        amountPaise: stored?.amountPaise ?? null,
      };
    },

    async refund() {
      return {
        providerRefundId: `mock_rfnd_${randomUUID()}`,
        status: "REFUNDED",
      };
    },

    async fetchRefundStatus() {
      return "REFUNDED";
    },
  };
}
