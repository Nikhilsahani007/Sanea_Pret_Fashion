// Invites and resets (D-069 to D-071). A link is single-use, valid for 48
// hours, and stored only as a SHA-256 hash. Accepting it sets the password and
// enrols 2FA in one step; a reset invite replaces both for an existing admin.
// Until an email provider exists (Phase 16) the link is returned to the Owner.
import type { AdminRole } from "@sanea/shared";

import type { Prisma } from "../../generated/prisma/client.ts";
import { AppError } from "../../platform/http/errors.ts";
import { recordAudit } from "../audit/record.ts";
import type { AuthDeps } from "./deps.ts";
import { hashPassword, passwordProblem } from "./password.ts";
import {
  decryptSecret,
  encryptSecret,
  newRecoveryCodes,
  newToken,
  normaliseRecoveryCode,
  sha256,
} from "./secrets.ts";
import {
  base32Encode,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from "./totp.ts";

export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;

/** The link the Owner passes on. The token is in the fragment, so it never reaches server logs. */
export function inviteUrl(adminOrigin: string, token: string): string {
  return `${adminOrigin}/accept-invite#token=${token}`;
}

export async function createInvite(
  tx: Tx,
  deps: AuthDeps,
  input: {
    email: string;
    role: AdminRole;
    adminUserId?: string;
    invitedByAdminId: string | null;
  },
): Promise<{ id: string; url: string; expiresAt: Date }> {
  const now = deps.now();
  const { token, hash } = newToken();
  // Only one open link per person: earlier ones stop working.
  await tx.adminInvite.updateMany({
    where: {
      email: input.email,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: now },
  });
  const invite = await tx.adminInvite.create({
    data: {
      email: input.email,
      role: input.role,
      tokenHash: hash,
      adminUserId: input.adminUserId ?? null,
      invitedByAdminId: input.invitedByAdminId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    },
  });
  return {
    id: invite.id,
    url: inviteUrl(deps.config.adminOrigin, token),
    expiresAt: invite.expiresAt,
  };
}

async function openInvite(deps: AuthDeps, token: string) {
  const invite = await deps.db.adminInvite.findUnique({
    where: { tokenHash: sha256(token) },
  });
  if (
    !invite ||
    invite.acceptedAt ||
    invite.revokedAt ||
    invite.expiresAt <= deps.now()
  ) {
    throw new AppError("INVITE_INVALID");
  }
  return invite;
}

export async function inspectInvite(deps: AuthDeps, token: string) {
  const invite = await openInvite(deps, token);
  return {
    email: invite.email,
    role: invite.role,
    kind: invite.adminUserId ? "reset" : "invite",
    expiresAt: invite.expiresAt,
  } as const;
}

/** Generates (or replaces) the pending 2FA secret and returns it once for the authenticator app. */
export async function startEnrolment(deps: AuthDeps, token: string) {
  const invite = await openInvite(deps, token);
  const secret = generateTotpSecret();
  await deps.db.adminInvite.update({
    where: { id: invite.id },
    data: {
      pendingMfaSecret: encryptSecret(deps.config.mfaEncryptionKey, secret),
      pendingMfaKeyVersion: deps.config.mfaKeyVersion,
    },
  });
  return {
    otpauthUri: otpauthUri(secret, invite.email),
    secret: base32Encode(secret),
  };
}

export async function acceptInvite(
  deps: AuthDeps,
  input: { token: string; name?: string; password: string; code: string },
  ip: string | undefined,
): Promise<{ recoveryCodes: string[] }> {
  const problem = passwordProblem(input.password);
  if (problem)
    throw new AppError("PASSWORD_REJECTED", [
      { path: "password", code: problem },
    ]);
  const passwordHash = await hashPassword(input.password, deps.argon2);
  const now = deps.now();
  const recoveryCodes = newRecoveryCodes();

  return deps.db.$transaction(async (tx) => {
    // Lock the invite row: two concurrent accepts cannot both succeed.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "admin_invite" WHERE "token_hash" = ${sha256(input.token)}
      FOR UPDATE`;
    const invite = locked[0]
      ? await tx.adminInvite.findUnique({ where: { id: locked[0].id } })
      : null;
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt <= now
    ) {
      throw new AppError("INVITE_INVALID");
    }
    if (
      !invite.pendingMfaSecret ||
      invite.pendingMfaKeyVersion !== deps.config.mfaKeyVersion
    ) {
      throw new AppError("VALIDATION_FAILED", [
        { path: "code", code: "MFA_NOT_STARTED" },
      ]);
    }
    const secret = decryptSecret(
      deps.config.mfaEncryptionKey,
      invite.pendingMfaSecret,
    );
    const step = verifyTotp(secret, input.code, now, null);
    if (step === null) {
      throw new AppError("VALIDATION_FAILED", [
        { path: "code", code: "MFA_CODE_INVALID" },
      ]);
    }
    const credentials = {
      passwordHash,
      mfaSecretEncrypted: invite.pendingMfaSecret,
      mfaKeyVersion: invite.pendingMfaKeyVersion,
      mfaEnabledAt: now,
      mfaLastUsedStep: step,
      failedLoginCount: 0,
      lockedUntil: null,
    };

    let adminId: string;
    if (invite.adminUserId) {
      adminId = invite.adminUserId;
      await tx.adminUser.update({ where: { id: adminId }, data: credentials });
      await tx.adminSession.deleteMany({ where: { adminUserId: adminId } });
      await tx.adminRecoveryCode.deleteMany({
        where: { adminUserId: adminId },
      });
    } else {
      const name = input.name?.trim();
      if (!name) {
        throw new AppError("VALIDATION_FAILED", [
          { path: "name", code: "REQUIRED" },
        ]);
      }
      const existing = await tx.adminUser.findUnique({
        where: { email: invite.email },
      });
      if (existing) throw new AppError("CONFLICT");
      const created = await tx.adminUser.create({
        data: {
          email: invite.email,
          name,
          role: invite.role,
          ...credentials,
        },
      });
      adminId = created.id;
    }

    await tx.adminRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({
        adminUserId: adminId,
        codeHash: sha256(normaliseRecoveryCode(code)),
      })),
    });
    await tx.adminInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: now,
        adminUserId: adminId,
        pendingMfaSecret: null,
        pendingMfaKeyVersion: null,
      },
    });
    await recordAudit(tx, deps.config.ipHashKey, {
      actorAdminId: adminId,
      action: invite.adminUserId
        ? "admin.reset_completed"
        : "admin.invite_accepted",
      entityType: "admin_user",
      entityId: adminId,
      after: { role: invite.role, mfa: true },
      ip,
    });
    return { recoveryCodes };
  });
}
