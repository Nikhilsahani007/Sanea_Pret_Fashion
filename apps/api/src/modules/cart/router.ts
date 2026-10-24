// /api/v1/cart (api-specification.md §3). The cart token lives only in an
// HttpOnly cookie; the database keeps its SHA-256 hash. State-changing
// requests pass the storefront CSRF check like every other public write.
import { randomBytes } from "node:crypto";

import {
  Router,
  type CookieOptions,
  type Request,
  type Response,
} from "express";
import { z } from "zod";

import { AppError } from "../../platform/http/errors.ts";
import { handle, input } from "../../platform/http/handle.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import { validate } from "../../platform/http/validate.ts";
import { sha256 } from "../auth/secrets.ts";
import type { ModuleDeps } from "../deps.ts";
import {
  CART_TTL_MS,
  CartRuleViolation,
  cartView,
  findCart,
  setLine,
} from "./service.ts";

export const CART_COOKIE = "__Host-sp_cart";
const COOKIE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/",
  maxAge: CART_TTL_MS,
};

const addBody = z.strictObject({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(10),
});
const setBody = z.strictObject({ quantity: z.number().int().min(0).max(10) });
const lineParams = z.object({ variantId: z.uuid() });

export function cartRouter(deps: ModuleDeps): Router {
  const router = Router();
  const base = deps.config.mediaPublicBaseUrl;
  const writes = createRateLimiter({ windowMs: 60_000, limit: 120 });
  router.use("/api/v1/cart", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const current = (req: Request) =>
    findCart(
      deps.db,
      req.cookies?.[CART_COOKIE] as string | undefined,
      deps.now(),
    );

  async function ensureCart(req: Request, res: Response) {
    const found = await current(req);
    if (found) return found;
    const token = randomBytes(32).toString("base64url");
    const now = deps.now();
    const cart = await deps.db.cart.create({
      data: {
        tokenHash: sha256(token),
        createdAt: now,
        expiresAt: new Date(now.getTime() + CART_TTL_MS),
      },
    });
    res.cookie(CART_COOKIE, token, COOKIE);
    return cart;
  }

  async function change(
    req: Request,
    res: Response,
    variantId: string,
    quantity: number,
    mode: "add" | "set",
  ) {
    const cart =
      mode === "add" ? await ensureCart(req, res) : await current(req);
    if (!cart) throw new AppError("NOT_FOUND");
    try {
      await setLine(deps.db, cart.id, variantId, quantity, mode, deps.now());
    } catch (error) {
      if (error instanceof CartRuleViolation) {
        if (error.code === "OUT_OF_STOCK")
          throw new AppError("OUT_OF_STOCK", error.details);
        throw new AppError("CONFLICT", {
          reason: error.code,
          ...(error.details as object),
        });
      }
      throw error;
    }
    return cartView(deps.db, cart.id, base);
  }

  router.get(
    "/api/v1/cart",
    handle(async (req, res) => {
      const cart = await current(req);
      res.json({ cart: await cartView(deps.db, cart?.id ?? null, base) });
    }),
  );

  router.post(
    "/api/v1/cart/items",
    writes,
    validate({ body: addBody }),
    handle(async (req, res) => {
      const { body } = input<z.infer<typeof addBody>>(res);
      res.json({
        cart: await change(req, res, body.variantId, body.quantity, "add"),
      });
    }),
  );

  router.patch(
    "/api/v1/cart/items/:variantId",
    writes,
    validate({ params: lineParams, body: setBody }),
    handle(async (req, res) => {
      const { params, body } = input<
        z.infer<typeof setBody>,
        z.infer<typeof lineParams>
      >(res);
      res.json({
        cart: await change(req, res, params.variantId, body.quantity, "set"),
      });
    }),
  );

  router.delete(
    "/api/v1/cart/items/:variantId",
    writes,
    validate({ params: lineParams }),
    handle(async (req, res) => {
      const { params } = input<unknown, z.infer<typeof lineParams>>(res);
      res.json({ cart: await change(req, res, params.variantId, 0, "set") });
    }),
  );

  return router;
}
