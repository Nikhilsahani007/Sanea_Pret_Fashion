// Guest cart (D-099; phase-11-plan.md §5; system-design.md §3). Lines hold a
// variant and a quantity only; every read re-prices from current variant
// prices. Adding reserves no stock (SR-2): a quantity above what is available
// is kept with a warning, and checkout refuses it (Phase 15). A variant may be
// added only while it is on sale: active, its product and category published.
import {
  CART_CURRENCY,
  CART_MAX_LINES,
  CartWarning,
  EMPTY_CART,
  availabilityOf,
  type CartLine,
  type CartView,
} from "@sanea/shared";

import { Prisma } from "../../generated/prisma/client.ts";
import type { Db } from "../../platform/db.ts";
import { AppError } from "../../platform/http/errors.ts";
import type { Bytes } from "../auth/secrets.ts";
import { imageView } from "../catalogue/common.ts";
import { PRODUCT_FROM, baseConditions } from "../catalogue/listing.ts";
import type { MediaStorage } from "../media/storage.ts";
import { CART_TTL_MS, newCartToken } from "./token.ts";

const { sql, join } = Prisma;
type Tx = Prisma.TransactionClient;
export type Warning = { variantId: string; code: CartWarning };

const expiry = (now: Date) => new Date(now.getTime() + CART_TTL_MS);

/** The live cart for a token hash; an expired cart counts as none. */
export async function findCart(db: Db | Tx, hash: Bytes | null, now: Date) {
  if (!hash) return null;
  return db.cart.findFirst({
    where: { tokenHash: hash, expiresAt: { gt: now } },
    select: { id: true },
  });
}

/** True while the variant is on sale (the catalogue's own visibility rule). */
async function onSale(db: Db | Tx, variantId: string, now: Date) {
  const rows = await db.$queryRaw<{ ok: number }[]>(sql`
    SELECT 1 AS "ok" ${PRODUCT_FROM}
    JOIN "product_variant" v ON v."product_id" = p."id"
    WHERE v."id" = ${variantId}::uuid AND v."is_active"
      AND ${join(baseConditions({}, now), " AND ")}`);
  return rows.length > 0;
}

/** Locks the cart row so line counts and quantities change one at a time. */
const lock = (tx: Tx, cartId: string) =>
  tx.$queryRaw`SELECT 1 FROM "cart" WHERE "id" = ${cartId}::uuid FOR UPDATE`;

export type AddResult = {
  cartId: string;
  /** Set when this add created the cart: the raw token for the cookie. */
  newToken: string | null;
  warnings: Warning[];
};

/**
 * Adds `quantity` of a variant, creating the cart on the first successful
 * add only. A total above `limit` is capped with a QUANTITY_LIMIT warning.
 * Refused adds (unknown or not on sale: 404; a 31st line: 409) create nothing.
 */
export async function addItem(
  db: Db,
  hash: Bytes | null,
  variantId: string,
  quantity: number,
  limit: number,
  now: Date,
): Promise<AddResult> {
  return db.$transaction(async (tx) => {
    if (!(await onSale(tx, variantId, now))) throw new AppError("NOT_FOUND");
    let cart = await findCart(tx, hash, now);
    let token: string | null = null;
    if (!cart) {
      const issued = newCartToken();
      token = issued.token;
      cart = await tx.cart.create({
        data: {
          tokenHash: issued.hash,
          createdAt: now,
          expiresAt: expiry(now),
        },
        select: { id: true },
      });
    }
    await lock(tx, cart.id);
    const key = { cartId_variantId: { cartId: cart.id, variantId } };
    const line = await tx.cartItem.findUnique({ where: key });
    const warnings: Warning[] = [];
    if (line) {
      // Never above the limit; a line saved under a higher limit is not cut.
      const wanted = line.quantity + quantity;
      const next = Math.min(wanted, Math.max(limit, line.quantity));
      if (wanted > next)
        warnings.push({ variantId, code: CartWarning.QUANTITY_LIMIT });
      if (next !== line.quantity)
        await tx.cartItem.update({ where: key, data: { quantity: next } });
    } else {
      const lines = await tx.cartItem.count({ where: { cartId: cart.id } });
      if (lines >= CART_MAX_LINES)
        throw new AppError("CART_FULL", [
          { path: "body.variantId", code: "CART_FULL", max: CART_MAX_LINES },
        ]);
      await tx.cartItem.create({
        data: { cartId: cart.id, variantId, quantity },
      });
    }
    await tx.cart.update({
      where: { id: cart.id },
      data: { expiresAt: expiry(now) },
    });
    return { cartId: cart.id, newToken: token, warnings };
  });
}

