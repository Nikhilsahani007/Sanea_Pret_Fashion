// /api/v1/checkout (api-specification.md §3). Public, guest only (D-034).
// Writes pass the storefront CSRF check; placement needs an Idempotency-Key.
import { checkoutQuoteSchema, placeOrderSchema } from "@sanea/shared";
import { Router, type Request } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import { validate } from "../../platform/http/validate.ts";
import { sha256 } from "../auth/secrets.ts";
import { findCart } from "../cart/service.ts";
import { CART_COOKIE, cartTokenHash } from "../cart/token.ts";
import { handle, input } from "../catalogue/common.ts";
import type { MockOutcome, MockProvider } from "../payments/mock.ts";
import { ingest } from "../payments/router.ts";
import type { CheckoutDeps } from "./deps.ts";
import {
  orderSummary,
  placeOrder,
  quoteCart,
  restartPayment,
  type PlaceOrderBody,
} from "./service.ts";

const BASE = "/api/v1/checkout";
export const ORDER_TOKEN_HEADER = "x-order-token";
const orderParams = z.object({
  orderNumber: z.string().regex(/^SP-[0-9]{4}-[0-9]{6}$/),
});
const key = z.uuid();

export const CHECKOUT_LIMITS = {
  writes: { windowMs: 60_000, limit: 20 },
  reads: { windowMs: 60_000, limit: 120 },
};

export function checkoutRouter(
  deps: CheckoutDeps,
  limits = CHECKOUT_LIMITS,
): Router {
  const router = Router();
  const writes = createRateLimiter(limits.writes);
  const reads = createRateLimiter(limits.reads);
  router.use(BASE, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const cartId = async (req: Request) =>
    (
      await findCart(
        deps.db,
        cartTokenHash(
          (req.cookies as Record<string, unknown> | undefined)?.[CART_COOKIE],
        ),
        deps.now(),
      )
    )?.id ?? null;

  /** The order, only with its access token; anything else is 404 (no oracle). */
  async function ownedOrder(req: Request, orderNumber: string) {
    const token = req.get(ORDER_TOKEN_HEADER);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new AppError("NOT_FOUND");
    const order = await deps.db.order.findFirst({
      where: { orderNumber, accessTokenHash: sha256(token) },
      select: { id: true },
    });
    if (!order) throw new AppError("NOT_FOUND");
    return order.id;
  }

  function idempotencyKey(req: Request) {
    const parsed = key.safeParse(req.get("idempotency-key"));
    if (!parsed.success)
      throw new AppError("VALIDATION_FAILED", [
        {
          path: "headers.idempotency-key",
          code: "REQUIRED",
          message: "Send an Idempotency-Key header (a UUID).",
        },
      ]);
    return parsed.data;
  }

  // The quote has no side effects and is asked for as the shopper types, so
  // it shares the read limit; placement and payment keep the tighter one.
  router.post(
    `${BASE}/quote`,
    reads,
    validate({ body: checkoutQuoteSchema }),
    handle(async (req, res) => {
      const { body } = input<z.output<typeof checkoutQuoteSchema>>(res);
      const { view, quote, deliveryEstimate, prepaidAvailable } =
        await quoteCart(deps, await cartId(req), {
          paymentMethod: body.paymentMethod,
          pinCode: body.shippingAddress?.pinCode,
          phone: body.shippingAddress?.phone,
        });
      res.json({
        cart: view,
        subtotalPaise: quote.subtotalPaise,
        discountPaise: quote.discountPaise,
        shippingPaise: quote.shippingPaise,
        codFeePaise: quote.codFeePaise,
        taxPaise: quote.taxPaise,
        totalPaise: quote.totalPaise,
        currency: quote.currency,
        cod: quote.cod,
        deliveryEstimate,
        paymentMethods: { PREPAID: prepaidAvailable, COD: quote.cod.available },
      });
    }),
  );

  router.post(
    `${BASE}/orders`,
    writes,
    validate({ body: placeOrderSchema }),
    handle(async (req, res) => {
      const idem = idempotencyKey(req);
      const { body } = input<PlaceOrderBody>(res);
      const result = await placeOrder(deps, {
        cartId: await cartId(req),
        idempotencyKey: idem,
        body,
      });
      res.status(result.status).json(result.body);
    }),
  );

  router.get(
    `${BASE}/orders/:orderNumber/status`,
    reads,
    validate({ params: orderParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof orderParams>>(res);
      res.json(
        await orderSummary(deps, await ownedOrder(req, params.orderNumber)),
      );
    }),
  );

  router.post(
    `${BASE}/orders/:orderNumber/payment`,
    writes,
    validate({ params: orderParams }),
    handle(async (req, res) => {
      idempotencyKey(req);
      const { params } = input<unknown, z.infer<typeof orderParams>>(res);
      res.json(
        await restartPayment(deps, await ownedOrder(req, params.orderNumber)),
      );
    }),
  );

  // Development and tests only: the stand-in for a gateway's hosted page.
  // The configuration refuses the mock in production, so this never mounts there.
  const mock =
    deps.payments?.name === "mock" && deps.config.nodeEnv !== "production"
      ? (deps.payments as MockProvider)
      : null;
  if (mock) {
    const simulateBody = z.strictObject({
      outcome: z.enum(["success", "failure", "timeout"]),
    });
    const paymentParams = z.object({
      providerPaymentId: z.string().regex(/^mock_pay_[0-9a-f-]{36}$/),
    });
    router.post(
      `${BASE}/mock/:providerPaymentId`,
      writes,
      validate({ params: paymentParams, body: simulateBody }),
      handle(async (req, res) => {
        const { params, body } = input<
          { outcome: MockOutcome },
          z.infer<typeof paymentParams>
        >(res);
        const payment = await deps.db.payment.findFirst({
          where: {
            provider: "mock",
            providerPaymentId: params.providerPaymentId,
          },
          select: { order: { select: { orderNumber: true } } },
        });
        if (!payment) throw new AppError("NOT_FOUND");
        await ownedOrder(req, payment.order.orderNumber);
        const delivery = mock.simulate(params.providerPaymentId, body.outcome);
        // The "gateway" calls the webhook; the redirect itself confirms nothing.
        if (delivery)
          await ingest(deps, mock, delivery.rawBody, delivery.headers);
        res.json({ orderNumber: payment.order.orderNumber });
      }),
    );
  }

  return router;
}
