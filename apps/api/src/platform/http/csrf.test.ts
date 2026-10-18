import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { ADMIN, cookiePair, SECRET, STOREFRONT, testApp } from "../testing.ts";
import {
  CSRF_COOKIE,
  CSRF_MAX_AGE_MS,
  issueCsrfToken,
  isValidCsrfToken,
} from "./csrf.ts";

const echo = Router()
  .post("/api/v1/echo", (req, res) => res.json({ received: req.body }))
  .post("/api/v1/admin/echo", (_req, res) => res.json({ ok: true }))
  .post("/api/v1/administrator", (_req, res) => res.json({ ok: true }));

async function session(app: ReturnType<typeof testApp>["app"]) {
  const res = await request(app).get("/api/v1/auth/csrf");
  return {
    token: res.body.csrfToken as string,
    cookie: cookiePair(res.headers["set-cookie"], CSRF_COOKIE),
    res,
  };
}

describe("CSRF tokens", () => {
  it("verify only with the server secret", () => {
    const token = issueCsrfToken(SECRET);
    expect(isValidCsrfToken(SECRET, token)).toBe(true);
    expect(
      isValidCsrfToken("another-secret-that-is-32-characters!!", token),
    ).toBe(false);
  });

  it("reject tampering and malformed tokens", () => {
    const token = issueCsrfToken(SECRET);
    const [nonce, issued, signature] = token.split(".");
    const flipped = `${signature?.slice(0, -1)}${signature?.endsWith("A") ? "B" : "A"}`;
    expect(isValidCsrfToken(SECRET, `${nonce}.${issued}.${flipped}`)).toBe(
      false,
    );
    expect(
      isValidCsrfToken(SECRET, `${nonce}.${Number(issued) + 1}.${signature}`),
    ).toBe(false);
    for (const bad of [
      "",
      "abc",
      `${nonce}.${issued}`,
      `${token}.extra`,
      token.replace(/\./g, "-"),
    ]) {
      expect(isValidCsrfToken(SECRET, bad)).toBe(false);
    }
  });

  it("expire after 12 hours and reject future timestamps", () => {
    const now = 1_800_000_000_000;
    const token = issueCsrfToken(SECRET, now);
    expect(isValidCsrfToken(SECRET, token, now + CSRF_MAX_AGE_MS)).toBe(true);
    expect(isValidCsrfToken(SECRET, token, now + CSRF_MAX_AGE_MS + 1)).toBe(
      false,
    );
    expect(isValidCsrfToken(SECRET, token, now - 1)).toBe(false);
  });
});

