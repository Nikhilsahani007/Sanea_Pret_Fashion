import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { AdminRole } from "@sanea/shared";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_ARGON2,
  hashPassword,
  passwordProblem,
  verifyPassword,
} from "./password.ts";
import { PERMISSIONS, PERMISSION_LABELS, can } from "./permissions.ts";
import {
  decryptSecret,
  encryptSecret,
  ipHash,
  newRecoveryCodes,
  newToken,
  normaliseRecoveryCode,
  sha256,
} from "./secrets.ts";
import {
  base32Encode,
  hotp,
  otpauthUri,
  totp,
  totpStep,
  verifyTotp,
} from "./totp.ts";

const FAST = { memory: 1024, passes: 1, parallelism: 1 };

describe("TOTP (RFC 6238 appendix B, SHA-1)", () => {
  const secret = Buffer.from("12345678901234567890");
  it.each([
    [59, "94287082"],
    [1_111_111_109, "07081804"],
    [1_111_111_111, "14050471"],
    [1_234_567_890, "89005924"],
    [2_000_000_000, "69279037"],
    [20_000_000_000, "65353130"],
  ])("T=%i gives %s", (seconds, expected) => {
    expect(hotp(secret, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it("matches RFC 4226 appendix D HOTP values", () => {
    expect([0, 1, 2, 9].map((c) => hotp(secret, c))).toEqual([
      "755224",
      "287082",
      "359152",
      "520489",
    ]);
  });

  it("encodes base32 per RFC 4648", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Encode(Buffer.from("12345678901234567890"))).toBe(
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
    );
  });

  it("accepts the current and adjacent steps, then refuses reuse", () => {
    const now = new Date("2026-10-19T10:00:15Z");
    const step = totpStep(now);
    expect(verifyTotp(secret, totp(secret, now), now, null)).toBe(step);
    expect(verifyTotp(secret, hotp(secret, step - 1), now, null)).toBe(
      step - 1,
    );
    expect(verifyTotp(secret, hotp(secret, step + 1), now, null)).toBe(
      step + 1,
    );
    expect(verifyTotp(secret, hotp(secret, step - 2), now, null)).toBeNull();
    expect(verifyTotp(secret, hotp(secret, step + 2), now, null)).toBeNull();
    // Reuse: the same step, or an earlier one, is refused.
    expect(verifyTotp(secret, totp(secret, now), now, step)).toBeNull();
    expect(
      verifyTotp(secret, hotp(secret, step - 1), now, step - 1),
    ).toBeNull();
  });

  it.each(["", "12345", "1234567", "abcdef", "12 456"])(
    "rejects malformed code %j",
    (code) => {
      expect(verifyTotp(secret, code, new Date(), null)).toBeNull();
    },
  );

  it("builds an otpauth URI with the issuer and parameters", () => {
    const uri = new URL(otpauthUri(secret, "owner@example.test"));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.searchParams.get("secret")).toBe(base32Encode(secret));
    expect(uri.searchParams.get("digits")).toBe("6");
    expect(uri.searchParams.get("period")).toBe("30");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe(
      "/Sanéa Pret Admin:owner@example.test",
    );
  });
});

describe("passwords (Argon2id, D-062)", () => {
  it("defaults to 64 MiB, 3 passes, parallelism 1", () => {
    expect(DEFAULT_ARGON2).toEqual({
      memory: 65_536,
      passes: 3,
      parallelism: 1,
    });
  });

  it("hashes with the default parameters and verifies", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
    expect(await verifyPassword("correct horse battery stapl", hash)).toBe(
      false,
    );
  });

  it("uses a fresh salt each time and reads parameters from the hash", async () => {
    const a = await hashPassword("same password here", FAST);
    const b = await hashPassword("same password here", FAST);
    expect(a).not.toBe(b);
    expect(a).toContain("m=1024,t=1,p=1");
    expect(await verifyPassword("same password here", a)).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "plain")).toBe(false);
    expect(await verifyPassword("x", "$argon2i$v=19$m=1,t=1,p=1$a$b")).toBe(
      false,
    );
  });

  it.each([
    ["eleven char", "TOO_SHORT"],
    ["ab".repeat(65), "TOO_LONG"],
    ["a long unusual passphrase", null],
    ["no rules like CAPS required", null],
  ])("passwordProblem(%j) is %s", (password, problem) => {
    expect(passwordProblem(password)).toBe(problem);
  });

  it("rejects entries from the bundled list, in any letter case", () => {
    const entries = readFileSync(
      new URL("data/common-passwords.txt", import.meta.url),
      "utf8",
    )
      .split("\n")
      .filter(Boolean);
    for (const entry of [entries[0]!, entries.at(-1)!]) {
      expect(passwordProblem(entry)).toBe("TOO_COMMON");
      expect(passwordProblem(entry.toUpperCase())).toBe("TOO_COMMON");
    }
  });

  it("counts characters, not bytes", () => {
    expect(passwordProblem("éééééééééééé")).toBeNull(); // 12 chars, 24 bytes
  });

  it("bundled list has only 12+ character, lower-case entries", () => {
    const lines = readFileSync(
      new URL("data/common-passwords.txt", import.meta.url),
      "utf8",
    )
      .split("\n")
      .filter(Boolean);
    expect(lines.length).toBeGreaterThan(400);
    for (const l of lines) {
      expect(l.length).toBeGreaterThanOrEqual(12);
      expect(l).toBe(l.toLowerCase());
    }
  });
});

