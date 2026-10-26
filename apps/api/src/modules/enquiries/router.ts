// Public enquiries and the WhatsApp click log (phase-13-plan.md; api-
// specification.md §3 "Enquiries and events"; UF-3, UF-4; security-design.md
// §3). Enquiries: consent required, honeypot and timing checks, 5 per hour per
// IP. Bots get the same `201` as people and nothing is stored. Clicks are
// anonymous (no personal data) and limited to 60 per minute per IP. Writes
// pass the global CSRF and Origin check (D-045). `no-store` everywhere.
import { enquirySchema, whatsAppClickSchema } from "@sanea/shared";
import { Router } from "express";
import type { z } from "zod";

import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { ipHash } from "../auth/secrets.ts";
import { handle, input, noStore } from "../catalogue/common.ts";

export const ENQUIRY_LIMIT = { windowMs: 60 * 60_000, limit: 5 };
export const CLICK_LIMIT = { windowMs: 60_000, limit: 60 };
/** A person needs more than this to fill in the form (security-design.md §3). */
export const MIN_FILL_MS = 2000;

type Limits = { enquiries?: typeof ENQUIRY_LIMIT; clicks?: typeof CLICK_LIMIT };

/** The product and variant ids, kept only when they exist and belong together. */
async function links(
  deps: AuthDeps,
  productId: string | undefined,
  variantId: string | undefined,
  publishedOnly: boolean,
) {
  const product = productId
    ? await deps.db.product.findFirst({
        where: {
          id: productId,
          ...(publishedOnly ? { status: "PUBLISHED" as const } : {}),
        },
        select: { id: true },
      })
    : null;
  const variant =
    product && variantId
      ? await deps.db.productVariant.findFirst({
          where: { id: variantId, productId: product.id },
          select: { id: true },
        })
      : null;
  return { productId: product?.id ?? null, variantId: variant?.id ?? null };
}

export function enquiriesRouter(deps: AuthDeps, limits: Limits = {}): Router {
  const router = Router();
  const enquiries = createRateLimiter(limits.enquiries ?? ENQUIRY_LIMIT);
  const clicks = createRateLimiter(limits.clicks ?? CLICK_LIMIT);

  router.post(
    "/api/v1/enquiries",
    noStore,
    enquiries,
    validate({ body: enquirySchema }),
    handle(async (req, res) => {
      const { body } = input<z.output<typeof enquirySchema>>(res);
      const bot =
        Boolean(body.website) ||
        (body.elapsedMs !== undefined && body.elapsedMs < MIN_FILL_MS);
      if (bot) {
        deps.logger.info(
          { reason: body.website ? "honeypot" : "too_fast" },
          "enquiry dropped",
        );
      } else {
        await deps.db.enquiry.create({
          data: {
            ...(await links(deps, body.productId, body.variantId, true)),
            name: body.name,
            email: body.email ?? null,
            phone: body.phone ?? null,
            message: body.message,
            consentToContact: true,
            sourcePath: body.sourcePath,
            ipHash: ipHash(deps.config.ipHashKey, req.ip),
          },
        });
      }
      res.status(201).json({ received: true });
    }),
  );

  router.post(
    "/api/v1/events/whatsapp-click",
    noStore,
    clicks,
    validate({ body: whatsAppClickSchema }),
    handle(async (_req, res) => {
      const { body } = input<z.output<typeof whatsAppClickSchema>>(res);
      await deps.db.whatsAppClick.create({
        data: {
          ...(await links(deps, body.productId, body.variantId, false)),
          pagePath: body.pagePath,
          sessionId: body.sessionId,
        },
      });
      res.status(204).end();
    }),
  );

  return router;
}
