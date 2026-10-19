// Admin sign-in, 2FA, lockout, sessions and session-bound CSRF through the
// real API and a real database (D-062 to D-068).
import { AdminRole } from "@sanea/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADMIN, cookiePair } from "../../platform/testing.ts";
import { CHALLENGE_TTL_MS } from "./challenge.ts";
import { DEFAULT_AUTH_LIMITS } from "./router.ts";
import {
  ADMIN_SESSION_COOKIE,
  SESSION_ABSOLUTE_MS,
  SESSION_IDLE_MS,
} from "./sessions.ts";
import { LOCKOUT_MS, LOCKOUT_THRESHOLD } from "./sign-in.ts";
import { adminHarness, type Harness, type TestAdmin } from "./testing.ts";
import { hotp, totp, totpStep } from "./totp.ts";

let h: Harness;
beforeAll(async () => {
  h = await adminHarness();
});
afterAll(() => h.drop());

const SIGN_IN = "/api/v1/admin/auth/sign-in";
const MFA = "/api/v1/admin/auth/mfa";
const ME = "/api/v1/admin/auth/me";

async function challengeFor(admin: TestAdmin) {
  const res = await h.post(SIGN_IN, {
    email: admin.email,
    password: admin.password,
  });
  expect(res.status).toBe(200);
  return res.body.challenge as string;
}

const strip = (body: { error: Record<string, unknown> }) =>
  Object.fromEntries(
    Object.entries(body.error).filter(([k]) => k !== "requestId"),
  );

describe("successful sign-in", () => {
  it("password, then 2FA code, gives a __Host- session and a bound CSRF token", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const first = await h.post(SIGN_IN, {
      email: admin.email.toUpperCase(),
      password: admin.password,
    });
    expect(first.status).toBe(200);
    expect(first.headers["set-cookie"]).toBeUndefined(); // no session yet
    expect(first.headers["cache-control"]).toBe("no-store");
    const second = await h.post(MFA, {
      challenge: first.body.challenge,
      code: totp(admin.secret, h.clock.now()),
    });
    expect(second.status).toBe(200);
    expect(second.body.admin).toEqual({
      id: admin.id,
      email: admin.email,
      name: expect.any(String),
      role: "MANAGER",
    });
    const setCookie = [second.headers["set-cookie"]]
      .flat()
      .find((c) => c?.startsWith(`${ADMIN_SESSION_COOKIE}=`))!;
    expect(setCookie).toMatch(
      /; Max-Age=28800; Path=\/; Expires=[^;]+; HttpOnly; Secure; SameSite=Strict$/,
    );
    expect(setCookie).not.toMatch(/Domain=/i);
    const cookie = cookiePair(
      second.headers["set-cookie"],
      ADMIN_SESSION_COOKIE,
    );
    const me = await h.get(ME, { cookie, csrfToken: "", token: "" });
    expect(me.status).toBe(200);
    expect(me.body.admin.id).toBe(admin.id);
    expect(me.body.csrfToken).toBe(second.body.csrfToken);
    h.clock.advance(31_000);
  });

  it("stores only the token's SHA-256 hash and records an audit entry", async () => {
    const admin = await h.createAdmin(AdminRole.OWNER);
    const session = await h.signIn(admin);
    const row = await h.sessionRow(session);
    expect(row?.adminUserId).toBe(admin.id);
    expect(row!.expiresAt.getTime() - row!.createdAt.getTime()).toBe(
      SESSION_ABSOLUTE_MS,
    );
    const dump = JSON.stringify(await h.db.adminSession.findMany());
    expect(dump).not.toContain(session.token);
    const audit = await h.db.auditLog.findMany({
      where: { actorAdminId: admin.id },
    });
    expect(audit.map((a) => a.action)).toEqual(["admin.sign_in"]);
    expect(audit[0]?.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(audit)).not.toContain(admin.email);
  });
});

