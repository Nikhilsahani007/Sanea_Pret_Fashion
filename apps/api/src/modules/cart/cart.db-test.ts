// Phase 11 cart tests: guest cart cookie, server-side pricing, live stock
// warnings, the line limit, CSRF, and no stock reserved by adding (SR-2).
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { STOREFRONT, cookiePair } from "../../platform/testing.ts";
import { sha256 } from "../auth/secrets.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";
import { CART_COOKIE } from "./router.ts";
import { deleteExpiredCarts } from "./service.ts";

let h: Harness;
let v1: string;
let v2: string;
let draftVariant: string;

/** A shopper: their CSRF pair and, after the first add, the cart cookie. */
async function shopper() {
  const csrf = await request(h.app)
    .get("/api/v1/auth/csrf")
    .set("Origin", STOREFRONT);
  const token = csrf.body.csrfToken as string;
  const cookies = new Map<string, string>([
    [CSRF_COOKIE, cookiePair(csrf.headers["set-cookie"], CSRF_COOKIE)],
  ]);
  const header = () => [...cookies.values()].join("; ");
  const remember = (res: request.Response) => {
    const set = res.headers["set-cookie"] as unknown as string[] | undefined;
    if (set?.some((c) => c.startsWith(`${CART_COOKIE}=`)))
      cookies.set(CART_COOKIE, cookiePair(set, CART_COOKIE));
    return res;
  };
  const send = (
    method: "post" | "patch" | "delete",
    path: string,
    body?: object,
  ) =>
    request(h.app)
      [method](`/api/v1${path}`)
      .set("Origin", STOREFRONT)
      .set("Cookie", header())
      .set("X-CSRF-Token", token)
      .send(body)
      .then(remember);
  return {
    get: () =>
      request(h.app)
        .get("/api/v1/cart")
        .set("Origin", STOREFRONT)
        .set("Cookie", header()),
    add: (variantId: string, quantity: number) =>
      send("post", "/cart/items", { variantId, quantity }),
    set: (variantId: string, quantity: number) =>
      send("patch", `/cart/items/${variantId}`, { quantity }),
    remove: (variantId: string) => send("delete", `/cart/items/${variantId}`),
    cartToken: () => cookies.get(CART_COOKIE)?.split("=")[1],
  };
}

