import type { AuthDeps } from "./auth/deps.ts";
import type { MediaStorage } from "./media/storage.ts";

/** Dependencies of the business modules from Phase 8 on. */
export type ModuleDeps = AuthDeps & { readonly media: MediaStorage };
