import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createMockProvider } from "./mock.ts";
import { describeProviderContract } from "./provider-contract.ts";

describeProviderContract("mock", () => {
  const provider = createMockProvider({
    nodeEnv: "test",
    secret: randomBytes(32).toString("hex"),
  });
  return {
    provider,
    driver: {
      async deliver(id, outcome) {
        const d = provider.simulate(id, outcome);
        if (!d) throw new Error("unknown payment");
        return d;
      },
    },
  };
});

describe("mock provider", () => {
  it("refuses to load in production", () => {
    expect(() =>
      createMockProvider({ nodeEnv: "production", secret: null }),
    ).toThrow();
  });

  it("a timeout sends nothing and the payment stays open", async () => {
    const m = createMockProvider({ nodeEnv: "test", secret: null });
    const p = await m.createPayment({
      orderNumber: "SP-2610-000009",
      amountPaise: 1,
      idempotencyKey: "k",
    });
    expect(m.simulate(p.providerPaymentId, "timeout")).toBeNull();
    expect(await m.fetchStatus(p.providerPaymentId)).toBe("CREATED");
  });
});
