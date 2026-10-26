// /api/v1/admin/settings/:group (phase-16-plan.md): the store settings staff
// edit, Owner and Manager only (`settings.store`, security-design.md §4).
// `shipping` and `cod` are the checkout rules (D-186); `whatsapp` is the
// number behind the storefront's WhatsApp button (OD-16). Each value is
// validated with the same schema its reader uses; every change is audited.
import { toFieldErrors } from "@sanea/shared";
import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { requirePermission } from "../auth/middleware.ts";
import { handle, input, noStore } from "../catalogue/common.ts";
import { WHATSAPP_SETTING, whatsAppSetting } from "../content/public-router.ts";
import { SETTINGS_GROUPS, readSettings } from "./settings.ts";

const BASE = "/api/v1/admin/settings";
const groupParams = z.object({ group: z.enum(["shipping", "cod"]) });

export function settingsAdminRouter(deps: AuthDeps): Router {
  const router = Router();
  router.use(BASE, noStore);
  const manage = requirePermission("settings.store");

  const save = (
    req: { ip?: string | undefined },
    actorAdminId: string,
    key: string,
    value: Prisma.InputJsonValue | null,
  ) =>
    deps.db.$transaction(async (tx) => {
      const before = await tx.storeSetting.findUnique({ where: { key } });
      if (value === null) {
        await tx.storeSetting.deleteMany({ where: { key } });
      } else {
        await tx.storeSetting.upsert({
          where: { key },
          create: { key, value, updatedByAdminId: actorAdminId },
          update: { value, updatedByAdminId: actorAdminId },
        });
      }
      // Settings hold no personal data, so the values themselves are audited.
      await recordAudit(tx, deps.config.ipHashKey, {
        actorAdminId,
        action: "settings.updated",
        entityType: "store_setting",
        entityId: key,
        ...(before ? { before: before.value as Prisma.InputJsonValue } : {}),
        ...(value === null ? {} : { after: value }),
        ip: req.ip,
      });
    });

  router.get(
    `${BASE}/whatsapp`,
    manage,
    handle(async (_req, res) => {
      const row = await deps.db.storeSetting.findUnique({
        where: { key: WHATSAPP_SETTING },
      });
      const parsed = whatsAppSetting.safeParse(row?.value);
      res.json({ settings: parsed.success ? parsed.data : null });
    }),
  );

  router.put(
    `${BASE}/whatsapp`,
    manage,
    validate({ body: z.strictObject(whatsAppSetting.shape) }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof whatsAppSetting>>(res);
      const value = { number: body.number, hours: body.hours ?? "" };
      await save(req, adminContext(res)!.admin.id, WHATSAPP_SETTING, value);
      res.json({ settings: value });
    }),
  );

  // Removes the number: the storefront then shows no WhatsApp link.
  router.delete(
    `${BASE}/whatsapp`,
    manage,
    handle(async (req, res) => {
      await save(req, adminContext(res)!.admin.id, WHATSAPP_SETTING, null);
      res.status(204).end();
    }),
  );

  router.get(
    `${BASE}/:group`,
    manage,
    validate({ params: groupParams }),
    handle(async (_req, res) => {
      const { params } = input<unknown, z.infer<typeof groupParams>>(res);
      res.json({ settings: await readSettings(deps.db, params.group) });
    }),
  );

  router.put(
    `${BASE}/:group`,
    manage,
    validate({ params: groupParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof groupParams>>(res);
      // The group decides the schema, so the body is validated here.
      const parsed = SETTINGS_GROUPS[params.group].safeParse(req.body);
      if (!parsed.success)
        throw new AppError(
          "VALIDATION_FAILED",
          toFieldErrors(parsed.error).map((e) => ({
            ...e,
            path: e.path ? `body.${e.path}` : "body",
          })),
        );
      await save(
        req,
        adminContext(res)!.admin.id,
        params.group,
        parsed.data as Prisma.InputJsonValue,
      );
      res.json({ settings: parsed.data });
    }),
  );

  return router;
}