describe("secrets (D-065, D-071, D-073)", () => {
  const key = randomBytes(32);

  it("encrypts and decrypts a 2FA secret", () => {
    const secret = randomBytes(20);
    const box = encryptSecret(key, secret);
    expect(box.length).toBe(12 + 16 + 20);
    expect(decryptSecret(key, box)).toEqual(secret);
    expect(encryptSecret(key, secret)).not.toEqual(box); // fresh IV
  });

  it("refuses tampered data and the wrong key", () => {
    const box = encryptSecret(key, randomBytes(20));
    const tampered = Buffer.from(box);
    tampered[tampered.length - 1]! ^= 1;
    expect(() => decryptSecret(key, tampered)).toThrow();
    expect(() => decryptSecret(randomBytes(32), box)).toThrow();
  });

  it("issues 256-bit tokens with their SHA-256 hash", () => {
    const { token, hash } = newToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hash).toEqual(sha256(token));
    expect(hash).toHaveLength(32);
  });

  it("issues ten distinct recovery codes, normalised for lookup", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes)
      expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(normaliseRecoveryCode(" abcde-fghjk ")).toBe("ABCDEFGHJK");
  });

  it("hashes IP addresses with a key", () => {
    const a = ipHash("k".repeat(32), "203.0.113.7");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(ipHash("j".repeat(32), "203.0.113.7")).not.toBe(a);
    expect(ipHash("k".repeat(32), undefined)).toBeNull();
  });
});

describe("permission matrix (D-075)", () => {
  // Parse security-design.md §4 and compare it with PERMISSIONS.
  const doc = readFileSync(
    new URL("../../../../../docs/security-design.md", import.meta.url),
    "utf8",
  );
  const section = doc.slice(
    doc.indexOf("## 4. Authorisation"),
    doc.indexOf("## 5."),
  );
  const rows = section
    .split("\n")
    .filter((l) => l.startsWith("| ") && !l.startsWith("| Permission"))
    .map((l) =>
      l
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim()),
    );
  const roles = [
    AdminRole.OWNER,
    AdminRole.MANAGER,
    AdminRole.CATALOGUE_EDITOR,
    AdminRole.FULFILMENT,
  ];

  it("has one entry per row of the documented table", () => {
    expect(rows).toHaveLength(Object.keys(PERMISSIONS).length);
    expect(rows.map((r) => r[0]).sort()).toEqual(
      Object.values(PERMISSION_LABELS).sort(),
    );
  });

  it("grants exactly the documented roles", () => {
    for (const [label, ...marks] of rows) {
      const permission = (
        Object.keys(PERMISSION_LABELS) as (keyof typeof PERMISSIONS)[]
      ).find((p) => PERMISSION_LABELS[p] === label)!;
      roles.forEach((role, i) => {
        expect(can(role, permission), `${label} / ${role}`).toBe(
          marks[i] === "✔",
        );
      });
    }
  });
});
