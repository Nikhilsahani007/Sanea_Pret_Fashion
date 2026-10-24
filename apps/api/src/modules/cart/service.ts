// Guest cart (system-design.md §3). Lines store variant and quantity only;
// every read re-prices from current variant prices and live stock (SR-2:
// adding to the cart reserves nothing). Expires 30 days after the last change.
import { availabilityOf, multiplyPaise, paise, sumPaise } from "@sanea/shared";

import type { Db } from "../../platform/db.ts";
import { sha256 } from "../auth/secrets.ts";
import { imageSources } from "../media/urls.ts";

export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_LINE_QUANTITY = 10; // D-115

export class CartRuleViolation extends Error {
  readonly code: "OUT_OF_STOCK" | "LINE_LIMIT" | "UNAVAILABLE";
  readonly details: unknown;
  constructor(code: CartRuleViolation["code"], details: unknown) {
    super(code);
    this.name = "CartRuleViolation";
    this.code = code;
    this.details = details;
  }
}

export async function findCart(db: Db, token: string | undefined, now: Date) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const cart = await db.cart.findUnique({
    where: { tokenHash: sha256(token) },
  });
  return cart && cart.expiresAt > now ? cart : null;
}

/** A variant can be bought when it and its product and category are live. */
async function purchasable(db: Db, variantId: string) {
  const v = await db.productVariant.findFirst({
    where: {
      id: variantId,
      isActive: true,
      product: { status: "PUBLISHED", category: { status: "PUBLISHED" } },
    },
    include: { inventory: true },
  });
  if (!v) return null;
  return {
    available: Math.max(
      0,
      (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0),
    ),
  };
}

/** Sets a line's quantity after checking the line limit and live stock. */
export async function setLine(
  db: Db,
  cartId: string,
  variantId: string,
  quantity: number,
  mode: "add" | "set",
  now: Date,
) {
  const existing = await db.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId } },
  });
  const target =
    mode === "add" ? (existing?.quantity ?? 0) + quantity : quantity;
  if (target <= 0) {
    if (existing)
      await db.cartItem.delete({
        where: { cartId_variantId: { cartId, variantId } },
      });
  } else {
    if (target > MAX_LINE_QUANTITY)
      throw new CartRuleViolation("LINE_LIMIT", { max: MAX_LINE_QUANTITY });
    const stock = await purchasable(db, variantId);
    if (!stock) throw new CartRuleViolation("UNAVAILABLE", { variantId });
    // Lowering a quantity is always allowed; raising it needs the stock now.
    if (target > (existing?.quantity ?? 0) && target > stock.available)
      throw new CartRuleViolation("OUT_OF_STOCK", [
        { variantId, requested: target, available: stock.available },
      ]);
    await db.cartItem.upsert({
      where: { cartId_variantId: { cartId, variantId } },
      create: { cartId, variantId, quantity: target },
      update: { quantity: target },
    });
  }
  await db.cart.update({
    where: { id: cartId },
    data: { expiresAt: new Date(now.getTime() + CART_TTL_MS) },
  });
}

export type CartLineView = Awaited<
  ReturnType<typeof cartView>
>["lines"][number];

/** The cart as the shopper sees it: re-priced, with live stock warnings. */
export async function cartView(db: Db, cartId: string | null, baseUrl: string) {
  const items = cartId
    ? await db.cartItem.findMany({
        where: { cartId },
        orderBy: { createdAt: "asc" },
        include: {
          variant: {
            include: {
              inventory: true,
              colour: true,
              size: true,
              product: {
                include: {
                  category: { select: { status: true } },
                  images: {
                    where: { role: "PRIMARY" },
                    orderBy: { position: "asc" },
                    include: { mediaAsset: true },
                  },
                },
              },
            },
          },
        },
      })
    : [];
  const lines = items.map((item) => {
    const v = item.variant;
    const p = v.product;
    const live =
      v.isActive &&
      p.status === "PUBLISHED" &&
      p.category.status === "PUBLISHED";
    const stock = availabilityOf(
      v.inventory ?? { onHand: 0, reserved: 0, lowStockThreshold: 0 },
    );
    const free = Math.max(
      0,
      (v.inventory?.onHand ?? 0) - (v.inventory?.reserved ?? 0),
    );
    const image =
      p.images.find((i) => i.colourId === v.colourId) ??
      p.images.find((i) => i.colourId === null) ??
      p.images[0];
    const sources = image ? imageSources(baseUrl, image.mediaAsset) : null;
    let warning:
      | null
      | { code: "UNAVAILABLE" }
      | { code: "SOLD_OUT" }
      | { code: "ONLY_N_LEFT"; available: number } = null;
    if (!live) warning = { code: "UNAVAILABLE" };
    else if (free === 0) warning = { code: "SOLD_OUT" };
    else if (item.quantity > free)
      warning = { code: "ONLY_N_LEFT", available: free };
    return {
      variantId: v.id,
      sku: v.sku,
      productSlug: p.slug,
      productName: p.name,
      colour: v.colour.name,
      size: v.size.label,
      quantity: item.quantity,
      unitPricePaise: v.pricePaise,
      compareAtPricePaise: v.compareAtPricePaise,
      lineTotalPaise: multiplyPaise(paise(v.pricePaise), item.quantity),
      availability: live ? stock.availability : ("UNAVAILABLE" as const),
      warning,
      image: sources && image ? { ...sources, alt: image.alt } : null,
    };
  });
  const payable = lines.filter((l) => l.availability !== "UNAVAILABLE");
  return {
    lines,
    itemCount: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalPaise: sumPaise(payable.map((l) => paise(l.lineTotalPaise))),
    currency: "INR" as const,
    readyForCheckout:
      lines.length > 0 && lines.every((l) => l.warning === null),
  };
}

export async function deleteExpiredCarts(db: Db, now: Date): Promise<number> {
  const { count } = await db.cart.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return count;
}
