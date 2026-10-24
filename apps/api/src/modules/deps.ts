import type { AuthDeps } from "./auth/deps.ts";
import type { MediaStorage } from "./media/storage.ts";
import type { MockProvider } from "./payments/mock.ts";
import type { PaymentProvider } from "./payments/provider.ts";

/** Dependencies of the business modules from Phase 8 on. */
export type ModuleDeps = AuthDeps & {
  readonly media: MediaStorage;
  /** The online payment provider; null when none is configured (production until Phase 18). */
  readonly payments: PaymentProvider | MockProvider | null;
};
