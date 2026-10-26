// Checkout and order placement (system-design.md §4.4). The server re-prices
// the cart, checks the rules, reserves stock and creates the order in one
// transaction; the client's total is only compared, never used.
import { createHash, createHmac } from "node:crypto";

import type { Address, PaymentMethod } from "@sanea/shared";

import type { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../platform/http/errors.ts";
import { sha256 } from "../auth/secrets.ts";
import { cartView } from "../cart/service.ts";
import {
  OutOfStock,
  convert,
  outOfStock,
  reserveIn,
} from "../inventory/service.ts";
import type { CheckoutDeps } from "./deps.ts";
import { orderNumber, priceOrder, type PricedLine } from "./pricing.ts";
import { readSettings } from "./settings.ts";

export type PlaceOrderBody = {
  contact: { email: string; phone: string };
  shippingAddress: Address;
  billingAddress?: Address | undefined;
  deliveryMethod: "STANDARD";
  paymentMethod: PaymentMethod;
  expectedTotalPaise: number;
  notes?: string | undefined;
};

/** Re-prices a cart for checkout: live lines, settings, GST rules, COD history. */
export async function quoteCart(
  deps: CheckoutDeps,
  cartId: string | null,
  options: {
    paymentMethod?: PaymentMethod | undefined;
    pinCode?: string | undefined;
    phone?: string | undefined;
  },
) {
  const now = deps.now();
  const view = await cartView(deps.db, deps.storage, cartId);
  const variants = await deps.db.productVariant.findMany({
    where: { id: { in: view.lines.map((l) => l.variantId) } },
    select: { id: true, sku: true, product: { select: { hsnCode: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  // Ready only when every line is on sale (D-099); stock is checked by the
  // reservation itself, all lines or none.
  const readyForCheckout =
    view.lines.length > 0 &&
    view.lines.every((l) => l.available && l.unitPricePaise !== null);
  const lines: PricedLine[] = view.lines
    .filter((l) => l.available && l.unitPricePaise !== null)
    .map((l) => ({
      unitPricePaise: l.unitPricePaise!,
      quantity: l.quantity,
      hsnCode: byId.get(l.variantId)?.product.hsnCode ?? null,
    }));
  const [shipping, cod, gstRules, codRefusals] = await Promise.all([
    readSettings(deps.db, "shipping"),
    readSettings(deps.db, "cod"),
    deps.db.gstRule.findMany(),
    options.phone
      ? deps.db.order.count({
          where: {
            phone: options.phone,
            paymentMethod: "COD",
            status: "RETURN_TO_ORIGIN",
          },
        })
      : Promise.resolve(0),
  ]);
  const quote = priceOrder({
    lines,
    shipping,
    cod,
    gstRules,
    paymentMethod: options.paymentMethod,
    pinCode: options.pinCode,
    codRefusals,
    now,
  });
  return {
    view,
    readyForCheckout,
    skus: new Map(variants.map((v) => [v.id, v.sku])),
    lines,
    quote,
    deliveryEstimate: shipping.deliveryEstimate,
    prepaidAvailable: deps.payments !== null,
  };
}

/** The order access token: derived, so a replayed placement can return it again. */
export function orderAccessToken(secret: string, orderId: string): string {
  return createHmac("sha256", secret)
    .update(`order-access-v1:${orderId}`)
    .digest("base64url");
}

function requestHash(cartId: string, body: PlaceOrderBody): string {
  return createHash("sha256")
    .update(JSON.stringify({ cartId, body }))
    .digest("hex");
}

export async function placeOrder(
  deps: CheckoutDeps,
  input: {
    cartId: string | null;
    idempotencyKey: string;
    body: PlaceOrderBody;
  },
) {
  const { body } = input;
  const hash = requestHash(input.cartId ?? "", body);
  const replay = await findByKey(deps, input.idempotencyKey, hash);
  if (replay) return replay;

  if (!input.cartId) throw new AppError("CART_NOT_READY", { reason: "EMPTY" });
  const priced = await quoteCart(deps, input.cartId, {
    paymentMethod: body.paymentMethod,
    pinCode: body.shippingAddress.pinCode,
    phone: body.contact.phone,
  });
  const { view, quote, readyForCheckout, skus } = priced;
  if (!readyForCheckout)
    throw new AppError("CART_NOT_READY", {
      reason: view.lines.length === 0 ? "EMPTY" : "LINES_CHANGED",
    });
  if (body.paymentMethod === "COD" && !quote.cod.available)
    throw new AppError("COD_NOT_AVAILABLE", { reason: quote.cod.reason });
  if (body.paymentMethod === "PREPAID" && !deps.payments)
    throw new AppError("PAYMENT_METHOD_UNAVAILABLE");
  if (quote.totalPaise !== body.expectedTotalPaise)
    throw new AppError("PRICE_CHANGED", { totalPaise: quote.totalPaise });

  const now = deps.now();
  const hsn = priced.lines.map((l) => l.hsnCode);
  let created: { id: string; orderNumber: string; paymentId: string };
  try {
    created = await deps.db.$transaction(async (tx) => {
      const [seq] = await tx.$queryRaw<{ n: number }[]>`
        SELECT nextval('order_number_seq')::int AS n`;
      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber(now, seq!.n),
          email: body.contact.email,
          phone: body.contact.phone,
          shippingAddress: body.shippingAddress as Prisma.InputJsonObject,
          billingAddress: (body.billingAddress ??
            body.shippingAddress) as Prisma.InputJsonObject,
          status:
            body.paymentMethod === "COD"
              ? "PENDING_CONFIRMATION"
              : "PENDING_PAYMENT",
          paymentMethod: body.paymentMethod,
          subtotalPaise: quote.subtotalPaise,
          discountPaise: quote.discountPaise,
          shippingPaise: quote.shippingPaise,
          codFeePaise: quote.codFeePaise,
          taxPaise: quote.taxPaise,
          totalPaise: quote.totalPaise,
          idempotencyKey: input.idempotencyKey,
          requestHash: hash,
          // Replaced below once the ID is known; a unique placeholder until then.
          accessTokenHash: sha256(`pending:${input.idempotencyKey}`),
          notes: body.notes ?? null,
          placedAt: now,
          items: {
            create: view.lines.map((l, i) => ({
              variantId: l.variantId,
              productName: l.productName,
              variantLabel: `${l.colour.name} / ${l.size}`,
              sku: skus.get(l.variantId) ?? "",
              unitPricePaise: l.unitPricePaise!,
              quantity: l.quantity,
              lineTotalPaise: l.lineTotalPaise!,
              gstRateBps: quote.lineRates[i] ?? null,
              hsnCode: hsn[i] ?? null,
            })),
          },
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          accessTokenHash: sha256(
            orderAccessToken(deps.config.csrfSecret, order.id),
          ),
        },
      });
      await reserveIn(
        tx,
        view.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
        })),
        { ttlMinutes: deps.config.reservationTtlMinutes, orderId: order.id },
      );
      // COD holds stock until dispatch at once (SR-5).
      if (body.paymentMethod === "COD") await convert(tx, order.id);
      await tx.orderStatusEvent.create({
        data: {
          orderId: order.id,
          toStatus: order.status,
          actorType: "CUSTOMER",
          note: "Order placed",
          createdAt: now,
        },
      });
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          method: body.paymentMethod,
          provider: body.paymentMethod === "COD" ? "cod" : deps.payments!.name,
          status: body.paymentMethod === "COD" ? "PENDING" : "CREATED",
          amountPaise: quote.totalPaise,
          createdAt: now,
        },
      });
      // The order now holds the lines; the bag is emptied.
      await tx.cartItem.deleteMany({ where: { cartId: input.cartId! } });
      return {
        id: order.id,
        orderNumber: order.orderNumber,
        paymentId: payment.id,
      };
    });
  } catch (error) {
    if (error instanceof OutOfStock)
      throw await outOfStock(
        deps.db,
        view.lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
        })),
      );
    // The same key placed concurrently: answer as a replay.
    if ((error as { code?: string }).code === "P2002") {
      const again = await findByKey(deps, input.idempotencyKey, hash);
      if (again) return again;
    }
    throw error;
  }
  if (body.paymentMethod === "PREPAID")
    await startPayment(deps, created.paymentId, created.orderNumber);
  return describePlacement(deps, created.id, 201);
}

