// The contract every payment provider must pass before it is wired in
// (Phase 18 preparation). A live adapter supplies a driver that can make its
// sandbox produce each outcome; the mock's driver is in-process.
import { describe, expect, it } from "vitest";

import { InvalidWebhook, type PaymentProvider } from "./provider.ts";

export type ContractDriver = {
  /** Makes the provider report an outcome and returns the webhook it would send. */
  deliver(
    providerPaymentId: string,
    outcome: "success" | "failure",
  ): Promise<{ rawBody: Buffer; headers: Record<string, string> }>;
};

export function describeProviderContract(
  name: string,
  make: () => { provider: PaymentProvider; driver: ContractDriver },
) {
  describe(`payment provider contract: ${name}`, () => {
    it("creates a payment with an ID and a client payload, never echoing a secret", async () => {
      const { provider } = make();
      const p = await provider.createPayment({
        orderNumber: "SP-2610-000001",
        amountPaise: 349_900,
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
      });
      expect(p.providerPaymentId).toMatch(/\S{8,}/);
      expect(JSON.stringify(p.clientPayload)).not.toMatch(
        /secret|key_live|sk_/i,
      );
    });

    it("verifies its own webhook and reports the amount and currency", async () => {
      const { provider, driver } = make();
      const p = await provider.createPayment({
        orderNumber: "SP-2610-000002",
        amountPaise: 349_900,
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      });
      const d = await driver.deliver(p.providerPaymentId, "success");
      const e = provider.verifyWebhook(d.rawBody, d.headers);
      expect(e).toMatchObject({
        type: "payment.captured",
        providerPaymentId: p.providerPaymentId,
        amountPaise: 349_900,
        currency: "INR",
      });
      expect(e.providerEventId).toMatch(/\S+/);
      expect(await provider.fetchStatus(p.providerPaymentId)).toBe("CAPTURED");
    });

    it("rejects a missing signature, a tampered body and a foreign signature", async () => {
      const { provider, driver } = make();
      const p = await provider.createPayment({
        orderNumber: "SP-2610-000003",
        amountPaise: 100_000,
        idempotencyKey: "00000000-0000-4000-8000-000000000003",
      });
      const d = await driver.deliver(p.providerPaymentId, "success");
      expect(() => provider.verifyWebhook(d.rawBody, {})).toThrow(
        InvalidWebhook,
      );
      const tampered = Buffer.from(d.rawBody.toString().replace("100000", "1"));
      expect(() => provider.verifyWebhook(tampered, d.headers)).toThrow(
        InvalidWebhook,
      );
      const other = make();
      expect(() => other.provider.verifyWebhook(d.rawBody, d.headers)).toThrow(
        InvalidWebhook,
      );
    });

    it("reports failures", async () => {
      const { provider, driver } = make();
      const p = await provider.createPayment({
        orderNumber: "SP-2610-000004",
        amountPaise: 100_000,
        idempotencyKey: "00000000-0000-4000-8000-000000000004",
      });
      const d = await driver.deliver(p.providerPaymentId, "failure");
      expect(provider.verifyWebhook(d.rawBody, d.headers).type).toBe(
        "payment.failed",
      );
      expect(await provider.fetchStatus(p.providerPaymentId)).toBe("FAILED");
    });

    it("refunds with a provider reference", async () => {
      const { provider } = make();
      const r = await provider.refund({
        providerPaymentId: "any",
        amountPaise: 100,
        reason: "TEST",
      });
      expect(r.providerRefundId).toMatch(/\S+/);
      expect(["PENDING", "REFUNDED", "FAILED"]).toContain(r.status);
    });
  });
}
