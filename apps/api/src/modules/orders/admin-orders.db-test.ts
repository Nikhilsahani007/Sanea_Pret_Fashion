// Phase 16 admin operations (project-requirements.md §3.2): order list and
// detail, transitions by role (E2E-2 admin part at API level), notes, refunds,
// restock, packing slip, enquiries inbox, dashboard, and order emails.
import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { STOREFRONT, cookiePair } from "../../platform/testing.ts";
import { adminHarness, type Harness, type Session } from "../auth/testing.ts";
import { CART_COOKIE } from "../cart/router.ts";
import { createMockProvider, type MockProvider } from "../payments/mock.ts";

let h: Harness;
let mock: MockProvider;
const s: Record<"O" | "M" | "F" | "C", Session> = {} as never;
let ip = 0;

async function live(onHand: number, price = 349_900) {
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

/** Places a one-unit order as a guest and returns its number. */
async function place(method: "COD" | "PREPAID", v?: string) {
  const variant = v ?? (await live(5));
  const from = `198.19.0.${++ip}`;
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
    for (const [k, val] of Object.entries(extra)) req.set(k, val);
    return req.send(body);
  };
  const add = await post("/cart/items", { variantId: variant, quantity: 1 });
  cookies.push(cookiePair(add.headers["set-cookie"], CART_COOKIE));
  const res = await post(
    "/checkout/orders",
    {
      contact: { email: "shopper@example.test", phone: "9876543210" },
      shippingAddress: {
        fullName: "TEST Shopper",
        phone: "9876543210",
        line1: "TEST 1 Example Road",
        city: "Lucknow",
        state: "uttar-pradesh",
        pinCode: "226001",
      },
      deliveryMethod: "STANDARD",
      paymentMethod: method,
      expectedTotalPaise: 349_900,
    },
    { "Idempotency-Key": randomUUID() },
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const no = res.body.order.orderNumber as string;
  if (method === "PREPAID") {
    const pay = await h.db.payment.findFirstOrThrow({
      where: { order: { orderNumber: no } },
    });
    await post(
      `/checkout/mock/${pay.providerPaymentId}`,
      { outcome: "success" },
      {
        "X-Order-Token": res.body.accessToken as string,
      },
    );
  }
  return { no, variant };
}

const move = (no: string, body: object, who: Session = s.F) =>
  h.post(`/api/v1/admin/orders/${no}/transitions`, body, who);
const level = (variantId: string) =>
  h.db.inventoryLevel.findUniqueOrThrow({ where: { variantId } });

beforeAll(async () => {
  mock = createMockProvider({ nodeEnv: "test", secret: "t".repeat(32) });
  h = await adminHarness({ payments: mock, env: { TRUST_PROXY: "1" } });
  s.O = await h.signIn(await h.createAdmin("OWNER"));
  s.M = await h.signIn(await h.createAdmin("MANAGER"));
  s.F = await h.signIn(await h.createAdmin("FULFILMENT"));
  s.C = await h.signIn(await h.createAdmin("CATALOGUE_EDITOR"));
});
afterAll(() => h.drop());

describe("order list and detail", () => {
  it("lists with filters for O, M and F; catalogue editors cannot see orders", async () => {
    const { no } = await place("COD");
    const list = await h.get(
      "/api/v1/admin/orders?status=PENDING_CONFIRMATION",
      s.F,
    );
    expect(list.status).toBe(200);
    expect(list.headers["cache-control"]).toBe("no-store");
    expect(
      list.body.orders.map((o: { orderNumber: string }) => o.orderNumber),
    ).toContain(no);
    expect(list.body.orders[0]).toMatchObject({
      customerName: "TEST Shopper",
      city: "Lucknow",
    });
    const byQ = await h.get(`/api/v1/admin/orders?q=${no}`, s.M);
    expect(byQ.body.orders).toHaveLength(1);
    expect(
      (await h.get("/api/v1/admin/orders?status=DELIVERED", s.O)).body.orders,
    ).toEqual([]);
    expect((await h.get("/api/v1/admin/orders", s.C)).status).toBe(403);
    expect((await h.get("/api/v1/admin/orders?bogus=1", s.O)).status).toBe(400);
  });

  it("detail shows the moves the role may make", async () => {
    const { no } = await place("COD");
    const f = await h.get(`/api/v1/admin/orders/${no}`, s.F);
    expect(f.body.nextStatuses).toEqual(["CONFIRMED", "CANCELLED"]);
    expect(f.body.order.items).toHaveLength(1);
    expect(f.body.order.events).toMatchObject([
      { toStatus: "PENDING_CONFIRMATION", actorType: "CUSTOMER" },
    ]);
    await move(no, { toStatus: "CONFIRMED" });
    expect(
      (await h.get(`/api/v1/admin/orders/${no}`, s.F)).body.nextStatuses,
    ).toEqual(["PACKED"]);
    expect(
      (await h.get(`/api/v1/admin/orders/${no}`, s.M)).body.nextStatuses,
    ).toEqual(["PACKED", "CANCELLED"]);
    expect(
      (await h.get("/api/v1/admin/orders/SP-0000-000000", s.O)).status,
    ).toBe(404);
  });
});

describe("E2E-2 admin part at the API: confirm, pack, ship, deliver", () => {
  it("moves a COD order to delivery, takes stock out, collects payment and sends emails", async () => {
    const { no, variant } = await place("COD");
    expect(
      (await move(no, { toStatus: "CONFIRMED", note: "Called the customer" }))
        .status,
    ).toBe(200);
    expect((await move(no, { toStatus: "PACKED" })).status).toBe(200);
    const noShipment = await move(no, { toStatus: "SHIPPED" });
    expect(noShipment.status).toBe(400);
    const shipped = await move(no, {
      toStatus: "SHIPPED",
      shipment: {
        courierName: "TEST Courier",
        trackingNumber: "TEST-TRK-1",
        trackingUrl: "https://track.example.test/1",
      },
    });
    expect(shipped.status).toBe(200);
    expect(await level(variant)).toMatchObject({ onHand: 4, reserved: 0 });
    expect((await move(no, { toStatus: "DELIVERED" })).status).toBe(200);
    const d = (await h.get(`/api/v1/admin/orders/${no}`, s.O)).body.order;
    expect(d.status).toBe("DELIVERED");
    expect(d.payments[0].status).toBe("COLLECTED");
    expect(d.shipments[0]).toMatchObject({ courierName: "TEST Courier" });
    expect(d.events.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "PACKED",
      "SHIPPED",
      "DELIVERED",
    ]);
    expect(d.events[1]).toMatchObject({
      actorType: "ADMIN",
      note: "Called the customer",
    });
    expect(d.events[1].actorName).toMatch(/^TEST FULFILMENT/);
    const sent = await h.db.notification.findMany({
      where: { order: { orderNumber: no } },
      orderBy: { createdAt: "asc" },
    });
    expect(sent.map((n) => n.template)).toEqual([
      "order.placed_cod",
      "order.confirmed",
      "order.shipped",
    ]);
    expect(sent.every((n) => n.status === "SENT" && n.provider === "log")).toBe(
      true,
    );
    const audit = await h.db.auditLog.findMany({
      where: { action: "order.status_changed" },
    });
    expect(audit.length).toBeGreaterThanOrEqual(4);
    expect(JSON.stringify(audit)).not.toContain("shopper@example.test");
  });

  it("Fulfilment cannot cancel a confirmed order; Manager can, the stock returns and a cancel email goes", async () => {
    const { no, variant } = await place("COD");
    await move(no, { toStatus: "CONFIRMED" });
    const f = await move(no, { toStatus: "CANCELLED" });
    expect(f.status).toBe(409);
    expect(f.body.error.code).toBe("INVALID_TRANSITION");
    expect((await move(no, { toStatus: "CANCELLED" }, s.M)).status).toBe(200);
    expect(await level(variant)).toMatchObject({ reserved: 0, onHand: 5 });
    expect(
      await h.db.notification.count({
        where: { order: { orderNumber: no }, template: "order.cancelled" },
      }),
    ).toBe(1);
    expect((await move(no, { toStatus: "CONFIRMED" }, s.O)).status).toBe(409);
  });

  it("catalogue editors cannot move orders; unknown statuses are 400", async () => {
    const { no } = await place("COD");
    expect((await move(no, { toStatus: "CONFIRMED" }, s.C)).status).toBe(403);
    expect((await move(no, { toStatus: "LOST" })).status).toBe(400);
    expect(
      (
        await move(no, {
          toStatus: "SHIPPED",
          shipment: {
            courierName: "X",
            trackingNumber: "1",
            trackingUrl: "http://x.test",
          },
        })
      ).status,
    ).toBe(400);
  });
});

