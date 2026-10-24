// GST model in the database (D-033, D-167): no overlapping rules, one open
// band per rule, consistent line and order snapshots, and a placement that
// records CGST + SGST or IGST from the seller's state and the delivery state.
// All rates here are made-up TEST values for structure only (B-14).
import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { STOREFRONT, cookiePair } from "../../platform/testing.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";
import { CART_COOKIE } from "../cart/router.ts";

let h: Harness;
let admin: string;
let ip = 0;

const at = (iso: string) => new Date(iso);

async function rule(hsnPrefix: string, from: string, to: string | null) {
  return h.db.gstRule.create({
    data: {
      hsnPrefix,
      effectiveFrom: at(from),
      effectiveTo: to ? at(to) : null,
      note: "TEST rule, not a real rate",
      createdByAdminId: admin,
    },
  });
}

async function live(hsnCode: string, price = 105_000) {
  const cat = await fx.category(h.db);
  await h.db.category.update({
    where: { id: cat },
    data: { status: "PUBLISHED" },
  });
  const product = await fx.product(h.db, cat);
  await h.db.product.update({
    where: { id: product },
    data: { status: "PUBLISHED", publishedAt: new Date(), hsnCode },
  });
  const v = await fx.variant(h.db, product);
  await h.db.productVariant.update({
    where: { id: v },
    data: { pricePaise: price },
  });
  await h.db.inventoryLevel.create({ data: { variantId: v, onHand: 10 } });
  return v;
}

