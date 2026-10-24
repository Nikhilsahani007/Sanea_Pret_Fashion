// Public enquiries and WhatsApp click logging (api-specification.md §3,
// system-design.md §9, UF-3, UF-4). Enquiries: consent required, honeypot and
// timing checks, 5 per hour per IP and 3 per hour per email or phone. Clicks:
// anonymous, no personal data, fire-and-forget.
import { createHmac } from "node:crypto";

import { indianMobileSchema } from "@sanea/shared";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";

import { errorBody } from "../../platform/http/errors.ts";
import { handle, input } from "../../platform/http/handle.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import { validate } from "../../platform/http/validate.ts";
import { ipHash } from "../auth/secrets.ts";
import type { ModuleDeps } from "../deps.ts";

// eslint-disable-next-line no-control-regex -- rejects control characters except line breaks in messages
const ONE_LINE = /^[^\u0000-\u001f\u007f]*$/;
// eslint-disable-next-line no-control-regex -- rejects control characters except line breaks in messages
const MULTI_LINE = /^[^\u0000-\u0009\u000b-\u001f\u007f]*$/;
const path = z
  .string()
  .max(300)
  .regex(/^\/[^\s]*$/);

export const enquiryBody = z
  .strictObject({
    productId: z.uuid().optional(),
    variantId: z.uuid().optional(),
    name: z.string().trim().min(1).max(100).regex(ONE_LINE),
    email: z.string().trim().toLowerCase().max(254).pipe(z.email()).optional(),
    phone: indianMobileSchema.optional(),
    message: z.string().trim().min(10).max(2000).regex(MULTI_LINE),
    consentToContact: z.literal(true, {
      error: "Tick the box so we may reply",
    }),
    sourcePath: path,
    /** Honeypot: hidden from people; anything here is a bot. */
    website: z.string().max(200).optional(),
    /** Milliseconds the form was open; under 2 seconds is a bot. */
    elapsedMs: z.number().int().min(0).max(86_400_000).optional(),
  })
  .refine((b) => b.email || b.phone, {
    error: "Give an email address or a mobile number",
    path: ["email"],
  });

const clickBody = z.strictObject({
  productId: z.uuid().optional(),
  variantId: z.uuid().optional(),
  pagePath: path,
  sessionId: z.uuid(),
});

export function enquiriesPublicRouter(deps: ModuleDeps): Router {
  const router = Router();
  // security-design.md §3: enquiries 5 per hour per IP.
  const perIp = createRateLimiter({ windowMs: 60 * 60_000, limit: 5 });
  // And 3 per hour per email or phone, keyed by a hash (no raw contact data in memory).
  const perContact = rateLimit({
    windowMs: 60 * 60_000,
    limit: 3,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    keyGenerator: (req) => {
      const b = req.body as { email?: unknown; phone?: unknown } | undefined;
      const contact = String(b?.email ?? b?.phone ?? "")
        .trim()
        .toLowerCase();
      return createHmac("sha256", deps.config.ipHashKey)
        .update(`contact:${contact}`)
        .digest("base64url");
    },
    skip: (req) => {
      const b = req.body as { email?: unknown; phone?: unknown } | undefined;
      return !b?.email && !b?.phone;
    },
    handler: (req, res) => {
      res.status(429).json(errorBody("RATE_LIMITED", String(req.id ?? "")));
    },
  });
  const clicks = createRateLimiter({ windowMs: 60_000, limit: 60 });

  router.post(
    "/api/v1/enquiries",
    perIp,
    perContact,
    validate({ body: enquiryBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof enquiryBody>>(res);
      // Bots get the same answer as people, so they learn nothing (security-design.md §3).
      const bot =
        Boolean(body.website) ||
        (body.elapsedMs !== undefined && body.elapsedMs < 2000);
      if (!bot) {
        // Only link products and variants that exist and are published.
        const product = body.productId
          ? await deps.db.product.findFirst({
              where: { id: body.productId, status: "PUBLISHED" },
              select: { id: true },
            })
          : null;
        const variant =
          product && body.variantId
            ? await deps.db.productVariant.findFirst({
                where: { id: body.variantId, productId: product.id },
                select: { id: true },
              })
            : null;
        await deps.db.enquiry.create({
          data: {
            productId: product?.id ?? null,
            variantId: variant?.id ?? null,
            name: body.name,
            email: body.email ?? null,
            phone: body.phone ?? null,
            message: body.message,
            consentToContact: true,
            sourcePath: body.sourcePath,
            ipHash: ipHash(deps.config.ipHashKey, req.ip),
          },
        });
      } else
        deps.logger.info(
          { reason: body.website ? "honeypot" : "too_fast" },
          "enquiry dropped",
        );
      res.setHeader("Cache-Control", "no-store");
      res.status(201).json({ received: true });
    }),
  );

  router.post(
    "/api/v1/events/whatsapp-click",
    clicks,
    validate({ body: clickBody }),
    handle(async (_req, res) => {
      const { body } = input<z.infer<typeof clickBody>>(res);
      const product = body.productId
        ? await deps.db.product.findUnique({
            where: { id: body.productId },
            select: { id: true },
          })
        : null;
      const variant =
        product && body.variantId
          ? await deps.db.productVariant.findFirst({
              where: { id: body.variantId, productId: product.id },
              select: { id: true },
            })
          : null;
      await deps.db.whatsAppClick.create({
        data: {
          productId: product?.id ?? null,
          variantId: variant?.id ?? null,
          pagePath: body.pagePath,
          sessionId: body.sessionId,
        },
      });
      res.status(204).end();
    }),
  );

  return router;
}
