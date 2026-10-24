// Owner-only tax settings and GST rules (D-169), with TEST values only: no
// real rate, HSN code or seller state is used (B-14).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminHarness, type Harness, type Session } from "../auth/testing.ts";

let h: Harness;
const s: Record<"O" | "M" | "F" | "C", Session> = {} as never;

const rule = (over: object = {}) => ({
  hsnPrefix: "77",
  effectiveFrom: "2026-01-01T00:00:00+05:30",
  note: "TEST rule, not a real rate",
  slabs: [
    { upToUnitPricePaise: 100_000, cgstBps: 100, sgstBps: 100, igstBps: 200 },
    { upToUnitPricePaise: null, cgstBps: 300, sgstBps: 300, igstBps: 600 },
  ],
  ...over,
});

beforeAll(async () => {
  h = await adminHarness();
  s.O = await h.signIn(await h.createAdmin("OWNER"));
  s.M = await h.signIn(await h.createAdmin("MANAGER"));
  s.F = await h.signIn(await h.createAdmin("FULFILMENT"));
  s.C = await h.signIn(await h.createAdmin("CATALOGUE_EDITOR"));
});
afterAll(() => h.drop());

describe("tax settings", () => {
  it("only the Owner reads or changes them; empty by default; audited", async () => {
    for (const who of [s.M, s.F, s.C]) {
      expect((await h.get("/api/v1/admin/tax/settings", who)).status).toBe(403);
      expect(
        (await h.put("/api/v1/admin/tax/settings", { sellerState: "goa" }, who))
          .status,
      ).toBe(403);
    }
    expect((await h.get("/api/v1/admin/tax/settings", s.O)).body).toEqual({
      settings: { sellerState: null },
    });
    const bad = await h.put(
      "/api/v1/admin/tax/settings",
      { sellerState: "atlantis" },
      s.O,
    );
    expect(bad.status).toBe(400);
    const ok = await h.put(
      "/api/v1/admin/tax/settings",
      { sellerState: "goa" },
      s.O,
    );
    expect(ok.status).toBe(200);
    expect(
      (await h.get("/api/v1/admin/tax/settings", s.O)).body.settings,
    ).toEqual({ sellerState: "goa" });
    expect(
      await h.db.auditLog.count({ where: { action: "settings.tax_updated" } }),
    ).toBe(1);
    // The generic settings route does not expose the tax group.
    expect((await h.get("/api/v1/admin/settings/tax", s.O)).status).toBe(400);
    await h.put("/api/v1/admin/tax/settings", { sellerState: null }, s.O);
  });
});

describe("GST rules", () => {
  it("only the Owner creates or lists them", async () => {
    for (const who of [s.M, s.F, s.C]) {
      expect((await h.get("/api/v1/admin/tax/gst-rules", who)).status).toBe(
        403,
      );
      expect(
        (await h.post("/api/v1/admin/tax/gst-rules", rule(), who)).status,
      ).toBe(403);
    }
    const res = await h.post("/api/v1/admin/tax/gst-rules", rule(), s.O);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const list = (await h.get("/api/v1/admin/tax/gst-rules", s.O)).body.rules;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      hsnPrefix: "77",
      effectiveTo: null,
      slabs: [
        { upToUnitPricePaise: 100_000, igstBps: 200 },
        { upToUnitPricePaise: null, igstBps: 600 },
      ],
    });
    expect(
      await h.db.auditLog.count({ where: { action: "tax.gst_rule_created" } }),
    ).toBe(1);
  });

  it("validates bands, prefixes and dates", async () => {
    const bad = [
      rule({ hsnPrefix: "12AB" }),
      rule({ slabs: [] }),
      rule({
        slabs: [
          { upToUnitPricePaise: null, cgstBps: 0, sgstBps: 0, igstBps: 0 },
          { upToUnitPricePaise: null, cgstBps: 0, sgstBps: 0, igstBps: 0 },
        ],
      }),
      rule({
        slabs: [
          { upToUnitPricePaise: 5, cgstBps: 10_001, sgstBps: 0, igstBps: 0 },
        ],
      }),
      rule({ effectiveTo: "2025-12-31T00:00:00+05:30" }),
    ];
    for (const body of bad)
      expect(
        (await h.post("/api/v1/admin/tax/gst-rules", body, s.O)).status,
        JSON.stringify(body),
      ).toBe(400);
  });

  it("refuses an overlapping rule for the same prefix with a 409 the admin can act on", async () => {
    const res = await h.post(
      "/api/v1/admin/tax/gst-rules",
      rule({ effectiveFrom: "2026-06-01T00:00:00+05:30" }),
      s.O,
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details).toEqual({ reason: "GST_RULE_OVERLAP" });
  });

  it("ends a rule in the future, then a new rule may follow it; the past is not rewritten", async () => {
    const [r] = (await h.get("/api/v1/admin/tax/gst-rules", s.O)).body.rules;
    // The harness clock is 2026-10-19.
    expect(
      (
        await h.post(
          `/api/v1/admin/tax/gst-rules/${r.id}/end`,
          { effectiveTo: "2026-02-01T00:00:00+05:30" },
          s.O,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await h.post(
          `/api/v1/admin/tax/gst-rules/${r.id}/end`,
          { effectiveTo: "2027-04-01T00:00:00+05:30" },
          s.M,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await h.post(
          `/api/v1/admin/tax/gst-rules/${r.id}/end`,
          { effectiveTo: "2027-04-01T00:00:00+05:30" },
          s.O,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await h.post(
          "/api/v1/admin/tax/gst-rules",
          rule({ effectiveFrom: "2027-04-01T00:00:00+05:30" }),
          s.O,
        )
      ).status,
    ).toBe(201);
    expect(
      await h.db.auditLog.count({ where: { action: "tax.gst_rule_ended" } }),
    ).toBe(1);
  });
});
