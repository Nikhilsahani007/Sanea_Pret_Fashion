// /api/v1/admin/inventory (api-specification.md §4): stock levels with
// low-stock and SKU filters (all roles), adjustments and the threshold
// (O M F), and the movement history (O M F). Every adjustment is audited.
import { Router } from "express";
import { z } from "zod";

import type { Prisma } from "../../generated/prisma/client.ts";
import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle, input, noStore } from "../../platform/http/handle.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import { requirePermission } from "../auth/middleware.ts";
import type { ModuleDeps } from "../deps.ts";
import { adjust, StockRuleViolation } from "./service.ts";

export const INVENTORY_PATH = "/api/v1/admin/inventory";

const listQuery = z
  .object({
    lowStock: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
    sku: z.string().trim().max(40).optional(),
    product: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    after: z.string().max(40).optional(),
  })
  .strict();

const variantParams = z.object({ variantId: z.uuid() });

const adjustmentBody = z
  .strictObject({
    delta: z
      .number()
      .int()
      .min(-100_000)
      .max(100_000)
      .refine((d) => d !== 0, { error: "Change by at least one unit" }),
    type: z
      .enum(["RECEIVED", "ADJUSTMENT", "CORRECTION"])
      .default("ADJUSTMENT"),
    // eslint-disable-next-line no-control-regex -- rejects control characters
    reason: z
      .string()
      .trim()
      .min(3)
      .max(300)
      .regex(/^[^\u0000-\u001f\u007f]*$/),
  })
  .refine((b) => b.type !== "RECEIVED" || b.delta > 0, {
    error: "A delivery adds stock",
    path: ["delta"],
  });

const thresholdBody = z.strictObject({
  lowStockThreshold: z.number().int().min(0).max(10_000),
});

const movementQuery = z
  .object({
    variantId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    before: z.uuid().optional(),
  })
  .strict();

const REASONS: Record<StockRuleViolation["reason"], string> = {
  BELOW_RESERVED: "BELOW_RESERVED",
  NEGATIVE_ON_HAND: "NEGATIVE_ON_HAND",
  NOT_FOUND: "NOT_FOUND",
  INACTIVE: "INACTIVE",
};

export function inventoryRouter(deps: ModuleDeps): Router {
  const router = Router();
  router.use(INVENTORY_PATH, noStore);

  router.get(
    INVENTORY_PATH,
    requirePermission("products.view"),
    validate({ query: listQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof listQuery>>(res);
      const where: Prisma.InventoryLevelWhereInput = {
        ...(query.sku
          ? { variant: { sku: { contains: query.sku, mode: "insensitive" } } }
          : {}),
        ...(query.product ? { variant: { productId: query.product } } : {}),
      };
      const rows = await deps.db.inventoryLevel.findMany({
        where,
        include: {
          variant: {
            select: {
              sku: true,
              isActive: true,
              product: { select: { id: true, name: true, status: true } },
              colour: { select: { name: true } },
              size: { select: { label: true } },
            },
          },
        },
        orderBy: { variant: { sku: "asc" } },
      });
      // Low stock: free units at or below the threshold (the low-stock view, Phase 9).
      const items = rows
        .map((r) => ({
          variantId: r.variantId,
          sku: r.variant.sku,
          isActive: r.variant.isActive,
          product: r.variant.product,
          colour: r.variant.colour.name,
          size: r.variant.size.label,
          onHand: r.onHand,
          reserved: r.reserved,
          available: r.onHand - r.reserved,
          lowStockThreshold: r.lowStockThreshold,
          lowStock: r.onHand - r.reserved <= r.lowStockThreshold,
          updatedAt: r.updatedAt,
        }))
        .filter((r) => !query.lowStock || (r.lowStock && r.isActive))
        .filter((r) => !query.after || r.sku > query.after);
      const page = items.slice(0, query.limit);
      res.json({
        items: page,
        nextAfter: items.length > query.limit ? page.at(-1)!.sku : null,
      });
    }),
  );

  router.post(
    `${INVENTORY_PATH}/:variantId/adjustments`,
    requirePermission("inventory.adjust"),
    validate({ params: variantParams, body: adjustmentBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof adjustmentBody>,
        z.infer<typeof variantParams>
      >(res);
      const actor = adminContext(res)!.admin.id;
      try {
        const result = await deps.db.$transaction(async (tx) => {
          const r = await adjust(tx, {
            variantId: params.variantId,
            delta: body.delta,
            type: body.type,
            reason: body.reason,
            actorAdminId: actor,
          });
          await recordAudit(tx, deps.config.ipHashKey, {
            actorAdminId: actor,
            action: "inventory.adjusted",
            entityType: "product_variant",
            entityId: params.variantId,
            before: r.before,
            after: {
              ...r.after,
              type: body.type,
              delta: body.delta,
              reason: body.reason,
            },
            ip: req.ip,
          });
          return r;
        });
        res.status(201).json({
          level: {
            variantId: params.variantId,
            ...result.after,
            available: result.after.onHand - result.after.reserved,
          },
          movementId: result.movementId,
        });
      } catch (error) {
        if (error instanceof StockRuleViolation) {
          if (error.reason === "NOT_FOUND") throw new AppError("NOT_FOUND");
          throw new AppError("CONFLICT", { reason: REASONS[error.reason] });
        }
        throw error;
      }
    }),
  );

  router.patch(
    `${INVENTORY_PATH}/:variantId`,
    requirePermission("inventory.adjust"),
    validate({ params: variantParams, body: thresholdBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof thresholdBody>,
        z.infer<typeof variantParams>
      >(res);
      const actor = adminContext(res)!.admin.id;
      await deps.db.$transaction(async (tx) => {
        const before = await tx.inventoryLevel.findUnique({
          where: { variantId: params.variantId },
        });
        if (!before) throw new AppError("NOT_FOUND");
        await tx.inventoryLevel.update({
          where: { variantId: params.variantId },
          data: { lowStockThreshold: body.lowStockThreshold },
        });
        await recordAudit(tx, deps.config.ipHashKey, {
          actorAdminId: actor,
          action: "inventory.threshold_changed",
          entityType: "product_variant",
          entityId: params.variantId,
          before: { lowStockThreshold: before.lowStockThreshold },
          after: { lowStockThreshold: body.lowStockThreshold },
          ip: req.ip,
        });
      });
      res.status(204).end();
    }),
  );

  router.get(
    `${INVENTORY_PATH}/movements`,
    requirePermission("inventory.adjust"),
    validate({ query: movementQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof movementQuery>>(
        res,
      );
      const rows = await deps.db.stockMovement.findMany({
        where: {
          ...(query.variantId ? { variantId: query.variantId } : {}),
          ...(query.before ? { id: { lt: query.before } } : {}),
        },
        orderBy: { id: "desc" },
        take: query.limit,
        include: {
          variant: { select: { sku: true } },
          actorAdmin: { select: { name: true } },
        },
      });
      res.json({
        movements: rows.map((m) => ({
          id: m.id,
          sku: m.variant.sku,
          variantId: m.variantId,
          type: m.type,
          onHandDelta: m.onHandDelta,
          reservedDelta: m.reservedDelta,
          reason: m.reason,
          referenceType: m.referenceType,
          referenceId: m.referenceId,
          actor: m.actorAdmin?.name ?? null,
          createdAt: m.createdAt,
        })),
        nextBefore: rows.length === query.limit ? rows.at(-1)!.id : null,
      });
    }),
  );

  return router;
}
