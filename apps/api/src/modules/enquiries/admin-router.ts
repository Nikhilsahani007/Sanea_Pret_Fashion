// /api/v1/admin/enquiries (project-requirements.md §3.2, phase-16-plan.md):
// the inbox of website enquiries with status and assignee, and WhatsApp click
// counts per product. Owner and Manager (`enquiries.manage`). Changes are
// audited without content.
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

const BASE = "/api/v1/admin/enquiries";
const STATUSES = ["NEW", "IN_PROGRESS", "CLOSED"] as const;
const listQuery = z.strictObject({
  status: z.enum(STATUSES).optional(),
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
const idParams = z.object({ id: z.uuid() });
const patchBody = z
  .strictObject({
    status: z.enum(STATUSES).optional(),
    assignedAdminId: z.uuid().nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.assignedAdminId !== undefined, {
    error: "Nothing to change",
  });
const clickQuery = z.strictObject({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export function enquiriesAdminRouter(deps: AuthDeps): Router {
  const router = Router();
  router.use(BASE, noStore);
  const manage = requirePermission("enquiries.manage");

  router.get(
    BASE,
    manage,
    validate({ query: listQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof listQuery>>(res);
      const rows = await deps.db.enquiry.findMany({
        where: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.before ? { id: { lt: query.before } } : {}),
        },
        orderBy: { id: "desc" },
        take: query.limit,
        include: {
          product: { select: { name: true, slug: true } },
          variant: { select: { sku: true } },
          assignedAdmin: { select: { id: true, name: true } },
        },
      });
      res.json({
        enquiries: rows.map((e) => ({
          id: e.id,
          name: e.name,
          email: e.email,
          phone: e.phone,
          message: e.message,
          status: e.status,
          sourcePath: e.sourcePath,
          product: e.product,
          sku: e.variant?.sku ?? null,
          assignedTo: e.assignedAdmin,
          createdAt: e.createdAt.toISOString(),
        })),
        nextBefore: rows.length === query.limit ? rows.at(-1)!.id : null,
      });
    }),
  );

  // The people an enquiry can be assigned to: active Owners and Managers.
  router.get(
    `${BASE}/assignees`,
    manage,
    handle(async (_req, res) => {
      const staff = await deps.db.adminUser.findMany({
        where: { isActive: true, role: { in: ["OWNER", "MANAGER"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      res.json({ assignees: staff });
    }),
  );

  router.patch(
    `${BASE}/:id`,
    manage,
    validate({ params: idParams, body: patchBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof patchBody>,
        z.infer<typeof idParams>
      >(res);
      const admin = adminContext(res)!.admin;
      if (body.assignedAdminId) {
        const target = await deps.db.adminUser.findUnique({
          where: { id: body.assignedAdminId },
        });
        if (!target?.isActive || !["OWNER", "MANAGER"].includes(target.role))
          throw new AppError("VALIDATION_FAILED", [
            {
              path: "body.assignedAdminId",
              code: "INVALID",
              message: "Choose an active Owner or Manager.",
            },
          ]);
      }
      await deps.db.$transaction(async (tx) => {
        const before = await tx.enquiry.findUnique({
          where: { id: params.id },
        });
        if (!before) throw new AppError("NOT_FOUND");
        const data: Prisma.EnquiryUncheckedUpdateInput = {
          ...(body.status ? { status: body.status } : {}),
          ...(body.assignedAdminId !== undefined
            ? { assignedAdminId: body.assignedAdminId }
            : {}),
        };
        await tx.enquiry.update({ where: { id: params.id }, data });
        await recordAudit(tx, deps.config.ipHashKey, {
          actorAdminId: admin.id,
          action: "enquiry.updated",
          entityType: "enquiry",
          entityId: params.id,
          before: {
            status: before.status,
            assignedAdminId: before.assignedAdminId,
          },
          after: {
            status: body.status ?? before.status,
            assignedAdminId:
              body.assignedAdminId !== undefined
                ? body.assignedAdminId
                : before.assignedAdminId,
          },
          ip: req.ip,
        });
      });
      res.json({ ok: true });
    }),
  );

  // Anonymous WhatsApp interest per product (no personal data exists to show).
  router.get(
    `${BASE}/whatsapp-clicks`,
    manage,
    validate({ query: clickQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof clickQuery>>(
        res,
      );
      const since = new Date(deps.now().getTime() - query.days * 86_400_000);
      const groups = await deps.db.whatsAppClick.groupBy({
        by: ["productId"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      });
      const products = await deps.db.product.findMany({
        where: {
          id: { in: groups.flatMap((g) => (g.productId ? [g.productId] : [])) },
        },
        select: { id: true, name: true, slug: true },
      });
      res.json({
        days: query.days,
        products: groups
          .map((g) => ({
            product: products.find((p) => p.id === g.productId) ?? null,
            clicks: g._count._all,
          }))
          .sort((a, b) => b.clicks - a.clicks),
      });
    }),
  );

  return router;
}