async function findByKey(deps: CheckoutDeps, key: string, hash: string) {
  const existing = await deps.db.order.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, requestHash: true },
  });
  if (!existing) return null;
  if (existing.requestHash !== hash) throw new AppError("IDEMPOTENCY_CONFLICT");
  return describePlacement(deps, existing.id, 200);
}

/** Opens a provider session for a CREATED payment. */
async function startPayment(
  deps: CheckoutDeps,
  paymentId: string,
  orderNo: string,
) {
  const payment = await deps.db.payment.findUniqueOrThrow({
    where: { id: paymentId },
  });
  const session = await deps.payments!.createPayment({
    orderNumber: orderNo,
    amountPaise: payment.amountPaise,
    idempotencyKey: payment.id,
  });
  await deps.db.payment.update({
    where: { id: paymentId },
    data: {
      providerPaymentId: session.providerPaymentId,
      clientPayload: session.clientPayload as Prisma.InputJsonValue,
    },
  });
}

async function describePlacement(
  deps: CheckoutDeps,
  orderId: string,
  status: 200 | 201,
) {
  return {
    status,
    body: {
      ...(await orderSummary(deps, orderId)),
      accessToken: orderAccessToken(deps.config.csrfSecret, orderId),
    },
  };
}

/** What the guest sees about their order (status page and placement answer). */
export async function orderSummary(deps: CheckoutDeps, orderId: string) {
  const o = await deps.db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      items: { orderBy: { id: "asc" } },
      payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
      reservations: {
        where: { status: "ACTIVE" },
        select: { expiresAt: true },
        take: 1,
      },
    },
  });
  const payment = o.payments[0];
  const address = o.shippingAddress as Address;
  return {
    order: {
      orderNumber: o.orderNumber,
      status: o.status,
      paymentMethod: o.paymentMethod,
      placedAt: o.placedAt.toISOString(),
      email: o.email,
      shipTo: {
        fullName: address.fullName,
        city: address.city,
        pinCode: address.pinCode,
      },
      items: o.items.map((i) => ({
        productName: i.productName,
        variantLabel: i.variantLabel,
        quantity: i.quantity,
        unitPricePaise: i.unitPricePaise,
        lineTotalPaise: i.lineTotalPaise,
      })),
      subtotalPaise: o.subtotalPaise,
      discountPaise: o.discountPaise,
      shippingPaise: o.shippingPaise,
      codFeePaise: o.codFeePaise,
      taxPaise: o.taxPaise,
      totalPaise: o.totalPaise,
      currency: "INR" as const,
      /** While a prepaid order waits for payment, the hold's end. */
      payBy:
        o.status === "PENDING_PAYMENT"
          ? (o.reservations[0]?.expiresAt?.toISOString() ?? null)
          : null,
    },
    payment: payment
      ? {
          method: payment.method,
          status: payment.status,
          clientPayload:
            payment.status === "CREATED"
              ? (payment.clientPayload ?? null)
              : null,
        }
      : null,
  };
}

