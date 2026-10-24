// Settings groups edited at /admin/settings/:group (api-specification.md §4).
import {
  codSettingsSchema,
  indianStateSchema,
  shippingSettingsSchema,
  storeSettingsSchema,
} from "@sanea/shared";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";

export const SETTINGS_GROUPS = {
  store: storeSettingsSchema,
  shipping: shippingSettingsSchema,
  cod: codSettingsSchema,
} as const;
export type SettingsGroup = keyof typeof SETTINGS_GROUPS;

/**
 * Tax settings (D-033, D-167): the seller's registered state, which decides
 * intra- or inter-state supply. Empty until the Owner enters the
 * accountant-verified value (B-14). Read only here: no admin route edits it
 * yet, because who may edit tax settings is an open choice (proposed: Owner
 * only, like payment settings).
 */
export const taxSettingsSchema = z.strictObject({
  sellerState: indianStateSchema.nullable().default(null),
});

export async function readTaxSettings(db: Db | Prisma.TransactionClient) {
  const row = await db.storeSetting.findUnique({ where: { key: "tax" } });
  return taxSettingsSchema.parse(row?.value ?? {});
}

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
