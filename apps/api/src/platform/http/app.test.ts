import { Router } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ADMIN, STOREFRONT, testApp, testConfig } from "../testing.ts";
import { validate } from "./validate.ts";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("health and errors", () => {
  it("GET /api/v1/health returns 200 with no internal details", async () => {
    const res = await request(testApp().app).get("/api/v1/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });

  it("unknown routes use the documented error shape", async () => {
    const res = await request(testApp().app).get("/api/v1/nope");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Not found.",
        requestId: res.headers["x-request-id"],
      },
    });
  });

  it("unexpected errors return 500 without stack traces or messages", async () => {
    const boom = Router().get("/api/v1/boom", () => {
      throw new Error("secret internal detail");
    });
    const { app, lines } = testApp({ routers: [boom] });
    const res = await request(app).get("/api/v1/boom");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(res.body)).not.toMatch(
      /secret internal detail|at .*\.ts/,
    );
    expect(lines.join("")).toContain("secret internal detail"); // logged server-side only
  });

  it("ignores client-supplied request IDs", async () => {
    const res = await request(testApp().app)
      .get("/api/v1/health")
      .set("X-Request-Id", "evil");
    expect(res.headers["x-request-id"]).not.toBe("evil");
    expect(res.headers["x-request-id"]).toMatch(UUID);
  });
});

describe("security headers", () => {
  it("sets the required headers and no X-Powered-By", async () => {
    const res = await request(testApp().app).get("/api/v1/health");
    expect(res.headers["content-security-policy"]).toBe(
      "default-src 'none';frame-ancestors 'none'",
    );
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers["permissions-policy"]).toContain("camera=()");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toBeUndefined();
  });

  it("sends HSTS only in production", async () => {
    const config = testConfig({
      NODE_ENV: "production",
      STOREFRONT_ORIGIN: "https://shop.example",
      ADMIN_ORIGIN: "https://admin.example",
    });
    const res = await request(testApp({ config }).app).get("/api/v1/health");
    expect(res.headers["strict-transport-security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });
});

describe("CORS", () => {
  it("allows the storefront origin on public routes, with credentials", async () => {
    const res = await request(testApp().app)
      .get("/api/v1/health")
      .set("Origin", STOREFRONT);
    expect(res.headers["access-control-allow-origin"]).toBe(STOREFRONT);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    expect(res.headers["access-control-expose-headers"]).toBe("X-Request-Id");
  });

  it("allows only the admin origin on admin routes", async () => {
    const { app } = testApp();
    const admin = await request(app)
      .get("/api/v1/admin/anything")
      .set("Origin", ADMIN);
    expect(admin.headers["access-control-allow-origin"]).toBe(ADMIN);
    const fromShop = await request(app)
      .get("/api/v1/admin/anything")
      .set("Origin", STOREFRONT);
    expect(fromShop.headers["access-control-allow-origin"]).toBeUndefined();
    const adminOnPublic = await request(app)
      .get("/api/v1/health")
      .set("Origin", ADMIN);
    expect(
      adminOnPublic.headers["access-control-allow-origin"],
    ).toBeUndefined();
  });

  it("classifies admin paths by pathname, ignoring the query string", async () => {
    const { app } = testApp();
    const admin = await request(app)
      .get("/api/v1/admin?anything=1")
      .set("Origin", ADMIN);
    expect(admin.headers["access-control-allow-origin"]).toBe(ADMIN);
    const fromShop = await request(app)
      .get("/api/v1/admin?anything=1")
      .set("Origin", STOREFRONT);
    expect(fromShop.headers["access-control-allow-origin"]).toBeUndefined();
    const preflightFromShop = await request(app)
      .options("/api/v1/admin?anything=1")
      .set("Origin", STOREFRONT)
      .set("Access-Control-Request-Method", "POST");
    expect(
      preflightFromShop.headers["access-control-allow-origin"],
    ).toBeUndefined();
    const publicWithQuery = await request(app)
      .get("/api/v1/health?anything=1")
      .set("Origin", STOREFRONT);
    expect(publicWithQuery.headers["access-control-allow-origin"]).toBe(
      STOREFRONT,
    );
  });

  it("sends no CORS headers to unknown origins", async () => {
    const res = await request(testApp().app)
      .get("/api/v1/health")
      .set("Origin", "https://evil.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("answers preflight with the allowed methods and headers", async () => {
    const res = await request(testApp().app)
      .options("/api/v1/anything")
      .set("Origin", STOREFRONT)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,x-csrf-token");
    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe(STOREFRONT);
    expect(res.headers["access-control-allow-headers"]).toBe(
      "Content-Type,X-CSRF-Token,Idempotency-Key",
    );
    expect(res.headers["access-control-allow-methods"]).toBe(
      "GET,POST,PUT,PATCH,DELETE",
    );
  });
});

describe("validation helper", () => {
  const router = Router().get(
    "/api/v1/echo",
    validate({ query: z.strictObject({ q: z.string().min(2) }) }),
    (_req, res) => {
      res.json(res.locals.input);
    },
  );

  it("passes valid input through res.locals.input", async () => {
    const res = await request(testApp({ routers: [router] }).app).get(
      "/api/v1/echo?q=ok",
    );
    expect(res.body).toEqual({ query: { q: "ok" } });
  });

  it("returns 400 VALIDATION_FAILED with located field paths", async () => {
    const res = await request(testApp({ routers: [router] }).app).get(
      "/api/v1/echo?q=x&extra=1",
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(
      res.body.error.details.map((d: { path: string; code: string }) => [
        d.path,
        d.code,
      ]),
    ).toEqual([
      ["query.q", "TOO_SHORT"],
      ["query.extra", "UNKNOWN_FIELD"],
    ]);
  });
});

describe("logging", () => {
  it("writes JSON lines with the request ID and redacts sensitive headers", async () => {
    const { app, lines } = testApp();
    const res = await request(app)
      .get("/api/v1/health")
      .set("Authorization", "Bearer super-secret-token")
      .set("Cookie", "__Host-sp_csrf=secret-cookie-value")
      .set("X-CSRF-Token", "secret-header-value");
    const log = lines
      .map((l) => JSON.parse(l) as { req?: { id?: string } })
      .find((l) => l.req);
    expect(log?.req?.id).toBe(res.headers["x-request-id"]);
    const all = lines.join("");
    expect(all).toContain("[REDACTED]");
    for (const secret of [
      "super-secret-token",
      "secret-cookie-value",
      "secret-header-value",
    ]) {
      expect(all).not.toContain(secret);
    }
  });
});
