// /api/v1/cart (D-099; api-specification.md §3 Cart; phase-11-plan.md §5.3).
// Guests only (D-034). `no-store` everywhere. Reading never creates a cart or
// sets a cookie; the first successful add does. Writes pass the global CSRF
// and Origin check (D-045) and a cart write limit of 60 per minute per IP;
// both run before any cart is created. Each successful write renews the cookie.
import {
  cartItemAddSchema,
  cartItemUpdateSchema,
  toFieldErrors,
} from "@sanea/shared";
import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import type { AuthDeps } from "../auth/deps.ts";
import { handle, noStore } from "../catalogue/common.ts";
import type { MediaStorage } from "../media/storage.ts";
import { addItem, cartView, findCart, setQuantity } from "./service.ts";
import { CART_COOKIE, CART_COOKIE_OPTIONS, cartTokenHash } from "./token.ts";

export const CART = "/api/v1/cart";
export const CART_WRITE_LIMIT = { windowMs: 60_000, limit: 60 };

const variantParam = z.uuid();

function body<T>(schema: z.ZodType<T>, req: Request): T {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION_FAILED",
      toFieldErrors(parsed.error).map((e) => ({
        ...e,
        path: e.path ? `body.${e.path}` : "body",
      })),
    );
  return parsed.data;
}

/** A path variant that is not a uuid cannot be in any cart: 404. */
function variantOf(req: Request): string {
  const parsed = variantParam.safeParse(req.params.variantId);
  if (!parsed.success) throw new AppError("NOT_FOUND");
  return parsed.data;
}

export function cartRouter(
  deps: AuthDeps,
  storage: MediaStorage,
  writeLimit = CART_WRITE_LIMIT,
): Router {
  const router = Router();
  const limit = deps.config.cartMaxLineQuantity;
  const addSchema = cartItemAddSchema(limit);
  const updateSchema = cartItemUpdateSchema(limit);
  const writes = createRateLimiter(writeLimit);
  const cookieOf = (req: Request): unknown =>
    (req.cookies as Record<string, unknown> | undefined)?.[CART_COOKIE];
  const renew = (res: Response, token: string) =>
    res.cookie(CART_COOKIE, token, CART_COOKIE_OPTIONS);

  router.use(CART, noStore);

  router.get(
    CART,
    handle(async (req, res) => {
      const cart = await findCart(
        deps.db,
        cartTokenHash(cookieOf(req)),
        deps.now(),
      );
      res.json(await cartView(deps.db, storage, cart?.id ?? null));
    }),
  );

  router.post(
    `${CART}/items`,
    writes,
    handle(async (req, res) => {
      const { variantId, quantity } = body(addSchema, req);
      const cookie = cookieOf(req);
      const result = await addItem(
        deps.db,
        cartTokenHash(cookie),
        variantId,
        quantity,
        limit,
        deps.now(),
      );
      renew(res, result.newToken ?? (cookie as string));
      res.json(
        await cartView(deps.db, storage, result.cartId, result.warnings),
      );
    }),
  );

  router.patch(
    `${CART}/items/:variantId`,
    writes,
    handle(async (req, res) => {
      const variantId = variantOf(req);
      const { quantity } = body(updateSchema, req);
      const cookie = cookieOf(req);
      const cartId = await setQuantity(
        deps.db,
        cartTokenHash(cookie),
        variantId,
        quantity,
        deps.now(),
      );
      renew(res, cookie as string);
      res.json(await cartView(deps.db, storage, cartId));
    }),
  );

  router.delete(
    `${CART}/items/:variantId`,
    writes,
    handle(async (req, res) => {
      const variantId = variantOf(req);
      const cookie = cookieOf(req);
      const cartId = await setQuantity(
        deps.db,
        cartTokenHash(cookie),
        variantId,
        0,
        deps.now(),
      );
      renew(res, cookie as string);
      res.json(await cartView(deps.db, storage, cartId));
    }),
  );

  return router;
}
