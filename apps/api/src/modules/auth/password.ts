// Admin passwords (security-design.md §2, D-062, D-063): Argon2id through
// Node's built-in crypto, stored as a PHC string; minimum 12 characters, no
// composition rules, and not on the common-password list.
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";

const argon2Async = promisify(argon2);

/** Memory in KiB. Defaults: 64 MiB, 3 passes, parallelism 1. */
export type Argon2Params = {
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
};

export const DEFAULT_ARGON2: Argon2Params = {
  memory: 65_536,
  passes: 3,
  parallelism: 1,
};

export const PASSWORD_MIN = 12;
/** Bounds the hashing work an attacker can request. */
export const PASSWORD_MAX = 128;

const TAG_LENGTH = 32;
const PHC =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

const b64 = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

async function derive(
  password: string,
  salt: Buffer,
  params: Argon2Params,
): Promise<Buffer> {
  return argon2Async("argon2id", {
    message: password,
    nonce: salt,
    memory: params.memory,
    passes: params.passes,
    parallelism: params.parallelism,
    tagLength: TAG_LENGTH,
  });
}

export async function hashPassword(
  password: string,
  params: Argon2Params = DEFAULT_ARGON2,
): Promise<string> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, params);
  return `$argon2id$v=19$m=${params.memory},t=${params.passes},p=${params.parallelism}$${b64(salt)}$${b64(hash)}`;
}

/** Verifies against the parameters stored in the hash itself. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const match = PHC.exec(stored);
  if (!match) return false;
  const [, m, t, p, salt = "", expected = ""] = match;
  const want = Buffer.from(expected, "base64");
  const got = await derive(password, Buffer.from(salt, "base64"), {
    memory: Number(m),
    passes: Number(t),
    parallelism: Number(p),
  });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Spends the same time as a real check when the account does not exist. */
let dummy: Promise<string> | undefined;
export async function verifyAgainstDummy(
  password: string,
  params: Argon2Params,
): Promise<false> {
  dummy ??= hashPassword(randomBytes(16).toString("hex"), params);
  await verifyPassword(password, await dummy);
  return false;
}

const COMMON = new Set(
  readFileSync(new URL("data/common-passwords.txt", import.meta.url), "utf8")
    .split("\n")
    .filter(Boolean),
);

export type PasswordProblem = "TOO_SHORT" | "TOO_LONG" | "TOO_COMMON";

/** Length counts characters (code points), not bytes. */
export function passwordProblem(password: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return "TOO_SHORT";
  if (length > PASSWORD_MAX) return "TOO_LONG";
  if (COMMON.has(password.toLowerCase())) return "TOO_COMMON";
  return null;
}