describe("generic failures (D-066)", () => {
  it("answers unknown email, wrong password, inactive and locked accounts identically", async () => {
    const active = await h.createAdmin(AdminRole.FULFILMENT);
    const inactive = await h.createAdmin(AdminRole.FULFILMENT, {
      isActive: false,
    });
    const locked = await h.createAdmin(AdminRole.FULFILMENT);
    await h.db.adminUser.update({
      where: { id: locked.id },
      data: { lockedUntil: new Date(h.clock.now().getTime() + 60_000) },
    });
    const attempts = await Promise.all([
      h.post(SIGN_IN, {
        email: "nobody@example.test",
        password: "whatever password",
      }),
      h.post(SIGN_IN, { email: active.email, password: "wrong password here" }),
      h.post(SIGN_IN, { email: inactive.email, password: inactive.password }),
      h.post(SIGN_IN, { email: locked.email, password: locked.password }),
    ]);
    for (const res of attempts) {
      expect(res.status).toBe(401);
      expect(strip(res.body)).toEqual({
        code: "SIGN_IN_FAILED",
        message: expect.any(String),
      });
    }
    expect(
      new Set(attempts.map((r) => JSON.stringify(strip(r.body)))).size,
    ).toBe(1);
  });

  it("rejects a wrong code, a malformed challenge and a tampered one", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const challenge = await challengeFor(admin);
    const step = totpStep(h.clock.now());
    const wrong = hotp(admin.secret, step + 5);
    expect((await h.post(MFA, { challenge, code: wrong })).status).toBe(401);
    expect(
      (await h.post(MFA, { challenge: "garbage", code: "123456" })).status,
    ).toBe(401);
    const tampered =
      challenge.slice(0, -1) + (challenge.endsWith("A") ? "B" : "A");
    expect(
      (
        await h.post(MFA, {
          challenge: tampered,
          code: totp(admin.secret, h.clock.now()),
        })
      ).status,
    ).toBe(401);
  });
});

describe("lockout (5 failures, 15 minutes)", () => {
  it("locks after 5 wrong passwords, even for the right one, then unlocks", async () => {
    const admin = await h.createAdmin(AdminRole.CATALOGUE_EDITOR);
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++)
      expect(
        (
          await h.post(SIGN_IN, {
            email: admin.email,
            password: "wrong password here",
          })
        ).status,
      ).toBe(401);
    expect(
      (await h.post(SIGN_IN, { email: admin.email, password: admin.password }))
        .status,
    ).toBe(401);
    const row = await h.db.adminUser.findUnique({ where: { id: admin.id } });
    expect(row?.lockedUntil?.getTime()).toBe(
      h.clock.now().getTime() + LOCKOUT_MS,
    );
    h.clock.advance(LOCKOUT_MS + 1000);
    await h.signIn(admin);
    const after = await h.db.adminUser.findUnique({ where: { id: admin.id } });
    expect([after?.failedLoginCount, after?.lockedUntil]).toEqual([0, null]);
  });

  it("counts wrong 2FA codes toward the same lockout", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const challenge = await challengeFor(admin);
    const bad = hotp(admin.secret, totpStep(h.clock.now()) + 7);
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++)
      expect((await h.post(MFA, { challenge, code: bad })).status).toBe(401);
    // Locked: even the right code fails now.
    expect(
      (
        await h.post(MFA, {
          challenge,
          code: totp(admin.secret, h.clock.now()),
        })
      ).status,
    ).toBe(401);
    expect(
      (await h.post(SIGN_IN, { email: admin.email, password: admin.password }))
        .status,
    ).toBe(401);
  });
});

