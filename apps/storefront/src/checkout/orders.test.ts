// The payment page an order opens (Phase 18): the mock's route here, or
// PhonePe's hosted page on a phonepe.com host over https, and nothing else.
import { afterEach, describe, expect, it, vi } from "vitest";

import { openPayment } from "./orders.ts";

afterEach(() => vi.restoreAllMocks());

describe("openPayment", () => {
  it("opens the mock's page inside the shop", () => {
    const navigate = vi.fn();
    expect(
      openPayment({ payPath: "/checkout/pay/mock/p1" }, "SP-1", navigate),
    ).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/checkout/pay/mock/p1?order=SP-1");
  });

  it("follows only PhonePe's https page", () => {
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    });
    const navigate = vi.fn();
    const page = "https://mercury-uat.phonepe.com/transact/uat_v2?token=t";
    expect(openPayment({ redirectUrl: page }, "SP-1", navigate)).toBe(true);
    expect(assign).toHaveBeenCalledWith(page);
    for (const bad of [
      "http://mercury.phonepe.com/x",
      "https://phonepe.com.evil.example/x",
      "https://evil.example/?phonepe.com",
      "javascript:alert(1)",
      "not a url",
    ])
      expect(openPayment({ redirectUrl: bad }, "SP-1", navigate), bad).toBe(
        false,
      );
    expect(
      openPayment({ payPath: "https://evil.example" }, "SP-1", navigate),
    ).toBe(false);
    expect(openPayment(null, "SP-1", navigate)).toBe(false);
    expect(assign).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
  });
});
