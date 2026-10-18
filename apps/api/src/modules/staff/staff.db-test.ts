// Invites, resets, staff rules, audit log and the first-Owner command through
// the real API and database (D-069 to D-073).
import { AdminRole } from "@sanea/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { pino } from "pino";

import { createFirstOwnerInvite, OwnerExists } from "../auth/create-owner.ts";
import { INVITE_TTL_MS } from "../auth/invites.ts";
import {
  adminHarness,
  FAST_ARGON2,
  type Harness,
  type Session,
} from "../auth/testing.ts";
import { totp } from "../auth/totp.ts";

let h: Harness;
let owner: Session;
let ownerId: string;

beforeAll(async () => {
  h = await adminHarness();
  const o = await h.createAdmin(AdminRole.OWNER);
  ownerAdmin = o;
  ownerId = o.id;
  owner = await h.signIn(o);
});
afterAll(() => h.drop());

// Some tests move the clock by hours, which correctly ends the Owner's
// session (8-hour limit); sign in again when that has happened.
let ownerAdmin: Awaited<ReturnType<Harness["createAdmin"]>>;
beforeEach(async () => {
  if ((await h.get("/api/v1/admin/auth/me", owner)).status !== 200)
    owner = await h.signIn(ownerAdmin);
});

const tokenOf = (url: string) => new URL(url).hash.replace("#token=", "");
const secretOf = (base32: string) => {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const ch of base32) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
};

async function invite(email: string, role: AdminRole) {
  const res = await h.post(
    "/api/v1/admin/staff/invites",
    { email, role },
    owner,
  );
  expect(res.status).toBe(201);
  return tokenOf(res.body.inviteUrl);
}

/** Runs the whole acceptance: inspect, enrol, accept. */
async function accept(
  token: string,
  password = "a brand new passphrase",
  name = "TEST Invitee",
) {
  const enrol = await h.post("/api/v1/admin/auth/invites/enrol", { token });
  expect(enrol.status).toBe(200);
  const secret = secretOf(enrol.body.secret);
  const res = await h.post("/api/v1/admin/auth/invites/accept", {
    token,
    name,
    password,
    code: totp(secret, h.clock.now()),
  });
  return { res, secret };
}

