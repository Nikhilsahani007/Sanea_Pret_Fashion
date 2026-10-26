// POST /api/v1/webhooks/payments/:provider (api-specification.md §5). No
// session and no CSRF: the signature is the only proof. The raw body is kept
// for verification; the event is stored before anything else, then answered
// 200 so the provider stops retrying. Processing errors are logged, not sent.
import { Router } from "express";

import { WEBHOOK_PATH_PREFIX } from "../../platform/http/body.ts";
import { AppError } from "../../platform/http/errors.ts";
import { handle } from "../catalogue/common.ts";
import type { CheckoutDeps } from "../checkout/deps.ts";
import { InvalidWebhook, type PaymentProvider } from "./provider.ts";
import { processEvent, storeEvent } from "./service.ts";

export async function ingest(
  deps: CheckoutDeps,
  provider: PaymentProvider,
  rawBody: Buffer,
  headers: Readonly<Record<string, string | string[] | undefined>>,
) {
  let event;
  try {
    event = provider.verifyWebhook(rawBody, headers);
  } catch (error) {
    if (error instanceof InvalidWebhook)
      throw new AppError("WEBHOOK_INVALID", { reason: error.message });
    throw error;
  }
  const now = deps.now();
  const rowId = await storeEvent(deps.db, provider.name, event, now);
  if (!rowId) return { duplicate: true as const };
  try {
    return {
      duplicate: false as const,
      outcome: await processEvent(deps.db, provider, rowId, event, now, {
        ttlMinutes: deps.config.reservationTtlMinutes,
      }),
    };
  } catch (err) {
    // Stored but not applied: reconciliation and staff pick it up.
    deps.logger.error({ err, eventId: rowId }, "payment event not applied");
    return { duplicate: false as const, outcome: "ERROR" as const };
  }
}

export function webhooksRouter(deps: CheckoutDeps): Router {
  const router = Router();
  router.post(
    `${WEBHOOK_PATH_PREFIX}payments/:provider`,
    handle(async (req, res) => {
      const provider = deps.payments;
      if (!provider || req.params.provider !== provider.name)
        throw new AppError("NOT_FOUND");
      const raw = (req as { rawBody?: Buffer }).rawBody;
      if (!raw)
        throw new AppError("WEBHOOK_INVALID", { reason: "BODY_MISSING" });
      await ingest(deps, provider, raw, req.headers);
      res.json({ received: true });
    }),
  );
  return router;
}
