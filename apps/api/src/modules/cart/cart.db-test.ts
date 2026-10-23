// Guest cart against real PostgreSQL (phase-11-plan.md §8; D-099). Cases
// T11-1 to T11-12 each write a `[P11-GATE]` line for the Phase 11 gate
// review. All data here is synthetic, in a disposable database.
import { createHash, randomBytes } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { EMPTY_RICH_TEXT } from "@sanea/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "../../generated/prisma/client.ts";
import { urlFor } from "../../db/testing/database.ts";
import { ADMIN, STOREFRONT } from "../../platform/testing.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";
import { deleteExpiredCarts } from "./service.ts";
import { CART_COOKIE } from "./token.ts";

const C = "/api/v1/cart";
const report = (line: string) => process.stdout.write(`[P11-GATE] ${line}\n`);
const DAY = 24 * 60 * 60 * 1000;

let h: Harness;
let pool: PrismaClient;

beforeAll(async () => {
  // Writes are limited separately in T11-12; here the limit is out of the way.
  h = await adminHarness({ cartLimit: { windowMs: 60_000, limit: 10_000 } });
  pool = new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlFor(h.dbName), max: 10 }),
  });
}, 120_000);
afterAll(async () => {
  await pool.$disconnect();
  await h.drop();
});

type Client = { app: Harness["app"]; csrf: Harness["csrf"] };

/** A shopper: the CSRF pair plus whatever cart cookie the API has set. */
async function shopper(on: Client = h) {
  const csrf = await on.csrf();
  let cart = "";
  const cookies = () => [csrf.cookie, cart].filter(Boolean).join("; ");
  const keep = (res: request.Response) => {
    const set = setCookieOf(res)?.split(";")[0];
    if (set) cart = set;
    return res;
  };
  const write = (
    method: "post" | "patch" | "delete",
    path: string,
    body?: object,
  ) => {
    const r = request(on.app)
      [method](path)
      .set("Origin", STOREFRONT)
      .set("Cookie", cookies())
      .set("X-CSRF-Token", csrf.token);
    return (body === undefined ? r : r.send(body)).then(keep);
  };
  return {
    csrf,
    get token() {
      return cart.split("=")[1] ?? "";
    },
    set cookie(value: string) {
      cart = value;
    },
    get cookie() {
      return cart;
    },
    view: () => request(on.app).get(C).set("Cookie", cookies()).then(keep),
    add: (variantId: string, quantity = 1, extra: object = {}) =>
      write("post", `${C}/items`, { variantId, quantity, ...extra }),
    set: (variantId: string, quantity: number) =>
      write("patch", `${C}/items/${variantId}`, { quantity }),
    remove: (variantId: string) => write("delete", `${C}/items/${variantId}`),
  };
}

let n = 0;
/** A product with `count` variants, each on sale unless told otherwise. */
async function product(
  options: {
    count?: number;
    status?: "PUBLISHED" | "DRAFT" | "ARCHIVED";
    categoryStatus?: "PUBLISHED" | "DRAFT";
    pricePaise?: number;
    onHand?: number;
  } = {},
) {
  const i = ++n;
  const category = await h.db.category.create({
    data: {
      name: `TEST cat ${i}`,
      slug: `test-cart-cat-${i}`,
      status: options.categoryStatus ?? "PUBLISHED",
    },
  });
  const p = await h.db.product.create({
    data: {
      name: `TEST product ${i}`,
      slug: `test-cart-${i}`,
      categoryId: category.id,
      shortDescription: "TEST",
      description: EMPTY_RICH_TEXT,
      status: options.status ?? "PUBLISHED",
      publishedAt: options.status === "DRAFT" ? null : new Date(),
    },
  });
  const sizes = await h.db.size.findMany({ orderBy: { position: "asc" } });
  const variants: string[] = [];
  for (let k = 0; k < (options.count ?? 1); k++) {
    const colour = await h.db.colour.create({
      data: {
        name: `TEST ${i}-${k}`,
        slug: `test-cart-col-${i}-${k}`,
        swatchHex: "#111111",
      },
    });
    const v = await h.db.productVariant.create({
      data: {
        productId: p.id,
        colourId: colour.id,
        sizeId: sizes[k % sizes.length]!.id,
        sku: `TEST-CART-${i}-${k}`,
        pricePaise: options.pricePaise ?? 100_000,
        inventory: { create: { onHand: options.onHand ?? 5 } },
      },
    });
    variants.push(v.id);
  }
  return { product: p, category, variants };
}

