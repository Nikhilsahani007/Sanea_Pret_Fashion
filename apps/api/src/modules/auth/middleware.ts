// Loads the admin session for admin paths, and guards routes by permission.
// The API is the authority on roles (security-design.md §4, D-075).
import type { RequestHandler } from "express";

import {
  adminContext,
  setAdminContext,
} from "../../platform/http/admin-context.ts";
import { AppError } from "../../platform/http/errors.ts";
import { isAdminPath } from "../../platform/http/origins.ts";
import type { AuthDeps } from "./deps.ts";
import { can, type Permission } from "./permissions.ts";
import {
  ADMIN_SESSION_COOKIE,
  CLEAR_SESSION_COOKIE,
  loadSession,
} from "./sessions.ts";

/** Runs before CSRF checks, so they can bind to the session (D-068). */
export function adminSession(deps: AuthDeps): RequestHandler {
  return async (req, res, next) => {
    if (!isAdminPath(req.path)) return next();
    const token: unknown = req.cookies?.[ADMIN_SESSION_COOKIE];
    if (typeof token !== "string" || token === "") return next();
    try {
      const context = await loadSession(deps.db, token, deps.now());
      if (context) setAdminContext(res, context);
      else res.clearCookie(ADMIN_SESSION_COOKIE, CLEAR_SESSION_COOKIE);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireAdmin: RequestHandler = (_req, res, next) => {
  if (!adminContext(res)) return next(new AppError("UNAUTHENTICATED"));
  next();
};

export function requirePermission(permission: Permission): RequestHandler {
  return (_req, res, next) => {
    const context = adminContext(res);
    if (!context) return next(new AppError("UNAUTHENTICATED"));
    if (!can(context.admin.role, permission))
      return next(new AppError("FORBIDDEN"));
    next();
  };
}
