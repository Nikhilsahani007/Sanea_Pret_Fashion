// Small cryptographic helpers for admin auth: 2FA secret encryption (D-065),
// random tokens stored only as SHA-256 hashes, recovery codes (D-071) and
// keyed IP hashes (D-073).
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
} from "node:crypto";

const AAD = Buffer.from("sanea-admin-mfa-v1");

/** Prisma stores bytes as `Uint8Array<ArrayBuffer>`; copy a Buffer into one. */
export type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (buf: Buffer): Bytes => new Uint8Array(buf);

/** AES-256-GCM. Output: 12-byte IV, 16-byte tag, ciphertext. */
export function encryptSecret(key: Buffer, plaintext: Buffer): Bytes {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(AAD);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return bytes(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

/** Throws if the data was altered or the key is wrong. */
export function decryptSecret(key: Buffer, box: Uint8Array): Buffer {
  const data = Buffer.from(box);
  const decipher = createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
  decipher.setAAD(AAD);
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
}

export function sha256(value: string): Bytes {
  return bytes(createHash("sha256").update(value).digest());
}

/** 256-bit random token for cookies and links; store only `hash`. */
export function newToken(): { token: string; hash: Bytes } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256(token) };
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** `XXXXX-XXXXX`, 50 bits each. Use `normaliseRecoveryCode` before hashing. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from(
      { length: 10 },
      () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
    ).join("");
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}

export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

export function ipHash(key: string, ip: string | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", key).update(ip).digest("hex");
}