const carts = () => h.db.cart.count();
const setCookieOf = (res: request.Response) =>
  ([] as string[])
    .concat(res.headers["set-cookie"] ?? [])
    .find((c) => c.startsWith(`${CART_COOKIE}=`));

describe("the Phase 11 cart gate", () => {
  it("T11-1: prices come from the server; a client price is refused", async () => {
    const { variants } = await product({ pricePaise: 100_000 });
    const s = await shopper();
    const added = await s.add(variants[0]!, 2);
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({
      subtotalPaise: 200_000,
      currency: "INR",
      itemCount: 2,
    });
    expect(added.body.lines[0]).toMatchObject({
      unitPricePaise: 100_000,
      lineTotalPaise: 200_000,
    });
    await h.db.productVariant.update({
      where: { id: variants[0]! },
      data: { pricePaise: 120_000 },
    });
    const repriced = await s.view();
    expect(repriced.body.lines[0]).toMatchObject({
      unitPricePaise: 120_000,
      lineTotalPaise: 240_000,
    });
    expect(repriced.body.subtotalPaise).toBe(240_000);
    const priced = await s.add(variants[0]!, 1, { pricePaise: 1 });
    const total = await s.add(variants[0]!, 1, { subtotalPaise: 1 });
    expect([priced.status, total.status]).toEqual([400, 400]);
    expect((await s.view()).body.lines[0].quantity).toBe(2);
    report(
      "T11-1 add 2 × ₹1,000: subtotal 200000 paise; price changed to 120000: next GET re-priced (line 240000, subtotal 240000); body with pricePaise or subtotalPaise: 400, quantity unchanged",
    );
  });

  it("T11-2: one cart's token never reaches another cart; forged or expired tokens get an empty cart", async () => {
    const { variants } = await product({ count: 2 });
    const a = await shopper();
    const b = await shopper();
    await a.add(variants[0]!, 1);
    await b.add(variants[1]!, 3);
    expect(a.token).not.toBe(b.token);
    const bView = await b.view();
    expect(
      bView.body.lines.map((l: { variantId: string }) => l.variantId),
    ).toEqual([variants[1]]);
    // B tries to change and remove A's line: B has no such line.
    expect((await b.set(variants[0]!, 5)).status).toBe(404);
    expect((await b.remove(variants[0]!)).status).toBe(404);
    expect((await a.view()).body.lines[0].quantity).toBe(1);
    // A forged token, well formed: the empty cart, and nothing to change.
    const forged = await shopper();
    forged.cookie = `${CART_COOKIE}=${randomBytes(32).toString("base64url")}`;
    const forgedView = await forged.view();
    expect(forgedView.body).toMatchObject({ lines: [], itemCount: 0 });
    const forgedPatch = await forged.set(variants[0]!, 2);
    const malformed = await shopper();
    malformed.cookie = `${CART_COOKIE}=not-a-token`;
    const malformedPatch = await malformed.set(variants[0]!, 2);
    // Expired: 31 days without a write.
    h.clock.advance(31 * DAY);
    const expiredView = await a.view();
    const expiredPatch = await a.set(variants[0]!, 2);
    expect(expiredView.body.lines).toEqual([]);
    // Same answer for no line, a forged, a malformed and an expired token.
    for (const r of [forgedPatch, malformedPatch, expiredPatch]) {
      expect(r.status).toBe(404);
      expect(r.body.error.code).toBe("NOT_FOUND");
      expect(r.body.error.message).toBe(forgedPatch.body.error.message);
    }
    const old = a.token;
    await a.add(variants[0]!, 1);
    expect(a.token).not.toBe(old);
    report(
      "T11-2 cart B cannot read, change (404) or remove (404) cart A's line; forged and malformed tokens: empty cart, 404 identical to no line; after 31 days: empty, 404, and the next add issues a new token",
    );
  });

  it("T11-3: only the SHA-256 of the token is stored, and the token is never logged", async () => {
    const { variants } = await product();
    const s = await shopper();
    await s.add(variants[0]!, 1);
    const token = s.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = createHash("sha256").update(token).digest();
    const row = await h.db.cart.findUniqueOrThrow({
      where: { tokenHash: new Uint8Array(digest) },
    });
    expect(Buffer.from(row.tokenHash).equals(digest)).toBe(true);
    // The raw token appears in no row of any table.
    const tables = await h.db.$queryRawUnsafe<{ t: string }[]>(
      `SELECT relname AS t FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'`,
    );
    for (const { t } of tables) {
      const [hit] = await h.db.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "${t}" x WHERE x::text LIKE '%' || $1 || '%'`,
        token,
      );
      expect(hit?.n, t).toBe(0);
    }
    expect(h.lines.join("\n")).not.toContain(token);
    report(
      `T11-3 stored token_hash = SHA-256(cookie value) (32 bytes); raw token found in 0 of ${tables.length} tables and 0 of ${h.lines.length} log lines`,
    );
  });

  it("T11-4: quantity and line limits, in the API and the database", async () => {
    const { variants } = await product({ count: 31 });
    const s = await shopper();
    const eleven = await s.add(variants[0]!, 11);
    expect(eleven.status).toBe(400);
    await s.add(variants[0]!, 6);
    const capped = await s.add(variants[0]!, 6);
    expect(capped.status).toBe(200);
    expect(capped.body.lines[0].quantity).toBe(10);
    expect(capped.body.warnings).toContainEqual({
      variantId: variants[0],
      code: "QUANTITY_LIMIT",
    });
    expect((await s.set(variants[0]!, 11)).status).toBe(400);
    const check = await h.db
      .$executeRawUnsafe(`UPDATE "cart_item" SET "quantity" = 11`)
      .then(
        () => "accepted",
        (e: Error) => /cart_item_quantity_check/.test(e.message),
      );
    expect(check).toBe(true);
    for (const v of variants.slice(1, 30))
      expect((await s.add(v, 1)).status).toBe(200);
    const full = await s.add(variants[30]!, 1);
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe("CART_FULL");
    expect((await s.view()).body.lines).toHaveLength(30);
    // A lowered limit (CART_MAX_LINE_QUANTITY=3) on its own app.
    const low = await adminHarness({ env: { CART_MAX_LINE_QUANTITY: "3" } });
    try {
      const { variants: lv } = await (async () => {
        const saved = h;
        h = low;
        try {
          return await product();
        } finally {
          h = saved;
        }
      })();
      const t = await shopper(low);
      expect((await t.add(lv[0]!, 4)).status).toBe(400);
      await t.add(lv[0]!, 3);
      const lowCapped = await t.add(lv[0]!, 1);
      expect(lowCapped.body.lines[0].quantity).toBe(3);
      expect(lowCapped.body.warnings[0].code).toBe("QUANTITY_LIMIT");
      expect((await t.set(lv[0]!, 4)).status).toBe(400);
    } finally {
      await low.drop();
    }
    report(
      "T11-4 quantity 11: 400 (API) and cart_item_quantity_check (database); 6 + 6 capped at 10 with QUANTITY_LIMIT; 31st line: 409 CART_FULL, 30 lines kept; CART_MAX_LINE_QUANTITY=3: add 4 and PATCH 4 refused (400), 3 + 1 capped at 3",
    );
  });

  it("T11-5: stock warnings, and lines that are no longer on sale", async () => {
    const { variants, product: p } = await product({ count: 2, onHand: 2 });
    const s = await shopper();
    const over = await s.add(variants[0]!, 3);
    expect(over.status).toBe(200);
    expect(over.body.lines[0]).toMatchObject({
      quantity: 3,
      available: true,
      stock: { availability: "LOW_STOCK", remaining: 2 },
    });
    expect(over.body.warnings).toContainEqual({
      variantId: variants[0],
      code: "EXCEEDS_AVAILABLE",
    });
    await s.add(variants[1]!, 1);
    await h.db.productVariant.update({
      where: { id: variants[1]! },
      data: { isActive: false },
    });
    const view = await s.view();
    const gone = view.body.lines.find(
      (l: { variantId: string }) => l.variantId === variants[1],
    );
    expect(gone).toMatchObject({
      available: false,
      unitPricePaise: null,
      lineTotalPaise: null,
      stock: null,
      image: null,
    });
    expect(view.body.subtotalPaise).toBe(300_000);
    expect(view.body.itemCount).toBe(4);
    expect(view.body.warnings).toContainEqual({
      variantId: variants[1],
      code: "UNAVAILABLE",
    });
    await h.db.product.update({
      where: { id: p.id },
      data: { status: "ARCHIVED" },
    });
    const archived = await s.view();
    expect(archived.body.subtotalPaise).toBe(0);
    expect(
      archived.body.lines.every((l: { available: boolean }) => !l.available),
    ).toBe(true);
    report(
      "T11-5 quantity 3 with 2 available: accepted, EXCEEDS_AVAILABLE, stock LOW_STOCK remaining 2; deactivated variant: unavailable, no price, outside the subtotal (300000 of 4 units), UNAVAILABLE; product archived: subtotal 0",
    );
  });

  it("T11-5 (Q11-12, D-135): lines show only the catalogue's public stock state, never a count above the low-stock level", async () => {
    // Low-stock level 2 (the default): 7 and 0 on hand.
    const plenty = await product({ onHand: 7 });
    const none = await product({ onHand: 0 });
    const s = await shopper();
    const one = await s.add(plenty.variants[0]!, 1);
    const line = one.body.lines[0];
    expect(line.stock).toEqual({ availability: "IN_STOCK" });
    expect(Object.keys(line).sort()).toEqual([
      "available",
      "colour",
      "image",
      "lineTotalPaise",
      "productName",
      "productSlug",
      "quantity",
      "size",
      "stock",
      "unitPricePaise",
      "variantId",
    ]);
    expect(JSON.stringify(one.body)).not.toMatch(/onHand|reserved|remaining/);
    // Above what is available: warned, and still no count.
    const nine = await s.add(plenty.variants[0]!, 8);
    expect(nine.body.lines[0].stock).toEqual({ availability: "IN_STOCK" });
    expect(nine.body.warnings).toContainEqual({
      variantId: plenty.variants[0],
      code: "EXCEEDS_AVAILABLE",
    });
    expect(JSON.stringify(nine.body)).not.toMatch(/onHand|reserved|remaining/);
    // Sold out: the state and the warning, no count.
    const out = await s.add(none.variants[0]!, 1);
    const soldOut = out.body.lines.find(
      (l: { variantId: string }) => l.variantId === none.variants[0],
    );
    expect(soldOut.stock).toEqual({ availability: "SOLD_OUT" });
    expect(out.body.warnings).toContainEqual({
      variantId: none.variants[0],
      code: "EXCEEDS_AVAILABLE",
    });
    // Stock itself is unchanged by the cart (SR-2).
    expect(
      (
        await h.db.inventoryLevel.findUniqueOrThrow({
          where: { variantId: plenty.variants[0]! },
        })
      ).reserved,
    ).toBe(0);
    report(
      "T11-5 (Q11-12) 7 on hand, low-stock level 2: line stock {IN_STOCK} with no count, no onHand, reserved or remaining field; 9 in the bag: EXCEEDS_AVAILABLE, still no count; 0 on hand: {SOLD_OUT} and EXCEEDS_AVAILABLE; reserved stays 0",
    );
  });

  it("T11-6: adding to the cart reserves nothing (SR-2)", async () => {
    const { variants } = await product({ onHand: 4 });
    const before = await h.db.inventoryLevel.findUniqueOrThrow({
      where: { variantId: variants[0]! },
    });
    const reservations = await h.db.stockReservation.count();
    const s = await shopper();
    await s.add(variants[0]!, 3);
    await s.set(variants[0]!, 4);
    const after = await h.db.inventoryLevel.findUniqueOrThrow({
      where: { variantId: variants[0]! },
    });
    expect([after.onHand, after.reserved]).toEqual([
      before.onHand,
      before.reserved,
    ]);
    expect(await h.db.stockReservation.count()).toBe(reservations);
    expect(
      await h.db.stockMovement.count({ where: { variantId: variants[0]! } }),
    ).toBe(0);
    report(
      `T11-6 add 3 then set 4: on hand ${after.onHand}, reserved ${after.reserved} (unchanged), no reservation or stock movement`,
    );
  });

  it("T11-7: writes need the CSRF token and the storefront Origin", async () => {
    const { variants } = await product();
    const s = await shopper();
    const count = await carts();
    const body = { variantId: variants[0], quantity: 1 };
    const noToken = await request(h.app)
      .post(`${C}/items`)
      .set("Origin", STOREFRONT)
      .set("Cookie", s.csrf.cookie)
      .send(body);
    const wrongToken = await request(h.app)
      .post(`${C}/items`)
      .set("Origin", STOREFRONT)
      .set("Cookie", s.csrf.cookie)
      .set("X-CSRF-Token", `${s.csrf.token.slice(0, -2)}xx`)
      .send(body);
    const adminOrigin = await request(h.app)
      .post(`${C}/items`)
      .set("Origin", ADMIN)
      .set("Cookie", s.csrf.cookie)
      .set("X-CSRF-Token", s.csrf.token)
      .send(body);
    const foreign = await request(h.app)
      .post(`${C}/items`)
      .set("Origin", "https://evil.example")
      .set("Cookie", s.csrf.cookie)
      .set("X-CSRF-Token", s.csrf.token)
      .send(body);
    for (const r of [noToken, wrongToken, adminOrigin, foreign]) {
      expect(r.status).toBe(403);
      expect(r.body.error.code).toBe("CSRF_FAILED");
      expect(setCookieOf(r)).toBeUndefined();
    }
    expect(await carts()).toBe(count);
    report(
      "T11-7 cart add without the CSRF token, with a wrong token, from the admin origin and from a foreign origin: 403 CSRF_FAILED, no cart created, no cookie",
    );
  });

  it("T11-8: GET /cart without a cookie creates no cart and sets no cookie", async () => {
    const count = await carts();
    const r = await request(h.app).get(C);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      lines: [],
      subtotalPaise: 0,
      currency: "INR",
      itemCount: 0,
      warnings: [],
    });
    expect(r.headers["set-cookie"]).toBeUndefined();
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(await carts()).toBe(count);
    report(
      "T11-8 GET /cart with no cookie: 200 empty cart, no-store, no Set-Cookie, no row created",
    );
  });

  it("T11-9: expired carts are deleted once, safely in parallel", async () => {
    const now = h.clock.now();
    const make = (days: number) =>
      h.db.cart.create({
        data: {
          tokenHash: new Uint8Array(randomBytes(32)),
          createdAt: new Date(now.getTime() - 40 * DAY),
          expiresAt: new Date(now.getTime() + days * DAY),
        },
      });
    const { variants } = await product();
    // Carts left expired by earlier cases (T11-2 moves the clock) count too.
    const earlier = await h.db.cart.count({
      where: { expiresAt: { lte: now } },
    });
    const expired = await Promise.all(
      Array.from({ length: 50 }, () => make(-1)),
    );
    const live = await Promise.all(Array.from({ length: 5 }, () => make(1)));
    for (const c of expired.slice(0, 10))
      await h.db.cartItem.create({
        data: { cartId: c.id, variantId: variants[0]!, quantity: 1 },
      });
    const [one, two] = await Promise.all([
      deleteExpiredCarts(pool, now, 7),
      deleteExpiredCarts(pool, now, 7),
    ]);
    const left = await h.db.cart.findMany({
      where: { id: { in: [...expired, ...live].map((c) => c.id) } },
    });
    expect(one + two).toBe(50 + earlier);
    expect(await h.db.cart.count({ where: { expiresAt: { lte: now } } })).toBe(
      0,
    );
    expect(left.map((c) => c.id).sort()).toEqual(live.map((c) => c.id).sort());
    expect(
      await h.db.cartItem.count({
        where: { cartId: { in: expired.map((c) => c.id) } },
      }),
    ).toBe(0);
    expect(await deleteExpiredCarts(pool, now, 7)).toBe(0);
    report(
      `T11-9 ${50 + earlier} expired (50 made here, ${earlier} from earlier cases) and 5 live carts, two cleanups in parallel (batch 7): deleted ${one} + ${two} = ${one + two}, each once; 5 live kept; expired lines gone; a third run deletes 0`,
    );
  });

  it("T11-10: the cookie's attributes; writes renew it, reads do not; refused adds create nothing", async () => {
    const { variants } = await product();
    const s = await shopper();
    const count = await carts();
    // Refused adds first: no cart, no cookie.
    const unknown = await s.add("0199f0a0-0000-7000-8000-00000000abcd", 1);
    const invalid = await s.add(variants[0]!, 0);
    const refused = [unknown, invalid];
    expect(refused.map((r) => r.status)).toEqual([404, 400]);
    for (const r of refused) expect(setCookieOf(r)).toBeUndefined();
    expect(await carts()).toBe(count);
    const first = await s.add(variants[0]!, 1);
    const cookie = setCookieOf(first)!;
    expect(cookie).toMatch(/^__Host-sp_cart=[A-Za-z0-9_-]{43};/);
    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=2592000",
    ])
      expect(cookie).toContain(attribute);
    expect(cookie).not.toMatch(/Domain=/i);
    const hash = new Uint8Array(createHash("sha256").update(s.token).digest());
    const created = await h.db.cart.findUniqueOrThrow({
      where: { tokenHash: hash },
    });
    h.clock.advance(DAY);
    const read = await s.view();
    expect(setCookieOf(read)).toBeUndefined();
    expect(
      (await h.db.cart.findUniqueOrThrow({ where: { tokenHash: hash } }))
        .expiresAt,
    ).toEqual(created.expiresAt);
    const write = await s.set(variants[0]!, 2);
    expect(setCookieOf(write)).toContain(`${CART_COOKIE}=${s.token};`);
    const renewed = await h.db.cart.findUniqueOrThrow({
      where: { tokenHash: hash },
    });
    expect(renewed.expiresAt.getTime() - created.expiresAt.getTime()).toBe(DAY);
    report(
      "T11-10 first add sets __Host-sp_cart (43-character token; HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age=2592000, no Domain); GET a day later: no Set-Cookie, expiry unchanged; PATCH: cookie re-sent, expiry +1 day; refused adds (404 unknown variant, 400 quantity 0): no cart, no cookie (403 in T11-7, 429 in T11-12)",
    );
  });

  it("T11-11: only variants on sale can be added", async () => {
    const inactive = await product();
    await h.db.productVariant.update({
      where: { id: inactive.variants[0]! },
      data: { isActive: false },
    });
    const draft = await product({ status: "DRAFT" });
    const archived = await product({ status: "ARCHIVED" });
    const hiddenCategory = await product({ categoryStatus: "DRAFT" });
    const s = await shopper();
    const count = await carts();
    const results = await Promise.all(
      [inactive, draft, archived, hiddenCategory].map((p) =>
        s.add(p.variants[0]!, 1),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    const badParam = await s.set("not-a-uuid", 1);
    expect(badParam.status).toBe(404);
    expect(await carts()).toBe(count);
    report(
      "T11-11 add an inactive variant, a draft product's, an archived product's, a product in a draft category: 404 each, no cart; a non-uuid variant in the path: 404 (an existing line that stops being on sale: T11-5)",
    );
  });
});

describe("rate limit", () => {
  it("T11-12: the 61st cart write in a minute from one IP gets 429 RATE_LIMITED", async () => {
    const limited = await adminHarness();
    try {
      const s = await shopper(limited);
      const count = await limited.db.cart.count();
      const codes: number[] = [];
      for (let i = 0; i < 60; i++)
        codes.push(
          (await s.add("0199f0a0-0000-7000-8000-00000000abcd", 0)).status,
        );
      const last = await s.add("0199f0a0-0000-7000-8000-00000000abcd", 1);
      expect(codes.every((c) => c === 400)).toBe(true);
      expect(last.status).toBe(429);
      expect(last.body.error.code).toBe("RATE_LIMITED");
      expect(Number(last.headers["retry-after"])).toBeGreaterThan(0);
      expect(setCookieOf(last)).toBeUndefined();
      expect(await limited.db.cart.count()).toBe(count);
      // Reads are not cart writes.
      expect((await s.view()).status).toBe(200);
      report(
        `T11-12 60 cart writes then the 61st: 429 RATE_LIMITED, Retry-After ${last.headers["retry-after"]} s, no cart, no cookie; GET still 200`,
      );
    } finally {
      await limited.drop();
    }
  });
});
