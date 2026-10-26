// Phase 13 enquiries and WhatsApp clicks against real PostgreSQL
// (phase-13-plan.md §7). Each case writes a `[P13-GATE]` line for the gate
// review. All data is synthetic, in a disposable database.
import { EMPTY_RICH_TEXT } from "@sanea/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { STOREFRONT } from "../../platform/testing.ts";
import { adminHarness, type Harness } from "../auth/testing.ts";
import { WHATSAPP_SETTING } from "../content/public-router.ts";

const report = (line: string) => process.stdout.write(`[P13-GATE] ${line}\n`);
const SESSION = "0196b2a0-0000-7000-8000-0000000000aa";

let h: Harness;
let product: { id: string; variant: string; draftId: string };

beforeAll(async () => {
  h = await adminHarness({
    enquiryLimits: {
      enquiries: { windowMs: 60_000, limit: 10_000 },
      clicks: { windowMs: 60_000, limit: 10_000 },
    },
  });
  const category = await h.db.category.create({
    data: { name: "TEST Enquiry", slug: "test-enquiry", status: "PUBLISHED" },
  });
  const make = (slug: string, status: "PUBLISHED" | "DRAFT") =>
    h.db.product.create({
      data: {
        name: `TEST ${slug}`,
        slug,
        categoryId: category.id,
        shortDescription: "TEST",
        description: EMPTY_RICH_TEXT,
        status,
        publishedAt: status === "PUBLISHED" ? new Date() : null,
      },
    });
  const p = await make("test-enquiry-kurta", "PUBLISHED");
  const draft = await make("test-enquiry-draft", "DRAFT");
  const colour = await h.db.colour.create({
    data: {
      name: "TEST Rose",
      slug: "test-enquiry-rose",
      swatchHex: "#D8C3B5",
    },
  });
  const size = await h.db.size.findFirstOrThrow({ where: { label: "M" } });
  const v = await h.db.productVariant.create({
    data: {
      productId: p.id,
      colourId: colour.id,
      sizeId: size.id,
      sku: "TEST-ENQ-1",
      pricePaise: 150_000,
    },
  });
  product = { id: p.id, variant: v.id, draftId: draft.id };
}, 120_000);
afterAll(async () => {
  await h.drop();
});

async function send(path: string, body: object) {
  const csrf = await h.csrf();
  return request(h.app)
    .post(path)
    .set("Origin", STOREFRONT)
    .set("Cookie", csrf.cookie)
    .set("X-CSRF-Token", csrf.token)
    .send(body);
}

const enquiry = (extra: object = {}) => ({
  name: "TEST Asha",
  email: "asha@example.test",
  message: "TEST Is this available in a longer length?",
  consentToContact: true,
  sourcePath: "/products/test-enquiry-kurta",
  elapsedMs: 15_000,
  ...extra,
});

describe("POST /api/v1/enquiries", () => {
  it("E13-1: stores a valid enquiry with the product, the variant and a hashed IP", async () => {
    const res = await send(
      "/api/v1/enquiries",
      enquiry({ productId: product.id, variantId: product.variant }),
    );
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ received: true });
    expect(res.headers["cache-control"]).toBe("no-store");
    const row = await h.db.enquiry.findFirstOrThrow({
      where: { productId: product.id },
    });
    expect(row).toMatchObject({
      variantId: product.variant,
      email: "asha@example.test",
      phone: null,
      status: "NEW",
      source: "WEBSITE",
      consentToContact: true,
    });
    expect(row.ipHash).toMatch(/^[0-9a-f]{64}$/);
    report(
      "E13-1 valid enquiry: 201, stored NEW with product, variant and an HMAC of the IP (no raw IP)",
    );
  });

  it("E13-2: refuses missing consent, missing contact and unknown fields with 400", async () => {
    const before = await h.db.enquiry.count();
    const noConsent = await send(
      "/api/v1/enquiries",
      enquiry({ consentToContact: false }),
    );
    const noContact = await send(
      "/api/v1/enquiries",
      enquiry({ email: undefined }),
    );
    const extra = await send(
      "/api/v1/enquiries",
      enquiry({ status: "CLOSED" }),
    );
    for (const r of [noConsent, noContact, extra])
      expect(r.body.error.code).toBe("VALIDATION_FAILED");
    expect(noConsent.body.error.details[0].path).toBe("body.consentToContact");
    expect(noContact.body.error.details[0].path).toBe("body.contact");
    expect(extra.body.error.details[0].path).toBe("body.status");
    expect(await h.db.enquiry.count()).toBe(before);
    report(
      "E13-2 no consent, no email or phone, unknown field: 400 VALIDATION_FAILED each, nothing stored",
    );
  });

  it("E13-3: the honeypot and a too-fast form get 201 but store nothing", async () => {
    const before = await h.db.enquiry.count();
    const trap = await send("/api/v1/enquiries", enquiry({ website: "spam" }));
    const fast = await send("/api/v1/enquiries", enquiry({ elapsedMs: 300 }));
    expect([trap.status, fast.status]).toEqual([201, 201]);
    expect(await h.db.enquiry.count()).toBe(before);
    report("E13-3 honeypot and 0.3 s fill: 201 like a person, nothing stored");
  });

  it("E13-4: a draft product or a foreign variant is not linked", async () => {
    await send(
      "/api/v1/enquiries",
      enquiry({
        name: "TEST Draft",
        productId: product.draftId,
        variantId: product.variant,
      }),
    );
    const row = await h.db.enquiry.findFirstOrThrow({
      where: { name: "TEST Draft" },
    });
    expect([row.productId, row.variantId]).toEqual([null, null]);
    report(
      "E13-4 draft product and its unrelated variant: enquiry kept without links",
    );
  });

  it("E13-5: a mobile number alone is stored in +91 form; the database refuses an enquiry with no contact", async () => {
    const res = await send(
      "/api/v1/enquiries",
      enquiry({ name: "TEST Phone", email: undefined, phone: "98765 43210" }),
    );
    expect(res.status).toBe(201);
    const row = await h.db.enquiry.findFirstOrThrow({
      where: { name: "TEST Phone" },
    });
    expect(row.phone).toBe("+919876543210");
    await expect(
      h.db.enquiry.create({
        data: {
          name: "TEST raw",
          message: "TEST message long enough",
          consentToContact: true,
          sourcePath: "/",
        },
      }),
    ).rejects.toThrow(/enquiry_contact_check/);
    await expect(
      h.db.enquiry.create({
        data: {
          name: "TEST raw",
          email: "x@example.test",
          message: "TEST message long enough",
          consentToContact: false,
          sourcePath: "/",
        },
      }),
    ).rejects.toThrow(/enquiry_consent_check/);
    report(
      "E13-5 phone normalised to +91; CHECKs refuse no-contact and no-consent rows",
    );
  });

  it("E13-6: without the CSRF token the enquiry is refused", async () => {
    const res = await request(h.app)
      .post("/api/v1/enquiries")
      .set("Origin", STOREFRONT)
      .send(enquiry());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_FAILED");
    report("E13-6 no CSRF token: 403 CSRF_FAILED");
  });
});

