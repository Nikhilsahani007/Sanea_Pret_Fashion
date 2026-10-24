// Settings groups edited at /admin/settings/:group (api-specification.md §4).
import {
  codSettingsSchema,
  shippingSettingsSchema,
  storeSettingsSchema,
} from "@sanea/shared";

import type { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";

export const SETTINGS_GROUPS = {
  store: storeSettingsSchema,
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