/**
 * A new payment session for a PENDING_PAYMENT order whose hold is still
 * active (E2E-3). An open session is returned as it is, so retries are safe.
 */
export async function restartPayment(deps: CheckoutDeps, orderId: string) {
  if (!deps.payments) throw new AppError("PAYMENT_METHOD_UNAVAILABLE");
  const now = deps.now();
  const order = await deps.db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      payments: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1 },
    },
  });
  // Live holds by the database clock (Phase 9).
  const [live] = await deps.db.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS "n" FROM "stock_reservation"
    WHERE "order_id" = ${orderId}::uuid AND "status" = 'ACTIVE' AND "expires_at" > now()`;
  if (order.status !== "PENDING_PAYMENT" || (live?.n ?? 0) === 0)
    throw new AppError("INVALID_TRANSITION", { from: order.status });
  const last = order.payments[0];
  if (last?.status === "CREATED" && last.providerPaymentId)
    return orderSummary(deps, orderId);
  const payment = await deps.db.payment.create({
    data: {
      orderId,
      method: "PREPAID",
      provider: deps.payments.name,
      status: "CREATED",
      amountPaise: order.totalPaise,
      createdAt: now,
    },
  });
  await startPayment(deps, payment.id, order.orderNumber);
  return orderSummary(deps, orderId);
}
