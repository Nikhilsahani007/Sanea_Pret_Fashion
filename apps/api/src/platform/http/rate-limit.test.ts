import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { testApp } from "../testing.ts";
import { createRateLimiter } from "./rate-limit.ts";

function limitedApp(trustProxy: number) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.use(createRateLimiter({ windowMs: 60_000, limit: 2 }));
  app.get("/x", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("rate limiting", () => {
  it("returns 429 RATE_LIMITED in the documented shape after the limit", async () => {
    const app = limitedApp(0);
    expect((await request(app).get("/x")).status).toBe(200);
    expect((await request(app).get("/x")).status).toBe(200);
    const res = await request(app).get("/x");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["ratelimit-policy"]).toBeDefined();
  });

  it("ignores a spoofed X-Forwarded-For when no proxy is trusted", async () => {
    const app = limitedApp(0);
    for (const ip of ["1.1.1.1", "2.2.2.2"]) {
      await request(app).get("/x").set("X-Forwarded-For", ip);
    }
    const res = await request(app).get("/x").set("X-Forwarded-For", "3.3.3.3");
    expect(res.status).toBe(429);
  });

  it("uses the global limit of 300 per minute and exempts health", async () => {
    const { app } = testApp();
    const other = await request(app).get("/api/v1/nope");
    expect(other.headers["ratelimit-policy"]).toMatch(/q=300; w=60/);
    const health = await request(app).get("/api/v1/health");
    expect(health.headers["ratelimit-policy"]).toBeUndefined();
  });
});