describe("invites (D-070)", () => {
  it("returns a link with the token in the fragment, valid for 48 hours", async () => {
    const res = await h.post(
      "/api/v1/admin/staff/invites",
      { email: "test-link@example.test", role: "MANAGER" },
      owner,
    );
    expect(res.status).toBe(201);
    const url = new URL(res.body.inviteUrl);
    expect(`${url.origin}${url.pathname}`).toBe(
      "http://localhost:5174/accept-invite",
    );
    expect(url.search).toBe("");
    expect(tokenOf(res.body.inviteUrl)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      new Date(res.body.expiresAt).getTime() - h.clock.now().getTime(),
    ).toBe(INVITE_TTL_MS);
    const row = await h.db.adminInvite.findFirst({
      where: { email: "test-link@example.test" },
    });
    expect(JSON.stringify(row)).not.toContain(tokenOf(res.body.inviteUrl));
  });

  it("inspect, enrol and accept create an enrolled admin who can sign in", async () => {
    const token = await invite(
      "test-new@example.test",
      AdminRole.CATALOGUE_EDITOR,
    );
    const inspect = await h.post("/api/v1/admin/auth/invites/inspect", {
      token,
    });
    expect(inspect.body).toMatchObject({
      email: "test-new@example.test",
      role: "CATALOGUE_EDITOR",
      kind: "invite",
    });
    const enrol = await h.post("/api/v1/admin/auth/invites/enrol", { token });
    expect(enrol.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const { res, secret } = await accept(token, "catalogue editor passphrase");
    expect(res.status).toBe(201);
    expect(res.body.recoveryCodes).toHaveLength(10);
    const admin = await h.db.adminUser.findUnique({
      where: { email: "test-new@example.test" },
    });
    expect(admin).toMatchObject({
      role: "CATALOGUE_EDITOR",
      isActive: true,
      mfaKeyVersion: 1,
    });
    expect(admin?.mfaEnabledAt).not.toBeNull();
    expect(admin?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      await h.db.adminRecoveryCode.count({ where: { adminUserId: admin!.id } }),
    ).toBe(10);
    h.clock.advance(31_000);
    await h.signIn({
      id: admin!.id,
      email: admin!.email,
      password: "catalogue editor passphrase",
      secret,
      role: AdminRole.CATALOGUE_EDITOR,
    });
  });

  it("is single use", async () => {
    const token = await invite("test-once@example.test", AdminRole.FULFILMENT);
    expect((await accept(token)).res.status).toBe(201);
    h.clock.advance(31_000);
    const again = await h.post("/api/v1/admin/auth/invites/enrol", { token });
    expect(again.body.error.code).toBe("INVITE_INVALID");
  });

  it("expires after 48 hours", async () => {
    const token = await invite(
      "test-expiry@example.test",
      AdminRole.FULFILMENT,
    );
    h.clock.advance(INVITE_TTL_MS);
    const res = await h.post("/api/v1/admin/auth/invites/inspect", { token });
    expect(res.body.error.code).toBe("INVITE_INVALID");
  });

  it("an older link stops working when a new one is issued", async () => {
    const first = await invite("test-twice@example.test", AdminRole.MANAGER);
    const second = await invite("test-twice@example.test", AdminRole.MANAGER);
    expect(
      (await h.post("/api/v1/admin/auth/invites/inspect", { token: first }))
        .status,
    ).toBe(400);
    expect(
      (await h.post("/api/v1/admin/auth/invites/inspect", { token: second }))
        .status,
    ).toBe(200);
  });

  it("rejects short, long and common passwords, and a wrong code", async () => {
    const token = await invite("test-policy@example.test", AdminRole.MANAGER);
    await h.post("/api/v1/admin/auth/invites/enrol", { token });
    for (const [password, problem] of [
      ["short pass", "TOO_SHORT"],
      ["x".repeat(129), "TOO_LONG"],
      ["123456789012", "TOO_COMMON"],
    ] as const) {
      const res = await h.post("/api/v1/admin/auth/invites/accept", {
        token,
        name: "TEST",
        password,
        code: "000000",
      });
      expect(res.body.error).toMatchObject({
        code: "PASSWORD_REJECTED",
        details: [{ path: "password", code: problem }],
      });
    }
    const wrong = await h.post("/api/v1/admin/auth/invites/accept", {
      token,
      name: "TEST",
      password: "a fine passphrase",
      code: "000000",
    });
    expect(wrong.body.error).toMatchObject({
      code: "VALIDATION_FAILED",
      details: [{ path: "code", code: "MFA_CODE_INVALID" }],
    });
  });

  it("refuses an invite for an email that already has an account", async () => {
    const existing = await h.createAdmin(AdminRole.MANAGER);
    const res = await h.post(
      "/api/v1/admin/staff/invites",
      { email: existing.email, role: "MANAGER" },
      owner,
    );
    expect(res.status).toBe(409);
  });
});

describe("recovery codes (D-071)", () => {
  it("sign in once each, then stop working", async () => {
    const token = await invite("test-recovery@example.test", AdminRole.MANAGER);
    const { res } = await accept(token, "recovery code passphrase");
    const [code] = res.body.recoveryCodes as string[];
    h.clock.advance(31_000);
    const signIn = () =>
      h.post("/api/v1/admin/auth/sign-in", {
        email: "test-recovery@example.test",
        password: "recovery code passphrase",
      });
    const ok = await h.post("/api/v1/admin/auth/mfa", {
      challenge: (await signIn()).body.challenge,
      recoveryCode: code!.toLowerCase(),
    });
    expect(ok.status).toBe(200);
    const reused = await h.post("/api/v1/admin/auth/mfa", {
      challenge: (await signIn()).body.challenge,
      recoveryCode: code,
    });
    expect(reused.status).toBe(401);
  });
});

describe("resets (D-071)", () => {
  it("replace password and 2FA, end sessions and old recovery codes", async () => {
    const target = await h.createAdmin(AdminRole.FULFILMENT);
    const session = await h.signIn(target);
    await h.db.adminRecoveryCode.create({
      data: { adminUserId: target.id, codeHash: new Uint8Array(32).fill(1) },
    });
    const reset = await h.post(
      `/api/v1/admin/staff/${target.id}/reset`,
      {},
      owner,
    );
    expect(reset.status).toBe(201);
    const token = tokenOf(reset.body.inviteUrl);
    expect(
      (await h.post("/api/v1/admin/auth/invites/inspect", { token })).body.kind,
    ).toBe("reset");
    const { res, secret } = await accept(token, "the replacement passphrase");
    expect(res.status).toBe(201);
    expect(await h.sessionRow(session)).toBeNull();
    expect(
      await h.db.adminRecoveryCode.count({ where: { adminUserId: target.id } }),
    ).toBe(10);
    h.clock.advance(31_000);
    const old = await h.post("/api/v1/admin/auth/sign-in", {
      email: target.email,
      password: target.password,
    });
    expect(old.status).toBe(401);
    await h.signIn({
      ...target,
      password: "the replacement passphrase",
      secret,
    });
  });
});

describe("staff rules (D-072)", () => {
  it("the last active Owner cannot be demoted or deactivated", async () => {
    // Make this the only Owner: deactivate other Owners created by earlier tests.
    await h.db.adminUser.updateMany({
      where: { role: "OWNER", id: { not: ownerId } },
      data: { isActive: false },
    });
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/${ownerId}`,
          { role: "MANAGER" },
          owner,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/${ownerId}`,
          { isActive: false },
          owner,
        )
      ).status,
    ).toBe(409);
  });

  it("an Owner cannot deactivate themselves, even with another Owner", async () => {
    await h.createAdmin(AdminRole.OWNER);
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/${ownerId}`,
          { isActive: false },
          owner,
        )
      ).status,
    ).toBe(409);
  });

  it("deactivation and role changes end the target's sessions and are audited", async () => {
    const manager = await h.createAdmin(AdminRole.MANAGER);
    const s1 = await h.signIn(manager);
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/${manager.id}`,
          { role: "FULFILMENT" },
          owner,
        )
      ).status,
    ).toBe(204);
    expect(await h.sessionRow(s1)).toBeNull();
    const s2 = await h.signIn({ ...manager, role: AdminRole.FULFILMENT });
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/${manager.id}`,
          { isActive: false },
          owner,
        )
      ).status,
    ).toBe(204);
    expect((await h.get("/api/v1/admin/auth/me", s2)).status).toBe(401);
    expect(
      (
        await h.post("/api/v1/admin/auth/sign-in", {
          email: manager.email,
          password: manager.password,
        })
      ).status,
    ).toBe(401);
    const audit = await h.db.auditLog.findMany({
      where: { entityId: manager.id, action: "staff.updated" },
      orderBy: { id: "asc" },
    });
    expect(audit.map((a) => [a.before, a.after])).toEqual([
      [
        { role: "MANAGER", isActive: true },
        { role: "FULFILMENT", isActive: true },
      ],
      [
        { role: "FULFILMENT", isActive: true },
        { role: "FULFILMENT", isActive: false },
      ],
    ]);
  });

  it("validates the body and the id", async () => {
    expect(
      (await h.patch(`/api/v1/admin/staff/${ownerId}`, {}, owner)).status,
    ).toBe(400);
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/not-a-uuid`,
          { role: "OWNER" },
          owner,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await h.patch(
          `/api/v1/admin/staff/019a0000-0000-7000-8000-000000000000`,
          { role: "OWNER" },
          owner,
        )
      ).status,
    ).toBe(404);
  });
});

