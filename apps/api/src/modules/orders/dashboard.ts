// /api/v1/admin/dashboard (project-requirements.md §3.2): today's orders,
// pending COD confirmations, orders needing attention, low-stock variants and
// open enquiries, all counted from real rows. Any signed-in staff member; the
// figures a role may not use are left out.
import { can } from "@sanea/shared";
import { Router } from "express";

import { adminContext } from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle, noStore } from "../../platform/http/handle.ts";
import type { ModuleDeps } from "../deps.ts";

/** Midnight in India for the day containing `now`. */
export function istMidnight(now: Date): Date {
  const ist = new Date(now.getTime() + 5.5 * 3_600_000);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - 5.5 * 3_600_000);
}

export function dashboardRouter(deps: ModuleDeps): Router {
  const router = Router();
  router.get(
    "/api/v1/admin/dashboard",
    noStore,
    handle(async (_req, res) => {
      const ctx = adminContext(res);
      if (!ctx) throw new AppError("UNAUTHENTICATED");
      const role = ctx.admin.role;
      const today = istMidnight(deps.now());
      const out: Record<string, unknown> = {};
      if (can(role, "orders.view")) {
        const [todays, pendingCod, attention, toPack] = await Promise.all([
          deps.db.order.findMany({
            where: { placedAt: { gte: today }, status: { not: "CANCELLED" } },
            select: { totalPaise: true },
          }),
          deps.db.order.count({ where: { status: "PENDING_CONFIRMATION" } }),
          deps.db.order.count({ where: { needsAttention: true } }),
          deps.db.order.count({
            where: { status: { in: ["CONFIRMED", "PACKED"] } },
          }),
        ]);
        out.orders = {
          today: todays.length,
          todayValuePaise: todays.reduce((n, o) => n + o.totalPaise, 0),
          pendingCodConfirmation: pendingCod,
          needsAttention: attention,
          toDispatch: toPack,
        };
      }
      if (can(role, "products.view")) {
        const [row] = await deps.db.$queryRaw<{ n: number }[]>`
          SELECT count(*)::int AS n FROM "inventory_level" i
          JOIN "product_variant" v ON v.id = i.variant_id AND v.is_active
          WHERE i.on_hand - i.reserved <= i.low_stock_threshold`;
        out.lowStockVariants = row?.n ?? 0;
      }
      if (can(role, "enquiries.manage"))
        out.openEnquiries = await deps.db.enquiry.count({
          where: { status: { not: "CLOSED" } },
        });
      res.json(out);
    }),
  );
  return router;
}