describe("GET /api/v1/auth/csrf", () => {
  it("returns the token and sets the same value in a __Host- cookie with production attributes", async () => {
    const { token, res } = await session(testApp().app);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    const setCookie = String(res.headers["set-cookie"]);
    expect(setCookie).toContain(`${CSRF_COOKIE}=${token}`);
    expect(setCookie).toMatch(/; Max-Age=43200/);
    expect(setCookie).toMatch(/; Path=\//);
    expect(setCookie).toMatch(/; HttpOnly/);
    expect(setCookie).toMatch(/; Secure/);
    expect(setCookie).toMatch(/; SameSite=Strict/);
    expect(setCookie).not.toMatch(/Domain=/i);
  });

  it("uses the same cookie attributes in development (no relaxed variant)", async () => {
    const { testConfig } = await import("../testing.ts");
    const { res } = await session(
      testApp({ config: testConfig({ NODE_ENV: "development" }) }).app,
    );
    expect(String(res.headers["set-cookie"])).toMatch(
      /__Host-sp_csrf=.*; Secure; SameSite=Strict/,
    );
  });
});

describe("CSRF protection on state-changing requests", () => {
  it("accepts a matching cookie and header from the allowed origin", async () => {
    const { app } = testApp({ routers: [echo] });
    const { token, cookie } = await session(app);
    const res = await request(app)
      .post("/api/v1/echo")
      .set("Origin", STOREFRONT)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", token)
      .send({ a: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: { a: 1 } });
  });

  it.each([
    ["no Origin", { origin: undefined }],
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["the admin Origin on a public route", { origin: ADMIN }],
    ["no header", { header: null }],
    ["no cookie", { cookie: null }],
    ["a header that differs from the cookie", { header: "other" }],
  ])("rejects %s with 403 CSRF_FAILED", async (_name, change) => {
    const { app } = testApp({ routers: [echo] });
    const { token, cookie } = await session(app);
    let req = request(app).post("/api/v1/echo");
    const origin = "origin" in change ? change.origin : STOREFRONT;
    if (origin) req = req.set("Origin", origin);
    if (!("cookie" in change)) req = req.set("Cookie", cookie);
    if ("header" in change && change.header !== null)
      req = req.set("X-CSRF-Token", change.header);
    if (!("header" in change)) req = req.set("X-CSRF-Token", token);
    const res = await req.send({ a: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("CSRF_FAILED");
  });

  it("rejects a forged token even when cookie and header match", async () => {
    const { app } = testApp({ routers: [echo] });
    const forged = issueCsrfToken("attacker-secret-that-is-32-characters!");
    const res = await request(app)
      .post("/api/v1/echo")
      .set("Origin", STOREFRONT)
      .set("Cookie", `${CSRF_COOKIE}=${forged}`)
      .set("X-CSRF-Token", forged)
      .send({});
    expect(res.status).toBe(403);
  });

  it("requires the admin origin on admin routes", async () => {
    const { app } = testApp({ routers: [echo] });
    const { token, cookie } = await session(app);
    const send = (origin: string) =>
      request(app)
        .post("/api/v1/admin/echo")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", token)
        .send({});
    expect((await send(ADMIN)).status).toBe(200);
    expect((await send(STOREFRONT)).status).toBe(403);
  });

  // Express routes /API/V1/ADMIN/echo to /api/v1/admin/echo, so the
  // Origin check must classify it as admin too.
  it.each(["/API/V1/ADMIN/echo", "/Api/V1/Admin/echo"])(
    "requires the admin origin on mixed-case admin path %s",
    async (path) => {
      const { app } = testApp({ routers: [echo] });
      const { token, cookie } = await session(app);
      const send = (origin: string) =>
        request(app)
          .post(path)
          .set("Origin", origin)
          .set("Cookie", cookie)
          .set("X-CSRF-Token", token)
          .send({});
      const fromAdmin = await send(ADMIN);
      expect(fromAdmin.status).toBe(200);
      expect(fromAdmin.body).toEqual({ ok: true });
      const fromShop = await send(STOREFRONT);
      expect(fromShop.status).toBe(403);
      expect(fromShop.body.error.code).toBe("CSRF_FAILED");
    },
  );

  it("keeps a look-alike path public", async () => {
    const { app } = testApp({ routers: [echo] });
    const { token, cookie } = await session(app);
    const send = (origin: string) =>
      request(app)
        .post("/api/v1/administrator")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", token)
        .send({});
    expect((await send(STOREFRONT)).status).toBe(200);
    expect((await send(ADMIN)).status).toBe(403);
  });

  it("does not apply to safe methods", async () => {
    const res = await request(testApp().app)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(res.status).toBe(200);
  });
});

describe("request bodies", () => {
  async function post(body: string, contentType: string) {
    const { app } = testApp({ routers: [echo] });
    const { token, cookie } = await session(app);
    return request(app)
      .post("/api/v1/echo")
      .set("Origin", STOREFRONT)
      .set("Cookie", cookie)
      .set("X-CSRF-Token", token)
      .set("Content-Type", contentType)
      .send(body);
  }

  it("rejects malformed JSON with 400 MALFORMED_JSON", async () => {
    const res = await post("{bad json", "application/json");
    expect([res.status, res.body.error.code]).toEqual([400, "MALFORMED_JSON"]);
  });

  it("rejects bodies over 100 KB with 413 PAYLOAD_TOO_LARGE", async () => {
    const res = await post(
      JSON.stringify({ x: "a".repeat(101 * 1024) }),
      "application/json",
    );
    expect([res.status, res.body.error.code]).toEqual([
      413,
      "PAYLOAD_TOO_LARGE",
    ]);
  });

  it("accepts a body just under 100 KB", async () => {
    const res = await post(
      JSON.stringify({ x: "a".repeat(99 * 1024) }),
      "application/json",
    );
    expect(res.status).toBe(200);
  });

  it("rejects non-JSON bodies with 415 UNSUPPORTED_MEDIA_TYPE", async () => {
    for (const type of [
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      const res = await post("a=1", type);
      expect([res.status, res.body.error.code]).toEqual([
        415,
        "UNSUPPORTED_MEDIA_TYPE",
      ]);
    }
  });
});
