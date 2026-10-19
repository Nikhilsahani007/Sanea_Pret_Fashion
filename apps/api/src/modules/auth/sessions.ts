// Admin sessions (security-design.md §2, D-067): random 256-bit token in a
// `__Host-` cookie, only its SHA-256 hash in the database, 8-hour absolute and
// 30-minute idle limits, a new session at every sign-in.
import type { CookieOptions } from "express";

import type { Prisma } from "../../generated/prisma/client.ts";
import type { AdminContext } from "../../platform/http/admin-context.ts";
import type { Db } from "../../platform/db.ts";
import { newToken, sha256 } from "./secrets.ts";

export const ADMIN_SESSION_COOKIE = "__Host-sp_admin";
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 30 * 60 * 1000;
/** `last_seen_at` is written at most once a minute. */
const TOUCH_INTERVAL_MS = 60 * 1000;

export const ADMIN_SESSION_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: SESSION_ABSOLUTE_MS,
};

/** Cookie options for clearing: same attributes, no lifetime. */
export const CLEAR_SESSION_COOKIE: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
};

/** The client or a transaction: anything with the admin_session table. */
type SessionStore = Pick<Prisma.TransactionClient, "adminSession">;

export async function createSession(
  db: SessionStore,
  adminUserId: string,
  now: Date,
  meta: { ipHash: string | null; userAgent: string | null },
): Promise<{ token: string; sessionId: string }> {
  const { token, hash } = newToken();
  const session = await db.adminSession.create({
    data: {
      adminUserId,
      tokenHash: hash,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_MS),
      ipHash: meta.ipHash,
      userAgent: meta.userAgent?.slice(0, 512) ?? null,
    },
  });
  return { token, sessionId: session.id };
}

/**
 * Returns the admin for a session token, or null. An expired, idle or
 * deactivated session is deleted.
 */
export async function loadSession(
  db: Db,
  token: string,
  now: Date,
): Promise<AdminContext | null> {
  const session = await db.adminSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { adminUser: true },
  });
  if (!session) return null;
  const idle = now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_MS;
  if (session.expiresAt <= now || idle || !session.adminUser.isActive) {
    await db.adminSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
    await db.adminSession.updateMany({
      where: { id: session.id },
      data: { lastSeenAt: now },
    });
  }
  const { id, email, name, role } = session.adminUser;
  return { sessionId: session.id, admin: { id, email, name, role } };
}

export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.adminSession.deleteMany({ where: { id: sessionId } });
}
