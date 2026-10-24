import type { AuthDeps } from "./auth/deps.ts";
import type { MediaStorage } from "./media/storage.ts";
import type { EmailProvider } from "./notifications/provider.ts";
import type { MockProvider } from "./payments/mock.ts";
import type { PaymentProvider } from "./payments/provider.ts";

/** Dependencies of the business modules from Phase 8 on. */
export type ModuleDeps = AuthDeps & {
  readonly media: MediaStorage;
  /** The online payment provider; null when none is configured (production until Phase 18). */
  readonly payments: PaymentProvider | MockProvider | null;
  /** Transactional email; the log provider until OD-19 is answered (B-08). */
  readonly email: EmailProvider;
};