// Cancellation by role and state, through the real route. This pins the
// behaviour implemented today, which is NOT an approved policy: D-160 is open
// and the specifications disagree (system-design.md §5 lines 137 and 142,
// security-design.md §4). Changing the policy must change this table.
describe("cancellation by role (current behaviour, pending D-160)", () => {
  const roles = ["O", "M", "F", "C"] as const;
  const expected = {
    PENDING_CONFIRMATION: { O: 200, M: 200, F: 200, C: 403 },
    CONFIRMED: { O: 200, M: 200, F: 409, C: 403 },
  } as const;
  for (const from of ["PENDING_CONFIRMATION", "CONFIRMED"] as const)
    for (const role of roles)
      it(`${role} cancelling a ${from} COD order → ${expected[from][role]}`, async () => {
        const { no } = await place("COD");
        if (from === "CONFIRMED")
          expect((await move(no, { toStatus: "CONFIRMED" }, s.O)).status).toBe(
            200,
          );
        const res = await move(
          no,
          { toStatus: "CANCELLED", note: "TEST" },
          s[role],
        );
        expect(res.status).toBe(expected[from][role]);
        const o = await h.db.order.findUniqueOrThrow({
          where: { orderNumber: no },
        });
        expect(o.status).toBe(res.status === 200 ? "CANCELLED" : from);
      });
});

