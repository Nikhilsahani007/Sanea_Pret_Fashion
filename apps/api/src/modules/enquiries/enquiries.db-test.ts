// Phase 13 enquiries (testing-strategy.md §3 "Enquiries"): validation,
// consent, honeypot, timing, rate limits; anonymous WhatsApp clicks.
import { randomUUID } from "node:crypto";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as fx from "../../db/testing/fixtures.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { STOREFRONT, cookiePair } from "../../platform/testing.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";

let h: Harness;
let productId: string;
let variantId: string;

async function post(path: string, body: object, ip = "203.0.113.10") {
  const csrf = await request(h.app)
    .get("/api/v1/auth/csrf")
    .set("Origin", STOREFRONT);
  return request(h.app)
    .post(path)
    .set("Origin", STOREFRONT)
    .set("X-Forwarded-For", ip)
    .set("Cookie", cookiePair(csrf.headers["set-cookie"], CSRF_COOKIE))
    .set("X-CSRF-Token", csrf.body.csrfToken as string)
    .send(body);
}

const valid = (over: object = {}) => ({
  name: "TEST Shopper",
  email: "shopper@example.test",
  message: "Is this kurta lined? TEST message.",
  consentToContact: true,
  sourcePath: "/products/test",
  elapsedMs: 8000,
  ...over,
});

beforeAll(async () => {
  // Trust one proxy hop so X-Forwarded-For gives each test its own client IP.
  h = await adminHarness({ env: { TRUST_PROXY: "1" } });
  productId = await fx.product(h.db);
  await h.db.product.update({
    where: { id: productId },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  variantId = await fx.variant(h.db, productId);
});
afterAll(() => h.drop());

describe("website enquiries", () => {
  it("stores a valid enquiry with the product and variant, the phone normalised and the IP hashed", async () => {
    const res = await post(
      "/api/v1/enquiries",
      valid({ productId, variantId, phone: "98765 43210", email: undefined }),
      "203.0.113.1",
    );
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: true });
    const row = await h.db.enquiry.findFirstOrThrow({ where: { productId } });
    expect(row).toMatchObject({
      variantId,
      phone: "+919876543210",
      email: null,
      status: "NEW",
      consentToContact: true,
    });
    expect(row.ipHash).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(row.ipHash).not.toContain("203.0.113");
  });

  it("requires consent, a contact route and a real message", async () => {
    for (const [i, body] of [
      valid({ consentToContact: false }),
      valid({ email: undefined }),
      valid({ message: "short" }),
      valid({ phone: "12345" }),
      valid({ name: "" }),
      valid({ extra: "field" }),
    ].entries()) {
      const res = await post(
        "/api/v1/enquiries",
        {
          ...body,
          email: (body as { email?: string }).email
            ? `v${i}@example.test`
            : undefined,
        },
        `203.0.113.${100 + i}`,
      );
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it("drops honeypot and too-fast submissions silently", async () => {
    const before = await h.db.enquiry.count();
    expect(
      (
        await post(
          "/api/v1/enquiries",
          valid({ website: "http://spam.example", email: "bot1@example.test" }),
          "203.0.113.3",
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await post(
          "/api/v1/enquiries",
          valid({ elapsedMs: 300, email: "bot2@example.test" }),
          "203.0.113.3",
        )
      ).status,
    ).toBe(201);
    expect(await h.db.enquiry.count()).toBe(before);
  });

  it("ignores product IDs that are not published", async () => {
    const draft = await fx.product(h.db);
    await post(
      "/api/v1/enquiries",
      valid({ productId: draft, email: "draft@example.test" }),
      "203.0.113.4",
    );
    expect(
      (
        await h.db.enquiry.findFirstOrThrow({
          where: { email: "draft@example.test" },
        })
      ).productId,
    ).toBeNull();
  });

  it("limits each IP to 5 per hour", async () => {
    const results = [];
    for (let i = 0; i < 6; i++)
      results.push(
        (
          await post(
            "/api/v1/enquiries",
            valid({ email: `ip-${i}@example.test` }),
            "203.0.113.5",
          )
        ).status,
      );
    expect(results).toEqual([201, 201, 201, 201, 201, 429]);
  });

  it("limits each email to 3 per hour across IPs", async () => {
    const results = [];
    for (let i = 0; i < 4; i++)
      results.push(
        (
          await post(
            "/api/v1/enquiries",
            valid({ email: "same@example.test" }),
            `198.51.100.${i + 1}`,
          )
        ).status,
      );
    expect(results).toEqual([201, 201, 201, 429]);
  });

  it("the database refuses an enquiry without consent or contact", async () => {
    await expect(
      h.db.$executeRawUnsafe(
        `INSERT INTO "enquiry" ("name", "message", "consent_to_contact", "source_path", "updated_at", "email") VALUES ('x', 'long enough message', false, '/', now(), 'a@b.test')`,
      ),
    ).rejects.toThrow(/enquiry_consent_check/);
    await expect(
      h.db.$executeRawUnsafe(
        `INSERT INTO "enquiry" ("name", "message", "consent_to_contact", "source_path", "updated_at") VALUES ('x', 'long enough message', true, '/', now())`,
      ),
    ).rejects.toThrow(/enquiry_contact_check/);
  });
});

describe("WhatsApp clicks", () => {
  it("logs an anonymous click with product and variant", async () => {
    const sessionId = randomUUID();
    const res = await post(
      "/api/v1/events/whatsapp-click",
      { productId, variantId, pagePath: "/products/test?size=M", sessionId },
      "203.0.113.20",
    );
    expect(res.status).toBe(204);
    const row = await h.db.whatsAppClick.findFirstOrThrow({
      where: { sessionId },
    });
    expect(row).toMatchObject({
      productId,
      variantId,
      pagePath: "/products/test?size=M",
    });
    expect(Object.keys(row).sort()).toEqual([
      "createdAt",
      "id",
      "pagePath",
      "productId",
      "sessionId",
      "variantId",
    ]);
  });

  it("rejects personal data fields and bad paths", async () => {
    expect(
      (
        await post(
          "/api/v1/events/whatsapp-click",
          { pagePath: "/", sessionId: randomUUID(), phone: "+919876543210" },
          "203.0.113.21",
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await post(
          "/api/v1/events/whatsapp-click",
          { pagePath: "https://evil.example", sessionId: randomUUID() },
          "203.0.113.21",
        )
      ).status,
    ).toBe(400);
  });
});
