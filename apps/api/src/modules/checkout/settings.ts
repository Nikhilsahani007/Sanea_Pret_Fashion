// The checkout settings groups (OD-07, OD-08, D-186), stored as store
// settings `shipping` and `cod`. Until the Owner saves values (the settings
// screen arrives in Phase 16), the defaults apply.
import { codSettingsSchema, shippingSettingsSchema } from "@sanea/shared";

import type { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";

export const SETTINGS_GROUPS = {
  shipping: shippingSettingsSchema,
  cod: codSettingsSchema,
} as const;
export type SettingsGroup = keyof typeof SETTINGS_GROUPS;

/** The stored value of a group, with defaults filled in. */
export async function readSettings<G extends SettingsGroup>(
  db: Db | Prisma.TransactionClient,
  group: G,
) {
  const row = await db.storeSetting.findUnique({ where: { key: group } });
  return SETTINGS_GROUPS[group].parse(row?.value ?? {}) as ReturnType<
    (typeof SETTINGS_GROUPS)[G]["parse"]
  >;
}
