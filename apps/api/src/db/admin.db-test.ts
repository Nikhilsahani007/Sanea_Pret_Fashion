// Admin users and sessions (D-032, D-055), enforced by PostgreSQL.
import { createHash, randomBytes } from "node:crypto";

import { AdminRole } from "@sanea/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { createTestDatabase, dbError } from "./testing/database.ts";
import {
  SQLSTATE,
  expectAccepted,
  expectCheck,
  expectCode,
} from "./testing/expect.ts";
import * as fx from "./testing/fixtures.ts";

let db: PrismaClient;
let drop: () => Promise<void>;

beforeAll(async () => {
  ({ db, drop } = await createTestDatabase());
});
afterAll(() => drop());

const adminSql = (email: string, role = "OWNER") =>
  `INSERT INTO "admin_user" ("email", "name", "password_hash", "role", "mfa_secret_encrypted", "mfa_key_version", "mfa_enabled_at", "updated_at")
   VALUES ('${email}', 'TEST', 'TEST-hash', '${role}', '\\x00'::bytea, 1, now(), now())`;

const tokenHash = () =>
  createHash("sha256").update(randomBytes(32)).digest("hex");

const sessionSql = (
  admin: string,
  hashHex: string,
  expires = "now() + interval '8 hours'",
) =>
  `INSERT INTO "admin_session" ("admin_user_id", "token_hash", "expires_at")
   VALUES ('${admin}', decode('${hashHex}', 'hex'), ${expires})`;

describe("admin users", () => {
  it("rejects an email that differs only in case (SQL and Prisma)", async () => {
    await expectAccepted(db, adminSql("Test.Owner@Example.test"));
    await expectCode(
      db,
      adminSql("test.owner@example.TEST"),
      SQLSTATE.UNIQUE,
      "admin_user_email_key",
    );
    const error = await db.adminUser
      .create({
        data: {
          email: "TEST.OWNER@EXAMPLE.TEST",
          name: "TEST",
          passwordHash: "TEST-hash",
          role: "OWNER",
          mfaSecretEncrypted: new Uint8Array([0]),
          mfaKeyVersion: 1,
          mfaEnabledAt: new Date(),
        },
      })
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect((error as { code?: string }).code).toBe("P2002");
    expect(dbError(error)?.code).toBe(SQLSTATE.UNIQUE);
  });

  it.each(Object.values(AdminRole))("accepts shared role %s", (role) =>
    expectAccepted(
      db,
      adminSql(`test-role-${role.toLowerCase()}@example.test`, role),
    ),
  );

  it.each(["SUPERUSER", "owner", "CUSTOMER"])("rejects role %s", (role) =>
    expectCode(
      db,
      adminSql(`test-bad-${role}@example.test`, role),
      SQLSTATE.INVALID_ENUM,
    ),
  );

  it("rejects a negative failed-login count", async () => {
    const a = await fx.admin(db);
    await expectCheck(
      db,
      `UPDATE "admin_user" SET "failed_login_count" = -1 WHERE "id" = '${a}'`,
      "admin_user_failed_login_count_check",
    );
  });

  it("stores the 2FA secret as encrypted bytes, empty until enrolment", async () => {
    const [col] = await db.$queryRawUnsafe<
      { type: string; nullable: string }[]
    >(
      `SELECT data_type AS type, is_nullable AS nullable FROM information_schema.columns
       WHERE table_name = 'admin_user' AND column_name = 'mfa_secret_encrypted'`,
    );
    expect(col).toEqual({ type: "bytea", nullable: "YES" });
  });
});

describe("admin sessions", () => {
  it("stores a 32-byte hash and has no column for the raw token", async () => {
    const a = await fx.admin(db);
    await expectAccepted(db, sessionSql(a, tokenHash()));
    const cols = await db.$queryRawUnsafe<{ c: string }[]>(
      `SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'admin_session' ORDER BY ordinal_position`,
    );
    expect(cols.map((c) => c.c)).not.toContain("token");
    expect(cols.map((c) => c.c)).toContain("token_hash");
  });

  it.each([
    ["31 bytes", "ab".repeat(31)],
    ["33 bytes", "ab".repeat(33)],
    ["empty", ""],
  ])("rejects a token hash of %s", async (_name, hex) => {
    const a = await fx.admin(db);
    await expectCheck(db, sessionSql(a, hex), "admin_session_token_hash_check");
  });

  it("rejects a duplicate token hash", async () => {
    const a = await fx.admin(db);
    const hash = tokenHash();
    await expectAccepted(db, sessionSql(a, hash));
    await expectCode(
      db,
      sessionSql(a, hash),
      SQLSTATE.UNIQUE,
      "admin_session_token_hash_key",
    );
  });

  it("rejects a session that expires before it starts", async () => {
    const a = await fx.admin(db);
    await expectCheck(
      db,
      sessionSql(a, tokenHash(), "now() - interval '1 second'"),
      "admin_session_expiry_check",
    );
  });

  it("requires a real admin (foreign key)", () =>
    expectCode(
      db,
      sessionSql("019a0000-0000-7000-8000-000000000000", tokenHash()),
      SQLSTATE.FOREIGN_KEY,
      "admin_session_admin_user_id_fkey",
    ));

  const count = async (sql: string) =>
    (
      await db.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM ${sql}`,
      )
    )[0]?.n;

  it("deleting an admin without history removes their sessions", async () => {
    const a = await fx.admin(db);
    await db.$executeRawUnsafe(sessionSql(a, tokenHash()));
    await db.$executeRawUnsafe(sessionSql(a, tokenHash()));
    expect(await count(`"admin_session" WHERE "admin_user_id" = '${a}'`)).toBe(
      2,
    );
    await expectAccepted(db, `DELETE FROM "admin_user" WHERE "id" = '${a}'`);
    expect(await count(`"admin_session" WHERE "admin_user_id" = '${a}'`)).toBe(
      0,
    );
  });

  it("an admin with audit history cannot be deleted; sessions and audit stay", async () => {
    const a = await fx.admin(db);
    await db.$executeRawUnsafe(sessionSql(a, tokenHash()));
    await db.$executeRawUnsafe(
      `INSERT INTO "audit_log" ("actor_admin_id", "action", "entity_type") VALUES ('${a}', 'admin.sign_in', 'admin_user')`,
    );
    await expectCode(
      db,
      `DELETE FROM "admin_user" WHERE "id" = '${a}'`,
      SQLSTATE.RESTRICT,
      "audit_log_actor_admin_id_fkey",
    );
    expect(await count(`"admin_session" WHERE "admin_user_id" = '${a}'`)).toBe(
      1,
    );
    expect(await count(`"audit_log" WHERE "actor_admin_id" = '${a}'`)).toBe(1);
    // Deactivation is the supported path.
    await expectAccepted(
      db,
      `UPDATE "admin_user" SET "is_active" = false WHERE "id" = '${a}'`,
    );
  });
});
