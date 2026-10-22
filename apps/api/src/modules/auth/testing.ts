// Test harness for admin-auth API tests (D-059). Not used by production code.
// A cloned database, an app with a controllable clock, cheap Argon2 settings
// and high auth rate limits, plus helpers to create admins and sign in.
import type { AdminRole } from "@sanea/shared";
import type { Router } from "express";
import request from "supertest";

import { createTestDatabase } from "../../db/testing/database.ts";
import { sessionCsrfToken } from "../../platform/http/csrf.ts";
import {
  ADMIN,
  SECRET,
  cookiePair,
  testApp,
  testConfig,
} from "../../platform/testing.ts";
import type { MediaOptions } from "../media/router.ts";
import { CSRF_COOKIE } from "../../platform/http/csrf.ts";
import { hashPassword, type Argon2Params } from "./password.ts";
import type { AuthLimits } from "./router.ts";
import { encryptSecret, sha256 } from "./secrets.ts";
import { ADMIN_SESSION_COOKIE } from "./sessions.ts";
import { generateTotpSecret, totp } from "./totp.ts";

export const FAST_ARGON2: Argon2Params = {
  memory: 1024,
  passes: 1,
  parallelism: 1,
};
export const HIGH_LIMITS = {
  signIn: { windowMs: 60_000, limit: 10_000 },
  invite: { windowMs: 60_000, limit: 10_000 },
} satisfies AuthLimits;

export type TestAdmin = {
  id: string;
  email: string;
  password: string;
  secret: Buffer;
  role: AdminRole;
};

export type Session = { cookie: string; csrfToken: string; token: string };

let counter = 0;

export async function adminHarness(
  options: {
    authLimits?: AuthLimits;
    routers?: Router[];
    /** Environment overrides, for example the media folder. */
    env?: Record<string, string>;
    media?: MediaOptions;
    searchLimit?: { windowMs: number; limit: number };
  } = {},
) {
  const { db, drop } = await createTestDatabase();
  let current = new Date("2026-10-19T10:00:00.000Z");
  const clock = {
    now: () => current,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
  const { app, lines, config } = testApp({
    ...(options.env ? { config: testConfig(options.env) } : {}),
    ...(options.media ? { media: options.media } : {}),
    ...(options.searchLimit ? { searchLimit: options.searchLimit } : {}),
    db,
    now: clock.now,
    argon2: FAST_ARGON2,
    authLimits: options.authLimits ?? HIGH_LIMITS,
    ...(options.routers ? { routers: options.routers } : {}),
  });

  /** A double-submit CSRF pair for requests without a session. */
  async function csrf() {
    const res = await request(app).get("/api/v1/auth/csrf");
    return {
      token: res.body.csrfToken as string,
      cookie: cookiePair(res.headers["set-cookie"], CSRF_COOKIE),
    };
  }

  /** POST from the admin origin; with a session, uses its bound CSRF token. */
  async function post(path: string, body: object = {}, session?: Session) {
    if (session) {
      return request(app)
        .post(path)
        .set("Origin", ADMIN)
        .set("Cookie", session.cookie)
        .set("X-CSRF-Token", session.csrfToken)
        .send(body);
    }
    const pair = await csrf();
    return request(app)
      .post(path)
      .set("Origin", ADMIN)
      .set("Cookie", pair.cookie)
      .set("X-CSRF-Token", pair.token)
      .send(body);
  }

  async function patch(path: string, body: object, session: Session) {
    return request(app)
      .patch(path)
      .set("Origin", ADMIN)
      .set("Cookie", session.cookie)
      .set("X-CSRF-Token", session.csrfToken)
      .send(body);
  }

  function get(path: string, session?: Session) {
    const req = request(app).get(path).set("Origin", ADMIN);
    return session ? req.set("Cookie", session.cookie) : req;
  }

  async function createAdmin(
    role: AdminRole,
    overrides: { isActive?: boolean; password?: string } = {},
  ): Promise<TestAdmin> {
    const i = ++counter;
    const password = overrides.password ?? `test passphrase number ${i}`;
    const secret = generateTotpSecret();
    const admin = await db.adminUser.create({
      data: {
        email: `test-${role.toLowerCase()}-${i}@example.test`,
        name: `TEST ${role} ${i}`,
        role,
        passwordHash: await hashPassword(password, FAST_ARGON2),
        mfaSecretEncrypted: encryptSecret(config.mfaEncryptionKey, secret),
        mfaKeyVersion: config.mfaKeyVersion,
        mfaEnabledAt: clock.now(),
        isActive: overrides.isActive ?? true,
      },
    });
    return { id: admin.id, email: admin.email, password, secret, role };
  }

  /** Full two-step sign-in; moves the clock past the TOTP step afterwards. */
  async function signIn(admin: TestAdmin): Promise<Session> {
    const first = await post("/api/v1/admin/auth/sign-in", {
      email: admin.email,
      password: admin.password,
    });
    if (first.status !== 200) throw new Error(`sign-in ${first.status}`);
    const second = await post("/api/v1/admin/auth/mfa", {
      challenge: first.body.challenge,
      code: totp(admin.secret, clock.now()),
    });
    if (second.status !== 200) throw new Error(`mfa ${second.status}`);
    clock.advance(31_000);
    const cookie = cookiePair(
      second.headers["set-cookie"],
      ADMIN_SESSION_COOKIE,
    );
    return {
      cookie,
      csrfToken: second.body.csrfToken as string,
      token: cookie.split("=")[1] ?? "",
    };
  }

  async function sessionRow(session: Session) {
    return db.adminSession.findUnique({
      where: { tokenHash: sha256(session.token) },
    });
  }

  return {
    db,
    drop,
    app,
    lines,
    config,
    clock,
    csrf,
    post,
    patch,
    get,
    createAdmin,
    signIn,
    sessionRow,
    csrfFor: (sessionId: string) => sessionCsrfToken(SECRET, sessionId),
  };
}

export type Harness = Awaited<ReturnType<typeof adminHarness>>;
