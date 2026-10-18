// Phase 7 schema rules (D-032, D-065, D-070, D-071), enforced by PostgreSQL.
import { createHash, randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.ts";
import { createTestDatabase } from "./testing/database.ts";
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

const hash = () => createHash("sha256").update(randomBytes(32)).digest("hex");
let n = 0;

const adminSql = (cols: Record<string, string>) => {
  const all = {
    email: `'test-mfa-${++n}@example.test'`,
    name: "'TEST'",
    password_hash: "'TEST-hash'",
    role: "'MANAGER'",
    updated_at: "now()",
    ...cols,
  };
  return `INSERT INTO "admin_user" (${Object.keys(all)
    .map((k) => `"${k}"`)
    .join(", ")}) VALUES (${Object.values(all).join(", ")})`;
};
const ENROLLED = {
  mfa_secret_encrypted: "'\\x01'::bytea",
  mfa_key_version: "1",
  mfa_enabled_at: "now()",
};

describe("mandatory 2FA (D-032)", () => {
  it("rejects an active admin without 2FA", () =>
    expectCheck(db, adminSql({}), "admin_user_mfa_required_check"));

  it.each([
    ["no enrolment date", { ...ENROLLED, mfa_enabled_at: "NULL" }],
    [
      "no secret",
      { ...ENROLLED, mfa_secret_encrypted: "NULL", mfa_key_version: "NULL" },
    ],
  ])("rejects an active admin with %s", (_name, cols) =>
    expectCheck(db, adminSql(cols), "admin_user_mfa_required_check"),
  );

  it("accepts an active, enrolled admin and an inactive one without 2FA", async () => {
    await expectAccepted(db, adminSql(ENROLLED));
    await expectAccepted(db, adminSql({ is_active: "false" }));
  });

  it("rejects reactivating an admin who has no 2FA", async () => {
    const [row] = await db.$queryRawUnsafe<{ id: string }[]>(
      adminSql({ is_active: "false" }) + ` RETURNING "id"`,
    );
    await expectCheck(
      db,
      `UPDATE "admin_user" SET "is_active" = true WHERE "id" = '${row!.id}'`,
      "admin_user_mfa_required_check",
    );
  });

  it("requires the key version with the secret, and the reverse", async () => {
    await expectCheck(
      db,
      adminSql({ is_active: "false", mfa_secret_encrypted: "'\\x01'::bytea" }),
      "admin_user_mfa_key_check",
    );
    await expectCheck(
      db,
      adminSql({ is_active: "false", mfa_key_version: "1" }),
      "admin_user_mfa_key_check",
    );
  });

  it("rejects a negative last-used TOTP step", () =>
    expectCheck(
      db,
      adminSql({ ...ENROLLED, mfa_last_used_step: "-1" }),
      "admin_user_mfa_last_used_step_check",
    ));
});

describe("invites (D-070)", () => {
  const inviteSql = (cols: Record<string, string> = {}) => {
    const all = {
      email: "'test-invitee@example.test'",
      role: "'FULFILMENT'",
      token_hash: `decode('${hash()}', 'hex')`,
      expires_at: "now() + interval '48 hours'",
      ...cols,
    };
    return `INSERT INTO "admin_invite" (${Object.keys(all)
      .map((k) => `"${k}"`)
      .join(", ")}) VALUES (${Object.values(all).join(", ")})`;
  };

  it("accepts a valid invite, including the CLI bootstrap with no inviter", () =>
    expectAccepted(db, inviteSql()));

  it.each([
    ["31 bytes", "ab".repeat(31)],
    ["33 bytes", "ab".repeat(33)],
  ])("rejects a token hash of %s", (_name, hex) =>
    expectCheck(
      db,
      inviteSql({ token_hash: `decode('${hex}', 'hex')` }),
      "admin_invite_token_hash_check",
    ),
  );

  it("rejects a duplicate token hash", async () => {
    const h = hash();
    await expectAccepted(
      db,
      inviteSql({ token_hash: `decode('${h}', 'hex')` }),
    );
    await expectCode(
      db,
      inviteSql({ token_hash: `decode('${h}', 'hex')` }),
      SQLSTATE.UNIQUE,
      "admin_invite_token_hash_key",
    );
  });

  it("rejects an invite that expires when or before it is created", async () => {
    await expectCheck(
      db,
      inviteSql({ expires_at: "now()" }),
      "admin_invite_expiry_check",
    );
    await expectCheck(
      db,
      inviteSql({ expires_at: "now() - interval '1 hour'" }),
      "admin_invite_expiry_check",
    );
  });

  it("rejects an invite that is both accepted and revoked", () =>
    expectCheck(
      db,
      inviteSql({ accepted_at: "now()", revoked_at: "now()" }),
      "admin_invite_outcome_check",
    ));

  it("requires the pending secret and its key version together", async () => {
    await expectCheck(
      db,
      inviteSql({ pending_mfa_secret_encrypted: "'\\x01'::bytea" }),
      "admin_invite_pending_mfa_check",
    );
    await expectCheck(
      db,
      inviteSql({ pending_mfa_key_version: "1" }),
      "admin_invite_pending_mfa_check",
    );
  });

  it("rejects an unknown role", () =>
    expectCode(db, inviteSql({ role: "'SUPERUSER'" }), SQLSTATE.INVALID_ENUM));

  it("an inviter with sent invites cannot be deleted", async () => {
    const owner = await fx.admin(db);
    await expectAccepted(db, inviteSql({ invited_by_admin_id: `'${owner}'` }));
    await expectCode(
      db,
      `DELETE FROM "admin_user" WHERE "id" = '${owner}'`,
      SQLSTATE.RESTRICT,
      "admin_invite_invited_by_admin_id_fkey",
    );
  });
});

describe("recovery codes and cascades (D-071)", () => {
  const codeSql = (admin: string, hex = hash()) =>
    `INSERT INTO "admin_recovery_code" ("admin_user_id", "code_hash") VALUES ('${admin}', decode('${hex}', 'hex'))`;

  it("stores only 32-byte hashes, unique", async () => {
    const a = await fx.admin(db);
    await expectCheck(
      db,
      codeSql(a, "ab".repeat(16)),
      "admin_recovery_code_hash_check",
    );
    const h = hash();
    await expectAccepted(db, codeSql(a, h));
    await expectCode(
      db,
      codeSql(a, h),
      SQLSTATE.UNIQUE,
      "admin_recovery_code_code_hash_key",
    );
  });

  it("deleting an admin removes their recovery codes and reset invites", async () => {
    const a = await fx.admin(db);
    await db.$executeRawUnsafe(codeSql(a));
    await db.$executeRawUnsafe(
      `INSERT INTO "admin_invite" ("email", "role", "token_hash", "admin_user_id", "expires_at")
       VALUES ('test-reset@example.test', 'MANAGER', decode('${hash()}', 'hex'), '${a}', now() + interval '1 hour')`,
    );
    await expectAccepted(db, `DELETE FROM "admin_user" WHERE "id" = '${a}'`);
    const [left] = await db.$queryRawUnsafe<
      { codes: number; invites: number }[]
    >(
      `SELECT (SELECT count(*)::int FROM "admin_recovery_code" WHERE "admin_user_id" = '${a}') AS codes,
              (SELECT count(*)::int FROM "admin_invite" WHERE "admin_user_id" = '${a}') AS invites`,
    );
    expect(left).toEqual({ codes: 0, invites: 0 });
  });
});
