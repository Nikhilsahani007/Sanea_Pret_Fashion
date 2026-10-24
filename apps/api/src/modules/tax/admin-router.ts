// /api/v1/admin/tax (D-033, D-167, D-169): the seller's state and the GST
// rules, Owner only (`settings.tax`). The system holds no rate, HSN code,
// GSTIN or state of its own; the Owner enters accountant-verified values
// (B-14). Rules are not edited once entered: a rule is ended and a new one
// added, so orders keep pointing at the values that applied. Audited.
import { indianStateSchema } from "@sanea/shared";
import { Router, type Response } from "express";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle, input, noStore } from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import { requirePermission } from "../auth/middleware.ts";
import { readTaxSettings, taxSettingsSchema } from "../checkout/settings.ts";
import type { ModuleDeps } from "../deps.ts";

const BASE = "/api/v1/admin/tax";

const bps = z.number().int().min(0).max(10_000);
const slab = z.strictObject({
  upToUnitPricePaise: z.number().int().min(1).nullable(),
  cgstBps: bps,
  sgstBps: bps,
  igstBps: bps,
});
const ruleBody = z
  .strictObject({
    hsnPrefix: z.string().regex(/^[0-9]{0,8}$/),
    effectiveFrom: z.iso.datetime({ offset: true }),
    effectiveTo: z.iso.datetime({ offset: true }).nullable().default(null),
    note: z.string().trim().max(500).optional(),
    slabs: z.array(slab).min(1).max(20),
  })
  .superRefine((b, ctx) => {
    if (b.effectiveTo && new Date(b.effectiveTo) <= new Date(b.effectiveFrom))
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "Must be after the start.",
      });
    const limits = b.slabs.map((s) => s.upToUnitPricePaise);
    if (limits.filter((l) => l === null).length > 1)
      ctx.addIssue({
        code: "custom",
        path: ["slabs"],
        message: "At most one band without an upper price.",
      });
    if (new Set(limits).size !== limits.length)
      ctx.addIssue({
        code: "custom",
        path: ["slabs"],
        message: "Each band needs a different upper price.",
      });
  });
const idParams = z.object({ id: z.uuid() });
const endBody = z.strictObject({
  effectiveTo: z.iso.datetime({ offset: true }),
});
// Re-declared for the body so the state list comes from @sanea/shared.
const settingsBody = z.strictObject({
  sellerState: indianStateSchema.nullable(),
});

