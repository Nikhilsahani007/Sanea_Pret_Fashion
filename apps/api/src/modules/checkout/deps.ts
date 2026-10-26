import type { AuthDeps } from "../auth/deps.ts";
import type { MediaStorage } from "../media/storage.ts";
import type { EmailProvider } from "../notifications/provider.ts";
import type { PaymentProvider } from "../payments/provider.ts";

/** Checkout, orders and payments (Phases 15 and 16) need media views, the payment and the email provider. */
export type CheckoutDeps = AuthDeps & {
  readonly storage: MediaStorage;
  /** The online payment provider; null when none is configured (production until Phase 18). */
  readonly payments: PaymentProvider | null;
  /** Transactional email; the log provider until OD-19 (D-190). */
  readonly email: EmailProvider;
};