describe("POST /api/v1/events/whatsapp-click", () => {
  it("E13-7: logs an anonymous click and refuses personal data", async () => {
    const res = await send("/api/v1/events/whatsapp-click", {
      productId: product.id,
      variantId: product.variant,
      pagePath: "/products/test-enquiry-kurta",
      sessionId: SESSION,
    });
    expect(res.status).toBe(204);
    const row = await h.db.whatsAppClick.findFirstOrThrow({
      where: { sessionId: SESSION },
    });
    expect(Object.keys(row).sort()).toEqual(
      [
        "createdAt",
        "id",
        "pagePath",
        "productId",
        "sessionId",
        "variantId",
      ].sort(),
    );
    const personal = await send("/api/v1/events/whatsapp-click", {
      pagePath: "/",
      sessionId: SESSION,
      phone: "9876543210",
    });
    expect(personal.status).toBe(400);
    report(
      "E13-7 click: 204, row holds only product, variant, path, session and time; a phone field is refused",
    );
  });
});

describe("limits", () => {
  it("E13-8: enquiries are limited per IP", async () => {
    const limited = await adminHarness({
      enquiryLimits: {
        enquiries: { windowMs: 60_000, limit: 2 },
        clicks: { windowMs: 60_000, limit: 2 },
      },
    });
    try {
      const go = async () => {
        const csrf = await limited.csrf();
        return request(limited.app)
          .post("/api/v1/enquiries")
          .set("Origin", STOREFRONT)
          .set("Cookie", csrf.cookie)
          .set("X-CSRF-Token", csrf.token)
          .send(enquiry());
      };
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await go()).status);
      expect(statuses).toEqual([201, 201, 429]);
      report(
        "E13-8 limit 2: third enquiry from the same IP gets 429 RATE_LIMITED",
      );
    } finally {
      await limited.drop();
    }
  }, 120_000);
});

describe("GET /api/v1/content/settings/public", () => {
  it("E13-9: null until a valid WhatsApp number is set, then the number", async () => {
    const empty = await request(h.app).get("/api/v1/content/settings/public");
    expect(empty.body).toEqual({ whatsApp: null });
    await h.db.storeSetting.create({
      data: { key: WHATSAPP_SETTING, value: { number: "not a number" } },
    });
    const bad = await request(h.app).get("/api/v1/content/settings/public");
    expect(bad.body).toEqual({ whatsApp: null });
    await h.db.storeSetting.update({
      where: { key: WHATSAPP_SETTING },
      data: { value: { number: "98765 43210", hours: "TEST 10 to 6" } },
    });
    const set = await request(h.app).get("/api/v1/content/settings/public");
    expect(set.body).toEqual({
      whatsApp: { number: "+919876543210", hours: "TEST 10 to 6" },
    });
    expect(set.headers["cache-control"]).toBe("public, max-age=60");
    report(
      "E13-9 settings: null when unset or invalid; the normalised number once set",
    );
  });
});