export function taxAdminRouter(deps: ModuleDeps): Router {
  const router = Router();
  router.use(BASE, noStore);
  const owner = requirePermission("settings.tax");
  const audit = (
    tx: Prisma.TransactionClient,
    ip: string | undefined,
    res: Response,
    entry: {
      action: string;
      entityType: string;
      entityId: string;
      before?: Prisma.InputJsonValue;
      after?: Prisma.InputJsonValue;
    },
  ) =>
    recordAudit(tx, deps.config.ipHashKey, {
      ...entry,
      actorAdminId: adminContext(res)!.admin.id,
      ip,
    });

  router.get(
    `${BASE}/settings`,
    owner,
    handle(async (_req, res) => {
      res.json({ settings: await readTaxSettings(deps.db) });
    }),
  );

  router.put(
    `${BASE}/settings`,
    owner,
    validate({ body: settingsBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof settingsBody>>(res);
      const value = taxSettingsSchema.parse(body);
      const adminId = adminContext(res)!.admin.id;
      await deps.db.$transaction(async (tx) => {
        const before = await tx.storeSetting.findUnique({
          where: { key: "tax" },
        });
        await tx.storeSetting.upsert({
          where: { key: "tax" },
          create: { key: "tax", value, updatedByAdminId: adminId },
          update: { value, updatedByAdminId: adminId },
        });
        await audit(tx, req.ip, res, {
          action: "settings.tax_updated",
          entityType: "store_setting",
          entityId: "tax",
          before: (before?.value ?? null) as Prisma.InputJsonValue,
          after: value,
        });
      });
      res.json({ settings: value });
    }),
  );

  router.get(
    `${BASE}/gst-rules`,
    owner,
    handle(async (_req, res) => {
      const rules = await deps.db.gstRule.findMany({
        orderBy: [{ hsnPrefix: "asc" }, { effectiveFrom: "asc" }],
        include: { slabs: true },
      });
      res.json({
        rules: rules.map((r) => ({
          id: r.id,
          hsnPrefix: r.hsnPrefix,
          effectiveFrom: r.effectiveFrom.toISOString(),
          effectiveTo: r.effectiveTo?.toISOString() ?? null,
          note: r.note,
          slabs: [...r.slabs]
            .sort(
              (a, b) =>
                (a.upToUnitPricePaise ?? Infinity) -
                (b.upToUnitPricePaise ?? Infinity),
            )
            .map(({ upToUnitPricePaise, cgstBps, sgstBps, igstBps }) => ({
              upToUnitPricePaise,
              cgstBps,
              sgstBps,
              igstBps,
            })),
        })),
      });
    }),
  );

  router.post(
    `${BASE}/gst-rules`,
    owner,
    validate({ body: ruleBody }),
    handle(async (req, res) => {
      const { body } = input<z.output<typeof ruleBody>>(res);
      try {
        const rule = await deps.db.$transaction(async (tx) => {
          const r = await tx.gstRule.create({
            data: {
              hsnPrefix: body.hsnPrefix,
              effectiveFrom: new Date(body.effectiveFrom),
              effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
              note: body.note ?? null,
              createdByAdminId: adminContext(res)!.admin.id,
              slabs: { create: body.slabs },
            },
          });
          await audit(tx, req.ip, res, {
            action: "tax.gst_rule_created",
            entityType: "gst_rule",
            entityId: r.id,
            after: body as unknown as Prisma.InputJsonValue,
          });
          return r;
        });
        res.status(201).json({ rule: { id: rule.id } });
      } catch (error) {
        throw overlapOr(error);
      }
    }),
  );

  router.post(
    `${BASE}/gst-rules/:id/end`,
    owner,
    validate({ params: idParams, body: endBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof endBody>,
        z.infer<typeof idParams>
      >(res);
      const end = new Date(body.effectiveTo);
      try {
        await deps.db.$transaction(async (tx) => {
          const r = await tx.gstRule.findUnique({ where: { id: params.id } });
          if (!r) throw new AppError("NOT_FOUND");
          // History is not rewritten: the end may only move a future end
          // earlier, and never before now or the rule's start.
          if (end <= r.effectiveFrom || end < deps.now())
            throw new AppError("VALIDATION_FAILED", [
              {
                path: "body.effectiveTo",
                code: "INVALID",
                message: "Must be after the start and not in the past.",
              },
            ]);
          if (
            r.effectiveTo &&
            (r.effectiveTo <= deps.now() || end >= r.effectiveTo)
          )
            throw new AppError("CONFLICT", { reason: "GST_RULE_ALREADY_ENDS" });
          await tx.gstRule.update({
            where: { id: r.id },
            data: { effectiveTo: end },
          });
          await audit(tx, req.ip, res, {
            action: "tax.gst_rule_ended",
            entityType: "gst_rule",
            entityId: r.id,
            before: { effectiveTo: r.effectiveTo?.toISOString() ?? null },
            after: { effectiveTo: end.toISOString() },
          });
        });
      } catch (error) {
        throw overlapOr(error);
      }
      res.json({ ok: true });
    }),
  );

  return router;
}

/** The database's overlap guard becomes a 409 the admin can act on. */
function overlapOr(error: unknown): unknown {
  if (
    String((error as Error)?.message ?? "").includes("gst_rule_no_overlap_excl")
  )
    return new AppError("CONFLICT", { reason: "GST_RULE_OVERLAP" });
  return error;
}
