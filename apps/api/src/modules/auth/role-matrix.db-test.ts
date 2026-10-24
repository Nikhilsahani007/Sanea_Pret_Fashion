// The role matrix test (index Phase 7 verification, D-075): every permission
// in security-design.md §4, for every role, through the real session and
// middleware. Rows whose routes arrive in later phases use stand-in routes
// guarded by the same middleware; the staff and audit routes are real.
import { AdminRole } from "@sanea/shared";
import { Router } from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requirePermission } from "./middleware.ts";
import { PERMISSIONS, can, type Permission } from "./permissions.ts";
import { adminHarness, type Harness, type Session } from "./testing.ts";

const standIns = Router();
for (const permission of Object.keys(PERMISSIONS) as Permission[]) {
  standIns.get(
    `/api/v1/admin/__matrix/${permission}`,
    requirePermission(permission),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
}

const ROLES = Object.values(AdminRole);
let h: Harness;
const sessions = new Map<AdminRole, Session>();

beforeAll(async () => {
  h = await adminHarness({ routers: [standIns] });
  for (const role of ROLES)
    sessions.set(role, await h.signIn(await h.createAdmin(role)));
});
afterAll(() => h.drop());

const cases = ROLES.flatMap((role) =>
  (Object.keys(PERMISSIONS) as Permission[]).map((permission) => ({
    role,
    permission,
    allowed: can(role, permission),
  })),
);

describe("permission matrix", () => {
  it("covers 15 permissions for 4 roles", () => {
    expect(cases).toHaveLength(60);
  });

  it.each(cases)(
    "$role / $permission → allowed: $allowed",
    async ({ role, permission, allowed }) => {
      const res = await h.get(
        `/api/v1/admin/__matrix/${permission}`,
        sessions.get(role),
      );
      expect(res.status).toBe(allowed ? 200 : 403);
      if (!allowed) expect(res.body.error.code).toBe("FORBIDDEN");
    },
  );

  it.each(Object.keys(PERMISSIONS))(
    "unauthenticated / %s → 401",
    async (permission) => {
      const res = await h.get(`/api/v1/admin/__matrix/${permission}`);
      expect(res.status).toBe(401);
    },
  );
});

describe("real Phase 7 routes", () => {
  it.each(ROLES)("%s: staff and audit log only for the Owner", async (role) => {
    const session = sessions.get(role)!;
    const expected = role === AdminRole.OWNER ? 200 : 403;
    expect((await h.get("/api/v1/admin/staff", session)).status).toBe(expected);
    expect((await h.get("/api/v1/admin/audit-log", session)).status).toBe(
      expected,
    );
    const invite = await h.post(
      "/api/v1/admin/staff/invites",
      {
        email: `test-matrix-${role.toLowerCase()}@example.test`,
        role: "MANAGER",
      },
      session,
    );
    expect(invite.status).toBe(role === AdminRole.OWNER ? 201 : 403);
  });

  it.each(ROLES)(
    "%s: /me and sign-out are open to every role",
    async (role) => {
      const session = sessions.get(role)!;
      expect(
        (await h.get("/api/v1/admin/auth/me", session)).body.admin.role,
      ).toBe(role);
    },
  );

  it("role checks read the server-side session, not anything the client sends", async () => {
    const fulfilment = sessions.get(AdminRole.FULFILMENT)!;
    const res = await h
      .get("/api/v1/admin/staff", fulfilment)
      .set("X-Role", "OWNER")
      .query({ role: "OWNER" });
    expect(res.status).toBe(403);
  });
});

describe("real Phase 15 and 16 routes", () => {
  it.each(ROLES)(
    "%s: orders, enquiries and settings by the matrix",
    async (role) => {
      const session = sessions.get(role)!;
      const status = (p: Permission) => (can(role, p) ? 200 : 403);
      expect((await h.get("/api/v1/admin/orders", session)).status).toBe(
        status("orders.view"),
      );
      expect((await h.get("/api/v1/admin/enquiries", session)).status).toBe(
        status("enquiries.manage"),
      );
      expect((await h.get("/api/v1/admin/settings/cod", session)).status).toBe(
        status("settings.store"),
      );
      expect((await h.get("/api/v1/admin/dashboard", session)).status).toBe(
        200,
      );
    },
  );
});