/** Places a COD order for two units, delivered to `state`; returns the order. */
async function place(variantId: string, state: string, total = 210_000) {
  const from = `198.20.0.${++ip}`;
  const csrf = await request(h.app).get("/api/v1/auth/csrf");
  const token = csrf.body.csrfToken as string;
  const cookies = [cookiePair(csrf.headers["set-cookie"], CSRF_COOKIE)];
  const post = (
    path: string,
    body: object,
    extra: Record<string, string> = {},
  ) => {
    const req = request(h.app)
      .post(`/api/v1${path}`)
      .set("Origin", STOREFRONT)
      .set("X-Forwarded-For", from)
      .set("Cookie", cookies.join("; "))
      .set("X-CSRF-Token", token);
    for (const [k, v] of Object.entries(extra)) req.set(k, v);
    return req.send(body);
  };
  const add = await post("/cart/items", { variantId, quantity: 2 });
  cookies.push(cookiePair(add.headers["set-cookie"], CART_COOKIE));
  const res = await post(
    "/checkout/orders",
    {
      contact: { email: "shopper@example.test", phone: "9876543210" },
      shippingAddress: {
        fullName: "TEST Shopper",
        phone: "9876543210",
        line1: "TEST 1 Example Road",
        city: "TEST City",
        state,
        pinCode: "226001",
      },
      deliveryMethod: "STANDARD",
      paymentMethod: "COD",
      expectedTotalPaise: total,
    },
    { "Idempotency-Key": randomUUID() },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return h.db.order.findUniqueOrThrow({
    where: { orderNumber: res.body.order.orderNumber },
    include: { items: true },
  });
}

const setSellerState = (sellerState: string | null) =>
  h.db.storeSetting.upsert({
    where: { key: "tax" },
    create: { key: "tax", value: { sellerState } },
    update: { value: { sellerState } },
  });

beforeAll(async () => {
  h = await adminHarness({ env: { TRUST_PROXY: "1" } });
  admin = await fx.admin(h.db);
});
afterAll(() => h.drop());

describe("rule integrity", () => {
  it("refuses two rules for the same HSN prefix in effect at the same time", async () => {
    await rule("1101", "2026-01-01T00:00:00Z", "2026-07-01T00:00:00Z");
    // Back to back is fine (the end is exclusive); another prefix is fine.
    await rule("1101", "2026-07-01T00:00:00Z", null);
    await rule("110", "2026-01-01T00:00:00Z", null);
    await expect(
      rule("1101", "2026-06-01T00:00:00Z", "2026-08-01T00:00:00Z"),
    ).rejects.toThrow(/gst_rule_no_overlap_excl|exclusion/);
    await expect(rule("1101", "2027-01-01T00:00:00Z", null)).rejects.toThrow(
      /gst_rule_no_overlap_excl|exclusion/,
    );
  });

  it("allows one open price band per rule, positive limits and rates within 0–100 %", async () => {
    const r = await rule("1102", "2026-01-01T00:00:00Z", null);
    await h.db.gstRuleSlab.create({
      data: {
        ruleId: r.id,
        upToUnitPricePaise: null,
        cgstBps: 0,
        sgstBps: 0,
        igstBps: 0,
      },
    });
    await expect(
      h.db.gstRuleSlab.create({
        data: {
          ruleId: r.id,
          upToUnitPricePaise: null,
          cgstBps: 0,
          sgstBps: 0,
          igstBps: 0,
        },
      }),
    ).rejects.toThrow();
    await expect(
      h.db.gstRuleSlab.create({
        data: {
          ruleId: r.id,
          upToUnitPricePaise: 0,
          cgstBps: 0,
          sgstBps: 0,
          igstBps: 0,
        },
      }),
    ).rejects.toThrow(/gst_rule_slab_bound_check/);
    await expect(
      h.db.gstRuleSlab.create({
        data: {
          ruleId: r.id,
          upToUnitPricePaise: 5,
          cgstBps: 10_001,
          sgstBps: 0,
          igstBps: 0,
        },
      }),
    ).rejects.toThrow(/gst_rule_slab_rates_check/);
  });
});

describe("order snapshots", () => {
  it("a line cannot carry both regimes, half a CGST/SGST pair, or an amount without a rate", async () => {
    const id = await fx.order(h.db);
    const v = await fx.variant(h.db);
    const item = (cols: string, vals: string) =>
      h.db.$executeRawUnsafe(
        `INSERT INTO "order_item" ("order_id", "variant_id", "product_name", "variant_label", "sku", "unit_price_paise", "quantity", "line_total_paise"${cols})
         VALUES ('${id}', '${v}', 'TEST', 'TEST', 'TEST-1', 1000, 1, 1000${vals})`,
      );
    await expect(
      item(`, "cgst_bps", "sgst_bps", "igst_bps"`, `, 1, 1, 2`),
    ).rejects.toThrow(/order_item_gst_rates_check/);
    await expect(item(`, "cgst_bps"`, `, 1`)).rejects.toThrow(
      /order_item_gst_rates_check/,
    );
    await expect(item(`, "igst_paise"`, `, 5`)).rejects.toThrow(
      /order_item_gst_amounts_check/,
    );
    await expect(
      item(`, "igst_bps", "igst_paise"`, `, 100, 1001`),
    ).rejects.toThrow(/order_item_gst_amounts_check/);
    await item(`, "igst_bps", "igst_paise"`, `, 100, 10`);
  });

  it("an order's supply type must follow its two states, and GST needs a supply type", async () => {
    const id = await fx.order(h.db);
    const set = (sql: string) =>
      h.db.$executeRawUnsafe(`UPDATE "order" SET ${sql} WHERE "id" = '${id}'`);
    await expect(set(`"supply_type" = 'INTRA_STATE'`)).rejects.toThrow(
      /order_gst_supply_check/,
    );
    await expect(
      set(
        `"seller_state" = 'delhi', "place_of_supply_state" = 'goa', "supply_type" = 'INTRA_STATE'`,
      ),
    ).rejects.toThrow(/order_gst_supply_check/);
    await expect(set(`"tax_paise" = 1`)).rejects.toThrow(
      /order_tax_supply_check/,
    );
    await set(
      `"seller_state" = 'delhi', "place_of_supply_state" = 'goa', "supply_type" = 'INTER_STATE', "tax_paise" = 1`,
    );
  });
});

describe("placement with a TEST rule", () => {
  beforeEach(async () => {
    await setSellerState(null);
  });

  it("records no GST while the seller's state is not entered, even with a rule", async () => {
    const r = await rule("88", "2026-01-01T00:00:00Z", null);
    await h.db.gstRuleSlab.create({
      data: {
        ruleId: r.id,
        upToUnitPricePaise: null,
        cgstBps: 250,
        sgstBps: 250,
        igstBps: 500,
      },
    });
    const o = await place(await live("88123456"), "uttar-pradesh");
    expect(o).toMatchObject({
      taxPaise: 0,
      sellerState: null,
      supplyType: null,
      placeOfSupplyState: "uttar-pradesh",
    });
    expect(o.items[0]).toMatchObject({
      cgstBps: null,
      igstBps: null,
      cgstPaise: 0,
      igstPaise: 0,
    });
  });

  it("intra-state: CGST and SGST on the line, the order's GST is their sum, the total unchanged", async () => {
    await setSellerState("uttar-pradesh");
    const o = await place(await live("88654321"), "uttar-pradesh");
    expect(o).toMatchObject({
      supplyType: "INTRA_STATE",
      sellerState: "uttar-pradesh",
      totalPaise: 210_000,
    });
    const i = o.items[0]!;
    expect(i).toMatchObject({
      cgstBps: 250,
      sgstBps: 250,
      igstBps: null,
      igstPaise: 0,
    });
    expect(i.cgstPaise + i.sgstPaise).toBe(10_000); // 2 × ₹1,050 at a TEST 5 %: 210000 × 500 / 10500
    expect(o.taxPaise).toBe(i.cgstPaise + i.sgstPaise);
  });

  it("inter-state: IGST only", async () => {
    await setSellerState("delhi");
    const o = await place(await live("88000001"), "uttar-pradesh");
    expect(o).toMatchObject({ supplyType: "INTER_STATE", taxPaise: 10_000 });
    expect(o.items[0]).toMatchObject({
      cgstBps: null,
      sgstBps: null,
      igstBps: 500,
      igstPaise: 10_000,
    });
  });
});