describe("2FA codes cannot be reused (D-064)", () => {
  it("refuses the same code for a second sign-in in the same window", async () => {
    const admin = await h.createAdmin(AdminRole.OWNER);
    const code = totp(admin.secret, h.clock.now());
    const c1 = await challengeFor(admin);
    expect((await h.post(MFA, { challenge: c1, code })).status).toBe(200);
    const c2 = await challengeFor(admin);
    expect((await h.post(MFA, { challenge: c2, code })).status).toBe(401);
    // An earlier step is refused too, even inside the tolerance window.
    const previous = hotp(admin.secret, totpStep(h.clock.now()) - 1);
    const c3 = await challengeFor(admin);
    expect((await h.post(MFA, { challenge: c3, code: previous })).status).toBe(
      401,
    );
    h.clock.advance(31_000);
  });

  it("refuses two concurrent uses of one code (atomic claim)", async () => {
    const admin = await h.createAdmin(AdminRole.OWNER);
    const code = totp(admin.secret, h.clock.now());
    const [a, b] = [await challengeFor(admin), await challengeFor(admin)];
    const results = await Promise.all([
      h.post(MFA, { challenge: a, code }),
      h.post(MFA, { challenge: b, code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    h.clock.advance(31_000);
  });
});

describe("challenges", () => {
  it("expire after 5 minutes", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const challenge = await challengeFor(admin);
    h.clock.advance(CHALLENGE_TTL_MS + 1);
    expect(
      (
        await h.post(MFA, {
          challenge,
          code: totp(admin.secret, h.clock.now()),
        })
      ).status,
    ).toBe(401);
  });

  it("stop working after a successful sign-in", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const spare = await challengeFor(admin);
    await h.signIn(admin);
    expect(
      (
        await h.post(MFA, {
          challenge: spare,
          code: totp(admin.secret, h.clock.now()),
        })
      ).status,
    ).toBe(401);
  });
});

describe("sessions (D-067)", () => {
  it("end after 30 minutes idle, and the cookie is cleared", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const session = await h.signIn(admin);
    h.clock.advance(SESSION_IDLE_MS);
    const me = await h.get(ME, session);
    expect(me.status).toBe(401);
    expect(me.body.error.code).toBe("UNAUTHENTICATED");
    expect(String(me.headers["set-cookie"])).toMatch(
      new RegExp(`^${ADMIN_SESSION_COOKIE}=;`),
    );
    expect(await h.sessionRow(session)).toBeNull();
  });

  it("stay alive with activity, but end at the 8-hour absolute limit", async () => {
    const admin = await h.createAdmin(AdminRole.MANAGER);
    const session = await h.signIn(admin);
    for (let t = 0; t < SESSION_ABSOLUTE_MS - 20 * 60_000; t += 20 * 60_000) {
      h.clock.advance(20 * 60_000);
      expect((await h.get(ME, session)).status).toBe(200);
    }
    h.clock.advance(20 * 60_000);
    expect((await h.get(ME, session)).status).toBe(401);
  });

  it("are rotated at sign-in and deleted at sign-out", async () => {
    const admin = await h.createAdmin(AdminRole.OWNER);
    const first = await h.signIn(admin);
    // Signing in again from the same browser ends the earlier session.
    const challenge = await challengeFor(admin);
    const again = await request(h.app)
      .post(MFA)
      .set("Origin", ADMIN)
      .set("Cookie", [first.cookie, (await h.csrf()).cookie].join("; "))
      .set("X-CSRF-Token", first.csrfToken)
      .send({ challenge, code: totp(admin.secret, h.clock.now()) });
    expect(again.status).toBe(200);
    h.clock.advance(31_000);
    expect(await h.sessionRow(first)).toBeNull();
    const second = cookiePair(
      again.headers["set-cookie"],
      ADMIN_SESSION_COOKIE,
    );
    const session = {
      cookie: second,
      csrfToken: again.body.csrfToken as string,
      token: second.split("=")[1]!,
    };
    const out = await h.post("/api/v1/admin/auth/sign-out", {}, session);
    expect(out.status).toBe(204);
    expect(await h.sessionRow(session)).toBeNull();
    expect((await h.get(ME, session)).status).toBe(401);
  });

  it("require a session for /me and sign-out", async () => {
    expect((await h.get(ME)).status).toBe(401);
    expect((await h.post("/api/v1/admin/auth/sign-out")).status).toBe(401);
  });
});

describe("session-bound CSRF (D-068)", () => {
  it("accepts only the token bound to this session", async () => {
    const a = await h.signIn(await h.createAdmin(AdminRole.OWNER));
    const b = await h.signIn(await h.createAdmin(AdminRole.OWNER));
    const pair = await h.csrf();
    const attempt = (token: string, extraCookie = "") =>
      request(h.app)
        .post("/api/v1/admin/auth/sign-out")
        .set("Origin", ADMIN)
        .set("Cookie", [a.cookie, extraCookie].filter(Boolean).join("; "))
        .set("X-CSRF-Token", token)
        .send({});
    // A valid double-submit token is not enough once a session exists.
    expect((await attempt(pair.token, pair.cookie)).body.error.code).toBe(
      "CSRF_FAILED",
    );
    expect((await attempt(b.csrfToken)).body.error.code).toBe("CSRF_FAILED");
    const foreign = await request(h.app)
      .post("/api/v1/admin/auth/sign-out")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", a.cookie)
      .set("X-CSRF-Token", a.csrfToken)
      .send({});
    expect(foreign.status).toBe(403);
    expect((await attempt(a.csrfToken)).status).toBe(204);
  });
});

describe("logs (D-073)", () => {
  it("never contain passwords, codes, challenges or session tokens", async () => {
    const admin = await h.createAdmin(AdminRole.OWNER, {
      password: "log-check secret passphrase",
    });
    await h.post(SIGN_IN, {
      email: admin.email,
      password: "a wrong log-check passphrase",
    });
    const challenge = await challengeFor(admin);
    const code = totp(admin.secret, h.clock.now());
    const res = await h.post(MFA, { challenge, code });
    const token = cookiePair(
      res.headers["set-cookie"],
      ADMIN_SESSION_COOKIE,
    ).split("=")[1]!;
    h.clock.advance(31_000);
    const log = h.lines.join("\n");
    for (const secret of [
      admin.password,
      "a wrong log-check passphrase",
      challenge,
      token,
      admin.email,
    ])
      expect(log).not.toContain(secret);
    expect(log).toContain('"event":"admin.sign_in_failed"');
  });
});

describe("rate limits (D-074)", () => {
  it("allows 10 sign-in attempts per 15 minutes per IP, then 429", async () => {
    const limited = await adminHarness({ authLimits: DEFAULT_AUTH_LIMITS });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 11; i++)
        statuses.push(
          (
            await limited.post(SIGN_IN, {
              email: "nobody@example.test",
              password: "whatever password",
            })
          ).status,
        );
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.drop();
    }
  });
});