/**
 * Sets a line's quantity (0 removes it). No cart or no such line: 404, with
 * the same answer whatever the reason.
 */
export async function setQuantity(
  db: Db,
  hash: Bytes | null,
  variantId: string,
  quantity: number,
  now: Date,
): Promise<string> {
  return db.$transaction(async (tx) => {
    const cart = await findCart(tx, hash, now);
    if (!cart) throw new AppError("NOT_FOUND");
    await lock(tx, cart.id);
    const key = { cartId_variantId: { cartId: cart.id, variantId } };
    const line = await tx.cartItem.findUnique({ where: key });
    if (!line) throw new AppError("NOT_FOUND");
    if (quantity === 0) await tx.cartItem.delete({ where: key });
    else await tx.cartItem.update({ where: key, data: { quantity } });
    await tx.cart.update({
      where: { id: cart.id },
      data: { expiresAt: expiry(now) },
    });
    return cart.id;
  });
}

/** The cart as shoppers see it: re-priced, with stock states and warnings. */
export async function cartView(
  db: Db,
  storage: MediaStorage,
  cartId: string | null,
  extra: readonly Warning[] = [],
): Promise<CartView> {
  if (!cartId) return EMPTY_CART;
  const items = await db.cartItem.findMany({
    where: { cartId },
    orderBy: [{ createdAt: "asc" }, { variantId: "asc" }],
    include: {
      variant: {
        include: {
          product: { include: { category: true } },
          colour: true,
          size: true,
          inventory: true,
        },
      },
    },
  });
  const productIds = [...new Set(items.map((i) => i.variant.productId))];
  const images = productIds.length
    ? await db.productImage.findMany({
        where: { productId: { in: productIds }, role: "PRIMARY" },
        orderBy: [{ position: "asc" }],
        include: { mediaAsset: true },
      })
    : [];
  const warnings: Warning[] = [...extra];
  let subtotal = 0;
  let count = 0;
  const lines: CartLine[] = items.map((item) => {
    const v = item.variant;
    const p = v.product;
    const available =
      v.isActive &&
      p.status === "PUBLISHED" &&
      p.category.status === "PUBLISHED";
    const stock = v.inventory ?? {
      onHand: 0,
      reserved: 0,
      lowStockThreshold: 0,
    };
    count += item.quantity;
    if (!available)
      warnings.push({ variantId: v.id, code: CartWarning.UNAVAILABLE });
    else {
      subtotal += v.pricePaise * item.quantity;
      if (item.quantity > stock.onHand - stock.reserved)
        warnings.push({ variantId: v.id, code: CartWarning.EXCEEDS_AVAILABLE });
    }
    // The colour's own primary image, else one for all colours, else any.
    const own = images.filter((i) => i.productId === p.id);
    const image =
      own.find((i) => i.colourId === v.colourId) ??
      own.find((i) => i.colourId === null) ??
      own[0];
    const view = image && available ? imageView(image, storage) : null;
    return {
      variantId: v.id,
      productSlug: p.slug,
      productName: p.name,
      colour: { name: v.colour.name, swatchHex: v.colour.swatchHex },
      size: v.size.label,
      quantity: item.quantity,
      available,
      unitPricePaise: available ? v.pricePaise : null,
      lineTotalPaise: available ? v.pricePaise * item.quantity : null,
      stock: available ? availabilityOf(stock) : null,
      image: view?.url
        ? {
            url: view.url,
            width: view.width,
            height: view.height,
            alt: view.alt,
            sources: view.sources,
          }
        : null,
    };
  });
  return {
    lines,
    subtotalPaise: subtotal,
    currency: CART_CURRENCY,
    itemCount: count,
    warnings,
  };
}

/**
 * Deletes carts whose expiry has passed, in batches. Concurrent runs are safe:
 * each claims rows with SKIP LOCKED, so a cart is deleted once.
 */
export async function deleteExpiredCarts(
  db: Db,
  now: Date = new Date(),
  batch = 500,
): Promise<number> {
  let total = 0;
  for (;;) {
    const deleted = await db.$executeRaw`
      DELETE FROM "cart" WHERE "id" IN (
        SELECT "id" FROM "cart" WHERE "expires_at" <= ${now}
        ORDER BY "expires_at" LIMIT ${batch} FOR UPDATE SKIP LOCKED)`;
    total += deleted;
    if (deleted < batch) return total;
  }
}
