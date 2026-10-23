// /api/v1/admin/inventory (phase-9-plan.md §3.4, api-specification.md §4).
// Everyone views stock; O M F adjust, set low-stock levels and read the
// movement history (`inventory.adjust`, security-design.md §4).
import { Router, type Response } from "express";
import type { z } from "zod";

import { adminContext } from "../../platform/http/admin-context.ts";
import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { requirePermission } from "../auth/middleware.ts";
import { handle, input, noStore } from "../catalogue/common.ts";
import { listMovements, listStock } from "./reads.ts";
import * as s from "./schemas.ts";
import { adjust, setThreshold } from "./service.ts";

const BASE = "/api/v1/admin/inventory";

export function inventoryRouter(deps: AuthDeps): Router {
  const router = Router();
  router.use(BASE, noStore);
  const view = requirePermission("products.view");
  const manage = requirePermission("inventory.adjust");
  const actor = (res: Response) => adminContext(res)!.admin.id;

  router.get(
    BASE,
    view,
    validate({ query: s.stockQuery }),
    handle(async (_req, res) => {
      const { query } = input<unknown, unknown, z.infer<typeof s.stockQuery>>(
        res,
      );
      res.json(
        await listStock(deps.db, {
          lowStock: query.lowStock === "true",
          sku: query.sku,
          productId: query.productId,
          limit: query.limit,
          cursor: query.cursor,
        }),
      );
    }),
  );

  router.get(
    `${BASE}/movements`,
    manage,
    validate({ query: s.movementQuery }),
    handle(async (_req, res) => {
      const { query } = input<
        unknown,
        unknown,
        z.infer<typeof s.movementQuery>
      >(res);
      res.json(await listMovements(deps.db, query));
    }),
  );

  router.post(
    `${BASE}/:variantId/adjustments`,
    manage,
    validate({ params: s.variantParams, body: s.adjustmentBody }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.adjustmentBody>,
        z.infer<typeof s.variantParams>
      >(res);
      res.status(201).json(
        await adjust(deps.db, {
          variantId: params.variantId,
          type: body.type,
          delta: body.delta,
          reason: body.reason ?? null,
          actorAdminId: actor(res),
          ip: req.ip,
          ipHashKey: deps.config.ipHashKey,
        }),
      );
    }),
  );

  router.patch(
    `${BASE}/:variantId`,
    manage,
    validate({ params: s.variantParams, body: s.thresholdBody }),
    handle(async (req, res) => {
      const { body, params } = input<
        z.infer<typeof s.thresholdBody>,
        z.infer<typeof s.variantParams>
      >(res);
      res.json(
        await setThreshold(deps.db, {
          variantId: params.variantId,
          lowStockThreshold: body.lowStockThreshold,
          actorAdminId: actor(res),
          ip: req.ip,
          ipHashKey: deps.config.ipHashKey,
        }),
      );
    }),
  );

  return router;
}
