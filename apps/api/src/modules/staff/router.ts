// /api/v1/admin/staff (Owner only, D-070 to D-072): list admins and open
// invites, invite, change role or deactivate, and issue reset links.
import { AdminRole, adminRoleSchema } from "@sanea/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { validate } from "../../platform/http/validate.ts";
import { recordAudit } from "../audit/record.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { createInvite } from "../auth/invites.ts";
import { requirePermission } from "../auth/middleware.ts";

export const STAFF_PREFIX = "/api/v1/admin/staff";

const idParams = z.object({ id: z.uuid() });
const inviteBody = z
  .object({
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
    role: adminRoleSchema,
  })
  .strict();
const patchBody = z
  .object({
    role: adminRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.role !== undefined || b.isActive !== undefined, {
    error: "Send role or isActive",
  });

const handle =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

type Input<B = unknown, P = unknown> = { body: B; params: P };
const input = <B, P = unknown>(res: { locals: Record<string, unknown> }) =>
  res.locals.input as Input<B, P>;

export function staffRouter(deps: AuthDeps): Router {
  const router = Router();
  router.use(STAFF_PREFIX, requirePermission("staff.manage"));
  router.use(STAFF_PREFIX, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.get(
    STAFF_PREFIX,
    handle(async (_req, res) => {
      const now = deps.now();
      const [admins, invites] = await Promise.all([
        deps.db.adminUser.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            mfaEnabledAt: true,
            lastLoginAt: true,
            createdAt: true,
          },
        }),
        deps.db.adminInvite.findMany({
          where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            role: true,
            adminUserId: true,
            expiresAt: true,
            createdAt: true,
          },
        }),
      ]);
      res.json({
        admins,
        invites: invites.map(({ adminUserId, ...rest }) => ({
          ...rest,
          kind: adminUserId ? "reset" : "invite",
        })),
      });
    }),
  );

  router.post(
    `${STAFF_PREFIX}/invites`,
    validate({ body: inviteBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof inviteBody>>(res);
      const owner = adminContext(res)!.admin;
      const result = await deps.db.$transaction(async (tx) => {
        if (await tx.adminUser.findUnique({ where: { email: body.email } }))
          throw new AppError("CONFLICT");
        const invite = await createInvite(tx, deps, {
          email: body.email,
          role: body.role,
          invitedByAdminId: owner.id,
        });
        await recordAudit(tx, deps.config.ipHashKey, {
          actorAdminId: owner.id,
          action: "staff.invited",
          entityType: "admin_invite",
          entityId: invite.id,
          after: { role: body.role },
          ip: req.ip,
        });
        return invite;
      });
      res
        .status(201)
        .json({ inviteUrl: result.url, expiresAt: result.expiresAt });
    }),
  );

  router.patch(
    `${STAFF_PREFIX}/:id`,
    validate({ params: idParams, body: patchBody }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof patchBody>,
        z.infer<typeof idParams>
      >(res);
      const owner = adminContext(res)!.admin;
      await deps.db.$transaction(async (tx) => {
        // Serialise changes that could remove the last Owner (D-072).
        await tx.$queryRaw`SELECT "id" FROM "admin_user" WHERE "role" = 'OWNER' AND "is_active" FOR UPDATE`;
        const target = await tx.adminUser.findUnique({
          where: { id: params.id },
        });
        if (!target) throw new AppError("NOT_FOUND");
        const role = body.role ?? target.role;
        const isActive = body.isActive ?? target.isActive;
        if (target.id === owner.id && !isActive) throw new AppError("CONFLICT");
        const removesOwner =
          target.role === AdminRole.OWNER &&
          target.isActive &&
          (role !== AdminRole.OWNER || !isActive);
        if (removesOwner) {
          const owners = await tx.adminUser.count({
            where: { role: AdminRole.OWNER, isActive: true },
          });
          if (owners <= 1) throw new AppError("CONFLICT");
        }
        if (isActive && !target.mfaEnabledAt) throw new AppError("CONFLICT");
        if (role === target.role && isActive === target.isActive) return;
        await tx.adminUser.update({
          where: { id: target.id },
          data: { role, isActive },
        });
        // Privilege change or deactivation ends every session (D-067, D-072).
        await tx.adminSession.deleteMany({ where: { adminUserId: target.id } });
        await recordAudit(tx, deps.config.ipHashKey, {
          actorAdminId: owner.id,
          action: "staff.updated",
          entityType: "admin_user",
          entityId: target.id,
          before: { role: target.role, isActive: target.isActive },
          after: { role, isActive },
          ip: req.ip,
        });
      });
      res.status(204).end();
    }),
  );

  router.post(
    `${STAFF_PREFIX}/:id/reset`,
    validate({ params: idParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof idParams>>(res);
      const owner = adminContext(res)!.admin;
      const result = await deps.db.$transaction(async (tx) => {
        const target = await tx.adminUser.findUnique({
          where: { id: params.id },
        });
        if (!target) throw new AppError("NOT_FOUND");
        const invite = await createInvite(tx, deps, {
          email: target.email,
          role: target.role,
          adminUserId: target.id,
          invitedByAdminId: owner.id,
        });
        await recordAudit(tx, deps.config.ipHashKey, {
          actorAdminId: owner.id,
          action: "staff.reset_issued",
          entityType: "admin_user",
          entityId: target.id,
          ip: req.ip,
        });
        return invite;
      });
      res
        .status(201)
        .json({ inviteUrl: result.url, expiresAt: result.expiresAt });
    }),
  );

  return router;
}
