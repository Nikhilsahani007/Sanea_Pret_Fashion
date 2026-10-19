// GET /api/v1/admin/audit-log (Owner only): newest first, keyset pagination on
// the UUID v7 id, which sorts by creation time. IP hashes are not returned.
import { Router } from "express";
import { z } from "zod";

import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { requirePermission } from "../auth/middleware.ts";

export const AUDIT_PATH = "/api/v1/admin/audit-log";

const query = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.uuid().optional(),
  })
  .strict();

export function auditRouter(deps: AuthDeps): Router {
  const router = Router();
  router.get(
    AUDIT_PATH,
    requirePermission("audit.view"),
    validate({ query }),
    async (_req, res, next) => {
      try {
        const q = (res.locals.input as { query: z.infer<typeof query> }).query;
        const entries = await deps.db.auditLog.findMany({
          where: q.before ? { id: { lt: q.before } } : {},
          orderBy: { id: "desc" },
          take: q.limit,
          select: {
            id: true,
            actorAdminId: true,
            action: true,
            entityType: true,
            entityId: true,
            before: true,
            after: true,
            createdAt: true,
          },
        });
        res.setHeader("Cache-Control", "no-store");
        res.json({
          entries,
          nextBefore: entries.length === q.limit ? entries.at(-1)!.id : null,
        });
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
