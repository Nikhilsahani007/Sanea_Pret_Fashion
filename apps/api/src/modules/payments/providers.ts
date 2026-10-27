// The provider PAYMENT_PROVIDER names (system-design.md §6.1): the mock outside
// production (D-107), PhonePe (D-195), or none.
import type { Config } from "../../platform/config.ts";
import { createMockProvider } from "./mock.ts";
import { createPhonePeProvider } from "./phonepe.ts";
import type { PaymentProvider } from "./provider.ts";

export function paymentProviderFor(
  config: Pick<
    Config,
    | "nodeEnv"
    | "paymentProvider"
    | "mockPaymentSecret"
    | "phonePe"
    | "storefrontOrigin"
    | "reservationTtlMinutes"
  >,
): PaymentProvider | null {
  if (config.paymentProvider === "mock")
    return createMockProvider({
      nodeEnv: config.nodeEnv,
      secret: config.mockPaymentSecret,
    });
  if (config.paymentProvider === "phonepe" && config.phonePe)
    return createPhonePeProvider({
      ...config.phonePe,
      storefrontOrigin: config.storefrontOrigin,
      // The payment page closes when the stock hold would lapse (SR-3).
      expireAfterMinutes: config.reservationTtlMinutes,
    });
  return null;
}
