// Two-step admin sign-in (D-066): password, then a 2FA code or a recovery
// code. Every failure is the same SIGN_IN_FAILED, with no hint of which step
// failed or whether the email exists. Wrong passwords and wrong codes both
// count toward the lockout: 5 failures lock the account for 15 minutes.
import { AppError } from "../../platform/http/errors.ts";
import type { AdminContext } from "../../platform/http/admin-context.ts";
import { recordAudit } from "../audit/record.ts";
import {
  challengeSubjectId,
  issueChallenge,
  verifyChallenge,
} from "./challenge.ts";
import type { AuthDeps } from "./deps.ts";
import { verifyAgainstDummy, verifyPassword } from "./password.ts";
import {
  decryptSecret,
  ipHash,
  normaliseRecoveryCode,
  sha256,
} from "./secrets.ts";
import { createSession } from "./sessions.ts";
import { verifyTotp } from "./totp.ts";

export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

type Fail =
  "unknown_or_inactive" | "locked" | "password" | "challenge" | "code";

function failed(deps: AuthDeps, reason: Fail, adminId?: string): AppError {
  // Application log only (D-073): no email, password or code.
  deps.logger.warn(
    { event: "admin.sign_in_failed", reason, adminId },
    "admin sign-in failed",
  );
  return new AppError("SIGN_IN_FAILED");
}

/** Atomic: concurrent failures cannot skip the lock. */
async function registerFailure(deps: AuthDeps, adminId: string, now: Date) {
  const lockedUntil = new Date(now.getTime() + LOCKOUT_MS);
  await deps.db.$executeRaw`
    UPDATE "admin_user" SET
      "failed_login_count" = CASE WHEN "failed_login_count" + 1 >= ${LOCKOUT_THRESHOLD} THEN 0 ELSE "failed_login_count" + 1 END,
      "locked_until" = CASE WHEN "failed_login_count" + 1 >= ${LOCKOUT_THRESHOLD} THEN ${lockedUntil} ELSE "locked_until" END,
      "updated_at" = ${now}
    WHERE "id" = ${adminId}::uuid`;
}

const isLocked = (lockedUntil: Date | null, now: Date) =>
  lockedUntil !== null && lockedUntil > now;

export async function startSignIn(
  deps: AuthDeps,
  input: { email: string; password: string },
): Promise<{ challenge: string; expiresAt: Date }> {
  const now = deps.now();
  const admin = await deps.db.adminUser.findUnique({
    where: { email: input.email },
  });
  if (!admin || !admin.isActive) {
    await verifyAgainstDummy(input.password, deps.argon2);
    throw failed(deps, "unknown_or_inactive");
  }
  if (isLocked(admin.lockedUntil, now)) {
    await verifyAgainstDummy(input.password, deps.argon2);
    throw failed(deps, "locked", admin.id);
  }
  if (!(await verifyPassword(input.password, admin.passwordHash))) {
    await registerFailure(deps, admin.id, now);
    throw failed(deps, "password", admin.id);
  }
  return issueChallenge(deps.config.csrfSecret, admin, now);
}

export type SecondFactor =
  | { readonly code: string; readonly recoveryCode?: undefined }
  | { readonly recoveryCode: string; readonly code?: undefined };

export async function completeSignIn(
  deps: AuthDeps,
  input: { challenge: string } & SecondFactor,
  meta: { ip: string | undefined; userAgent: string | undefined },
): Promise<{ token: string; context: AdminContext }> {
  const now = deps.now();
  const id = challengeSubjectId(input.challenge, now);
  const admin = id
    ? await deps.db.adminUser.findUnique({ where: { id } })
    : null;
  if (
    !admin ||
    !admin.isActive ||
    isLocked(admin.lockedUntil, now) ||
    !verifyChallenge(deps.config.csrfSecret, input.challenge, admin, now)
  ) {
    throw failed(deps, "challenge", admin?.id);
  }

  let usedRecoveryCode = false;
  if (input.code !== undefined) {
    if (
      !admin.mfaSecretEncrypted ||
      admin.mfaKeyVersion !== deps.config.mfaKeyVersion
    ) {
      deps.logger.error(
        { event: "admin.mfa_key_unavailable", adminId: admin.id },
        "2FA secret cannot be decrypted with the current key",
      );
      throw failed(deps, "code", admin.id);
    }
    const secret = decryptSecret(
      deps.config.mfaEncryptionKey,
      admin.mfaSecretEncrypted,
    );
    const step = verifyTotp(secret, input.code, now, admin.mfaLastUsedStep);
    // Claim the step atomically, so two requests cannot both use one code.
    const claimed =
      step === null
        ? 0
        : await deps.db.$executeRaw`
          UPDATE "admin_user" SET "mfa_last_used_step" = ${step}
          WHERE "id" = ${admin.id}::uuid
            AND ("mfa_last_used_step" IS NULL OR "mfa_last_used_step" < ${step})`;
    if (claimed !== 1) {
      await registerFailure(deps, admin.id, now);
      throw failed(deps, "code", admin.id);
    }
  } else {
    const used = await deps.db.adminRecoveryCode.updateMany({
      where: {
        adminUserId: admin.id,
        codeHash: sha256(normaliseRecoveryCode(input.recoveryCode)),
        usedAt: null,
      },
      data: { usedAt: now },
    });
    if (used.count !== 1) {
      await registerFailure(deps, admin.id, now);
      throw failed(deps, "code", admin.id);
    }
    usedRecoveryCode = true;
  }

  const ip = ipHash(deps.config.ipHashKey, meta.ip);
  const session = await deps.db.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: admin.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
    });
    await recordAudit(tx, deps.config.ipHashKey, {
      actorAdminId: admin.id,
      action: "admin.sign_in",
      entityType: "admin_user",
      entityId: admin.id,
      after: { method: usedRecoveryCode ? "recovery_code" : "totp" },
      ip: meta.ip,
    });
    return createSession(tx, admin.id, now, {
      ipHash: ip,
      userAgent: meta.userAgent ?? null,
    });
  });
  return {
    token: session.token,
    context: {
      sessionId: session.sessionId,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    },
  };
}