async function live(onHand: number, price = 129_900) {
  const cat = await fx.category(h.db);
  await h.db.category.update({
    where: { id: cat },
    data: { status: "PUBLISHED" },
  });
  const product = await fx.product(h.db, cat);
  await h.db.product.update({
    where: { id: product },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  const v = await fx.variant(h.db, product);
  await h.db.productVariant.update({
    where: { id: v },
    data: { pricePaise: price },
  });
  await h.db.inventoryLevel.create({ data: { variantId: v, onHand } });
  return v;
}

beforeAll(async () => {
  h = await adminHarness();
  v1 = await live(5, 129_900);
  v2 = await live(1, 249_950);
  draftVariant = await fx.variant(h.db);
  await h.db.inventoryLevel.create({
    data: { variantId: draftVariant, onHand: 5 },
  });
});
afterAll(() => h.drop());

describe("guest cart", () => {
  it("starts empty without creating a cart or a cookie", async () => {
    const s = await shopper();
    const res = await s.get();
    expect(res.body.cart).toEqual({
      lines: [],
      itemCount: 0,
      subtotalPaise: 0,
      currency: "INR",
      readyForCheckout: false,
    });
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("creates the cart on first add with a secure host-only cookie, storing only the token hash", async () => {
    const s = await shopper();
    const res = await s.add(v1, 2);
    expect(res.status).toBe(200);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.startsWith(CART_COOKIE),
    )!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/Secure/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Domain/);
    const token = s.cartToken()!;
    expect(await h.db.cart.count({ where: { tokenHash: sha256(token) } })).toBe(
      1,
    );
    expect(res.body.cart).toMatchObject({
      itemCount: 2,
      subtotalPaise: 259_800,
      readyForCheckout: true,
    });
    expect(res.body.cart.lines[0]).toMatchObject({
      variantId: v1,
      quantity: 2,
      unitPricePaise: 129_900,
      lineTotalPaise: 259_800,
      warning: null,
    });
  });

  it("re-prices every read from the variant, never from the client", async () => {
    const s = await shopper();
    expect((await s.add(v1, 1)).status).toBe(200);
    expect((await s.add(v1, 1)).body.cart.subtotalPaise).toBe(259_800);
    await h.db.productVariant.update({
      where: { id: v1 },
      data: { pricePaise: 139_900 },
    });
    expect((await s.get()).body.cart.subtotalPaise).toBe(279_800);
    await h.db.productVariant.update({
      where: { id: v1 },
      data: { pricePaise: 129_900 },
    });
    const forged = await request(h.app)
      .post("/api/v1/cart/items")
      .set("Origin", STOREFRONT)
      .send({ variantId: v1, quantity: 1, pricePaise: 1 });
    expect(forged.status).toBe(403); // no CSRF token, and unknown fields are rejected too
  });

  it("does not reserve stock (SR-2) and refuses more than is free", async () => {
    const s = await shopper();
    expect((await s.add(v2, 1)).status).toBe(200);
    expect(
      await h.db.inventoryLevel.findUniqueOrThrow({ where: { variantId: v2 } }),
    ).toMatchObject({ onHand: 1, reserved: 0 });
    const over = await s.add(v2, 1);
    expect(over.status).toBe(409);
    expect(over.body.error).toMatchObject({
      code: "OUT_OF_STOCK",
      details: [{ variantId: v2, requested: 2, available: 1 }],
    });
  });

  it("caps a line at ten units", async () => {
    const big = await live(50);
    const s = await shopper();
    await s.add(big, 10);
    const res = await s.add(big, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: "LINE_LIMIT", max: 10 });
    expect((await s.set(big, 11)).status).toBe(400);
  });

  it("refuses draft products", async () => {
    const s = await shopper();
    const res = await s.add(draftVariant, 1);
    expect(res.status).toBe(409);
    expect(res.body.error.details.reason).toBe("UNAVAILABLE");
  });

  it("warns when stock falls below a line, and when a product is withdrawn", async () => {
    const v = await live(3);
    const s = await shopper();
    await s.add(v, 3);
    await h.db.inventoryLevel.update({
      where: { variantId: v },
      data: { onHand: 1 },
    });
    let cart = (await s.get()).body.cart;
    expect(cart.lines[0].warning).toEqual({
      code: "ONLY_N_LEFT",
      available: 1,
    });
    expect(cart.readyForCheckout).toBe(false);
    // Lowering is allowed even while short.
    expect((await s.set(v, 1)).body.cart.lines[0].warning).toBeNull();
    await h.db.productVariant.update({
      where: { id: v },
      data: { isActive: false },
    });
    cart = (await s.get()).body.cart;
    expect(cart.lines[0]).toMatchObject({
      availability: "UNAVAILABLE",
      warning: { code: "UNAVAILABLE" },
    });
    expect(cart.subtotalPaise).toBe(0);
  });

  it("updates and removes lines; zero removes", async () => {
    const s = await shopper();
    await s.add(v1, 1);
    expect((await s.set(v1, 3)).body.cart.itemCount).toBe(3);
    expect((await s.set(v1, 0)).body.cart.lines).toEqual([]);
    await s.add(v1, 1);
    expect((await s.remove(v1)).body.cart.lines).toEqual([]);
  });

  it("cannot change a cart without its cookie", async () => {
    const s = await shopper();
    expect((await s.set(v1, 1)).status).toBe(404);
  });

  it("ignores a forged or unknown cart token", async () => {
    const res = await request(h.app)
      .get("/api/v1/cart")
      .set("Origin", STOREFRONT)
      .set("Cookie", `${CART_COOKIE}=${"A".repeat(43)}`);
    expect(res.body.cart.lines).toEqual([]);
  });

  it("expired carts are invisible and are deleted with their lines", async () => {
    const s = await shopper();
    await s.add(v1, 1);
    const cart = await h.db.cart.findUniqueOrThrow({
      where: { tokenHash: sha256(s.cartToken()!) },
    });
    await h.db.cart.update({
      where: { id: cart.id },
      data: {
        createdAt: new Date("2026-01-01"),
        expiresAt: new Date("2026-01-02"),
      },
    });
    expect((await s.get()).body.cart.lines).toEqual([]);
    expect(await deleteExpiredCarts(h.db, new Date())).toBeGreaterThanOrEqual(
      1,
    );
    expect(await h.db.cartItem.count({ where: { cartId: cart.id } })).toBe(0);
  });

  it("the database rejects quantities outside 1 to 10", async () => {
    const s = await shopper();
    await s.add(v1, 1);
    const cart = await h.db.cart.findUniqueOrThrow({
      where: { tokenHash: sha256(s.cartToken()!) },
    });
    await expect(
      h.db.$executeRawUnsafe(
        `UPDATE "cart_item" SET "quantity" = 11 WHERE "cart_id" = '${cart.id}'`,
      ),
    ).rejects.toThrow(/cart_item_quantity_check/);
  });
});
