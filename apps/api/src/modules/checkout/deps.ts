import type { AuthDeps } from "../auth/deps.ts";
import type { MediaStorage } from "../media/storage.ts";
import type { PaymentProvider } from "../payments/provider.ts";

/** Checkout, orders and payments (Phase 15) need media views and the payment provider. */
export type CheckoutDeps = AuthDeps & {
  readonly storage: MediaStorage;
  /** The online payment provider; null when none is configured (production until Phase 18). */
  readonly payments: PaymentProvider | null;
};
