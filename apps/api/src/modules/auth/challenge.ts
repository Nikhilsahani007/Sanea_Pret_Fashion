// The 2FA challenge between the password and code steps (D-066): a signed,
// 5-minute, single-purpose token, not a session. The signature covers the
// admin's password hash, last sign-in and last TOTP step, so it stops working
// after a password change or a successful sign-in.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const FORMAT =
  /^([0-9a-f-]{36})\.([0-9]{1,15})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

type ChallengeSubject = {
  readonly id: string;
  readonly passwordHash: string;
  readonly lastLoginAt: Date | null;
  readonly mfaLastUsedStep: number | null;
};

function sign(secret: string, payload: string, subject: ChallengeSubject) {
  const key = createHmac("sha256", secret)
    .update("admin-mfa-challenge-v1")
    .digest();
  return createHmac("sha256", key)
    .update(payload)
    .update("|")
    .update(subject.passwordHash)
    .update("|")
    .update(subject.lastLoginAt?.toISOString() ?? "")
    .update("|")
    .update(String(subject.mfaLastUsedStep ?? ""))
    .digest("base64url");
}

export function issueChallenge(
  secret: string,
  subject: ChallengeSubject,
  now: Date,
): { challenge: string; expiresAt: Date } {
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);
  const nonce = randomBytes(16).toString("base64url");
  const payload = `${subject.id}.${expiresAt.getTime()}.${nonce}`;
  return {
    challenge: `${payload}.${sign(secret, payload, subject)}`,
    expiresAt,
  };
}

/** The admin ID a well-formed, unexpired challenge names (not yet verified). */
export function challengeSubjectId(
  challenge: string,
  now: Date,
): string | null {
  const match = FORMAT.exec(challenge);
  if (!match || Number(match[2]) <= now.getTime()) return null;
  return match[1] ?? null;
}

export function verifyChallenge(
  secret: string,
  challenge: string,
  subject: ChallengeSubject,
  now: Date,
): boolean {
  const match = FORMAT.exec(challenge);
  if (!match || match[1] !== subject.id || Number(match[2]) <= now.getTime())
    return false;
  const payload = `${match[1]}.${match[2]}.${match[3]}`;
  const expected = Buffer.from(sign(secret, payload, subject));
  const given = Buffer.from(match[4] ?? "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