describe("refunds", () => {
  it("cancelling a paid online order records a pending refund that staff complete", async () => {
    const { no } = await place("PREPAID");
    expect(
      (await h.get(`/api/v1/admin/orders/${no}`, s.O)).body.order.status,
    ).toBe("CONFIRMED");
    expect((await move(no, { toStatus: "CANCELLED" }, s.O)).status).toBe(200);
    let d = (await h.get(`/api/v1/admin/orders/${no}`, s.O)).body.order;
    expect(d.payments[0].status).toBe("REFUND_PENDING");
    const refund = d.payments[0].refunds[0];
    expect(refund).toMatchObject({
      status: "PENDING",
      amountPaise: 349_900,
      byStaff: true,
    });
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/refunds/${refund.id}/complete`,
          { outcome: "REFUNDED" },
          s.F,
        )
      ).status,
    ).toBe(403);
    const done = await h.post(
      `/api/v1/admin/orders/${no}/refunds/${refund.id}/complete`,
      { outcome: "REFUNDED", reference: "TEST-BANK-REF" },
      s.M,
    );
    expect(done.status).toBe(200);
    d = (await h.get(`/api/v1/admin/orders/${no}`, s.O)).body.order;
    expect(d.payments[0].status).toBe("REFUNDED");
    expect(d.payments[0].refunds[0]).toMatchObject({
      status: "REFUNDED",
      reference: "TEST-BANK-REF",
    });
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/refunds/${refund.id}/complete`,
          { outcome: "REFUNDED" },
          s.M,
        )
      ).status,
    ).toBe(409);
  });

  it("partial refunds cannot exceed what was paid; nothing paid means nothing to refund", async () => {
    const { no } = await place("PREPAID");
    const first = await h.post(
      `/api/v1/admin/orders/${no}/refunds`,
      { amountPaise: 100_000, reason: "TEST goodwill" },
      s.O,
    );
    expect(first.status).toBe(201);
    const over = await h.post(
      `/api/v1/admin/orders/${no}/refunds`,
      { amountPaise: 300_000, reason: "TEST too much" },
      s.O,
    );
    expect(over.status).toBe(409);
    expect(over.body.error.details).toMatchObject({
      reason: "OVER_REFUND",
      refundablePaise: 249_900,
    });
    const cod = await place("COD");
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${cod.no}/refunds`,
          { amountPaise: 1, reason: "x" },
          s.O,
        )
      ).body.error.details,
    ).toMatchObject({ reason: "NOTHING_PAID" });
  });
});

describe("returns and restock (SR-13)", () => {
  it("restocks only after a return, at most what was sent", async () => {
    const { no, variant } = await place("COD");
    for (const toStatus of ["CONFIRMED", "PACKED"])
      await move(no, { toStatus });
    await move(no, {
      toStatus: "SHIPPED",
      shipment: { courierName: "TEST", trackingNumber: "T" },
    });
    const item = (await h.get(`/api/v1/admin/orders/${no}`, s.O)).body.order
      .items[0];
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/restock`,
          { lines: [{ itemId: item.id, quantity: 1 }] },
          s.O,
        )
      ).status,
    ).toBe(409);
    await move(no, { toStatus: "RETURN_TO_ORIGIN" });
    expect(await level(variant)).toMatchObject({ onHand: 4 });
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/restock`,
          { lines: [{ itemId: item.id, quantity: 1 }] },
          s.C,
        )
      ).status,
    ).toBe(403);
    // Return to origin: Fulfilment restocks on receipt.
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/restock`,
          { lines: [{ itemId: item.id, quantity: 1 }] },
          s.F,
        )
      ).status,
    ).toBe(200);
    expect(await level(variant)).toMatchObject({ onHand: 5 });
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/restock`,
          { lines: [{ itemId: item.id, quantity: 1 }] },
          s.M,
        )
      ).status,
    ).toBe(409);
    const d = (await h.get(`/api/v1/admin/orders/${no}`, s.O)).body.order;
    expect(d.items[0].restocked).toBe(1);
    expect(d.payments[0].status).toBe("NOT_COLLECTED");
  });
});

describe("notes and packing slip", () => {
  it("adds internal notes (append-only) and builds the packing slip", async () => {
    const { no } = await place("COD");
    expect(
      (
        await h.post(
          `/api/v1/admin/orders/${no}/notes`,
          { body: "TEST Customer asked for evening delivery" },
          s.F,
        )
      ).status,
    ).toBe(201);
    expect(
      (await h.post(`/api/v1/admin/orders/${no}/notes`, { body: "  " }, s.F))
        .status,
    ).toBe(400);
    const d = (await h.get(`/api/v1/admin/orders/${no}`, s.F)).body.order;
    expect(d.notes).toMatchObject([
      { body: "TEST Customer asked for evening delivery" },
    ]);
    await expect(h.db.orderNote.deleteMany({})).rejects.toThrow(/append-only/);
    const slip = (await h.get(`/api/v1/admin/orders/${no}/packing-slip`, s.F))
      .body.packingSlip;
    expect(slip).toMatchObject({
      orderNumber: no,
      paymentMethod: "COD",
      collectPaise: 349_900,
    });
    expect(slip.items[0]).not.toHaveProperty("unitPricePaise");
  });
});

describe("enquiries inbox", () => {
  it("lists and updates enquiries for O and M only, audited", async () => {
    const e = await h.db.enquiry.create({
      data: {
        name: "TEST Asker",
        email: "asker@example.test",
        message: "TEST is this available in L?",
        consentToContact: true,
        sourcePath: "/products/test",
      },
    });
    expect((await h.get("/api/v1/admin/enquiries", s.F)).status).toBe(403);
    const list = await h.get("/api/v1/admin/enquiries?status=NEW", s.M);
    expect(list.body.enquiries.map((x: { id: string }) => x.id)).toContain(
      e.id,
    );
    const owner = await h.db.adminUser.findFirstOrThrow({
      where: { role: "OWNER" },
    });
    expect(
      (
        await h.patch(
          `/api/v1/admin/enquiries/${e.id}`,
          { status: "IN_PROGRESS", assignedAdminId: owner.id },
          s.M,
        )
      ).status,
    ).toBe(200);
    expect(
      await h.db.enquiry.findUniqueOrThrow({ where: { id: e.id } }),
    ).toMatchObject({
      status: "IN_PROGRESS",
      assignedAdminId: owner.id,
    });
    const fulfil = await h.db.adminUser.findFirstOrThrow({
      where: { role: "FULFILMENT" },
    });
    expect(
      (
        await h.patch(
          `/api/v1/admin/enquiries/${e.id}`,
          { assignedAdminId: fulfil.id },
          s.M,
        )
      ).status,
    ).toBe(400);
    expect(
      (await h.patch(`/api/v1/admin/enquiries/${e.id}`, {}, s.M)).status,
    ).toBe(400);
    const audit = await h.db.auditLog.findFirstOrThrow({
      where: { action: "enquiry.updated" },
    });
    expect(JSON.stringify(audit)).not.toContain("asker@example.test");
    expect(
      (await h.get("/api/v1/admin/enquiries/whatsapp-clicks", s.O)).status,
    ).toBe(200);
  });
});

describe("dashboard", () => {
  it("counts real rows, and shows each role only its figures", async () => {
    const o = (await h.get("/api/v1/admin/dashboard", s.O)).body;
    expect(o.orders.today).toBeGreaterThan(0);
    expect(o.orders.pendingCodConfirmation).toBe(
      await h.db.order.count({ where: { status: "PENDING_CONFIRMATION" } }),
    );
    expect(typeof o.lowStockVariants).toBe("number");
    expect(typeof o.openEnquiries).toBe("number");
    const f = (await h.get("/api/v1/admin/dashboard", s.F)).body;
    expect(f.orders).toBeDefined();
    expect(f.openEnquiries).toBeUndefined();
    const c = (await h.get("/api/v1/admin/dashboard", s.C)).body;
    expect(c.orders).toBeUndefined();
    expect((await request(h.app).get("/api/v1/admin/dashboard")).status).toBe(
      401,
    );
  });
});
