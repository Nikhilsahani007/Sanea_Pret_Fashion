import type { Logger } from "pino";

import type { Config } from "../../platform/config.ts";
import type { Db } from "../../platform/db.ts";
import type { Argon2Params } from "./password.ts";

/** Everything the auth, staff and audit modules need; `now` and `argon2` are injectable for tests. */
export type AuthDeps = {
  readonly db: Db;
  readonly config: Config;
  readonly logger: Logger;
  readonly now: () => Date;
  readonly argon2: Argon2Params;
};