describe("staff list and audit log", () => {
  it("lists admins without secrets, and open invites", async () => {
    const res = await h.get("/api/v1/admin/staff", owner);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const field of [
      "passwordHash",
      "mfaSecretEncrypted",
      "tokenHash",
      "pendingMfaSecret",
    ])
      expect(text).not.toContain(field);
    expect(res.body.admins.length).toBeGreaterThan(3);
    expect(
      res.body.invites.every((i: { kind: string }) =>
        ["invite", "reset"].includes(i.kind),
      ),
    ).toBe(true);
  });

  it("audit log: newest first, paginated, no IP hashes or personal data", async () => {
    const page1 = await h.get("/api/v1/admin/audit-log?limit=3", owner);
    expect(page1.status).toBe(200);
    expect(page1.body.entries).toHaveLength(3);
    const ids = page1.body.entries.map((e: { id: string }) => e.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    const page2 = await h.get(
      `/api/v1/admin/audit-log?limit=3&before=${page1.body.nextBefore}`,
      owner,
    );
    expect(page2.body.entries[0].id < ids[2]).toBe(true);
    const all = JSON.stringify(await h.db.auditLog.findMany());
    expect(all).not.toMatch(/@example\.test|passphrase|argon2id/);
    expect(JSON.stringify(page1.body)).not.toContain("ipHash");
    const actions = new Set(
      (await h.db.auditLog.findMany()).map((a) => a.action),
    );
    for (const a of [
      "admin.sign_in",
      "staff.invited",
      "admin.invite_accepted",
      "staff.reset_issued",
      "admin.reset_completed",
      "staff.updated",
    ])
      expect(actions).toContain(a);
  });
});

describe("first Owner command (D-069)", () => {
  it("creates one Owner invite on an empty database, then refuses", async () => {
    const fresh = await adminHarness();
    try {
      const deps = {
        db: fresh.db,
        config: fresh.config,
        logger: pino({ level: "silent" }),
        now: fresh.clock.now,
        argon2: FAST_ARGON2,
      };
      const link = await createFirstOwnerInvite(
        deps,
        "test-first-owner@example.test",
      );
      expect(link.url).toMatch(
        /^http:\/\/localhost:5174\/accept-invite#token=/,
      );
      await expect(
        createFirstOwnerInvite(deps, "test-second@example.test"),
      ).rejects.toBeInstanceOf(OwnerExists);
      const invite = await fresh.db.adminInvite.findFirst();
      expect(invite).toMatchObject({ role: "OWNER", invitedByAdminId: null });
      // The link works end to end: the first Owner can be enrolled.
      const token = tokenOf(link.url);
      const enrol = await fresh.post("/api/v1/admin/auth/invites/enrol", {
        token,
      });
      const res = await fresh.post("/api/v1/admin/auth/invites/accept", {
        token,
        name: "TEST First Owner",
        password: "the first owner passphrase",
        code: totp(secretOf(enrol.body.secret), fresh.clock.now()),
      });
      expect(res.status).toBe(201);
      await expect(
        createFirstOwnerInvite(deps, "test-third@example.test"),
      ).rejects.toBeInstanceOf(OwnerExists);
    } finally {
      await fresh.drop();
    }
  });
});
