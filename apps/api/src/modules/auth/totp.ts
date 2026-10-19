// TOTP (RFC 6238 over RFC 4226 HOTP): HMAC-SHA-1, 6 digits, 30-second steps,
// one step of clock tolerance each way. A step at or before the last accepted
// one is refused, so a code cannot be reused (D-064).
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW = 1;
export const TOTP_ISSUER = "Sanéa Pret Admin";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** 160-bit secret, the RFC 4226 recommendation. */
export function generateTotpSecret(): Buffer {
  return randomBytes(20);
}

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function hotp(
  secret: Buffer,
  counter: number,
  digits: number = TOTP_DIGITS,
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", secret).update(message).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const binary = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(binary).padStart(digits, "0");
}

export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

export function totp(secret: Buffer, now: Date): string {
  return hotp(secret, totpStep(now));
}

/**
 * Returns the matched step, or null. Only steps after `lastUsedStep` count,
 * so the same code (or an earlier one) is never accepted twice.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  now: Date,
  lastUsedStep: number | null,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = totpStep(now);
  let matched: number | null = null;
  // Check every candidate so timing does not reveal which step matched.
  for (
    let step = current - TOTP_WINDOW;
    step <= current + TOTP_WINDOW;
    step++
  ) {
    const expected = Buffer.from(hotp(secret, step));
    const ok = timingSafeEqual(expected, Buffer.from(code));
    if (
      ok &&
      (lastUsedStep === null || step > lastUsedStep) &&
      matched === null
    )
      matched = step;
  }
  return matched;
}

/** `otpauth://` URI for authenticator apps. */
export function otpauthUri(secret: Buffer, account: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
  const params = new URLSearchParams({
    secret: base32Encode(secret),
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
