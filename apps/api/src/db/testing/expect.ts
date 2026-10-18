// Assertions that PostgreSQL itself rejected a statement, with the expected
// SQLSTATE and constraint, not an application-level error.
import { expect } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.ts";
import { rejectionOf } from "./database.ts";

export const SQLSTATE = {
  CHECK: "23514",
  UNIQUE: "23505",
  FOREIGN_KEY: "23503",
  // ON DELETE RESTRICT reports restrict_violation, not foreign_key_violation.
  RESTRICT: "23001",
  NOT_NULL: "23502",
  RAISE: "P0001",
  OUT_OF_RANGE: "22003",
  INVALID_ENUM: "22P02",
} as const;

/** Expects a CHECK violation of the named constraint. */
export async function expectCheck(
  db: PrismaClient,
  sql: string,
  constraint: string,
): Promise<void> {
  const result = await rejectionOf(db, sql);
  expect(result, sql).not.toBe("accepted");
  if (result === "accepted") return;
  expect(result.code, result.message).toBe(SQLSTATE.CHECK);
  expect(result.message).toContain(`"${constraint}"`);
}

/** Expects the given SQLSTATE, and optionally a message fragment. */
export async function expectCode(
  db: PrismaClient,
  sql: string,
  code: string,
  fragment?: string,
): Promise<void> {
  const result = await rejectionOf(db, sql);
  expect(result, sql).not.toBe("accepted");
  if (result === "accepted") return;
  expect(result.code, result.message).toBe(code);
  if (fragment) expect(result.message).toContain(fragment);
}

/** Expects the statement to succeed (inside a transaction that commits). */
export async function expectAccepted(
  db: PrismaClient,
  sql: string,
): Promise<void> {
  expect(await rejectionOf(db, sql), sql).toBe("accepted");
}
