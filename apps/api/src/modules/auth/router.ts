// /api/v1/admin/auth: sign-in, 2FA step, sign-out, current admin, and the
// invite and reset links. Responses carry `Cache-Control: no-store`.
import { Router, type RequestHandler } from "express";
import { z } from "zod";

import { adminContext } from "../../platform/http/admin-context.ts";
import { sessionCsrfToken } from "../../platform/http/csrf.ts";
import { createRateLimiter } from "../../platform/http/rate-limit.ts";
import { validate } from "../../platform/http/validate.ts";
import type { AuthDeps } from "./deps.ts";
import { acceptInvite, inspectInvite, startEnrolment } from "./invites.ts";
import { requireAdmin } from "./middleware.ts";
import { PASSWORD_MAX } from "./password.ts";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_COOKIE_OPTIONS,
  CLEAR_SESSION_COOKIE,
  deleteSession,
} from "./sessions.ts";
import { completeSignIn, startSignIn } from "./sign-in.ts";

export const AUTH_PREFIX = "/api/v1/admin/auth";

export type RateLimit = { readonly windowMs: number; readonly limit: number };

export type AuthLimits = {
  readonly signIn: RateLimit;
  readonly invite: RateLimit;
};

/** D-074. Tests may pass higher limits; the defaults are what production uses. */
export const DEFAULT_AUTH_LIMITS: AuthLimits = {
  signIn: { windowMs: 15 * 60 * 1000, limit: 10 },
  invite: { windowMs: 60 * 60 * 1000, limit: 10 },
};

const email = z.string().trim().toLowerCase().max(254).pipe(z.email());
const secretText = (max: number) => z.string().min(1).max(max);

const signInBody = z.object({ email, password: secretText(1024) }).strict();
const mfaBody = z.union([
  z
    .object({ challenge: secretText(200), code: z.string().regex(/^\d{6}$/) })
    .strict(),
  z
    .object({ challenge: secretText(200), recoveryCode: secretText(32) })
    .strict(),
]);
const tokenBody = z.object({ token: secretText(100) }).strict();
const acceptBody = z
  .object({
    token: secretText(100),
    name: z.string().trim().min(1).max(120).optional(),
    password: secretText(PASSWORD_MAX * 4),
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

const input = <T>(res: { locals: Record<string, unknown> }) =>
  (res.locals.input as { body: T }).body;

const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
};

/** Wraps an async handler so rejections reach the error handler. */
const handle =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

export function authRouter(
  deps: AuthDeps,
  limits: AuthLimits = DEFAULT_AUTH_LIMITS,
): Router {
  const router = Router();
  const signInLimit = createRateLimiter(limits.signIn);
  const inviteLimit = createRateLimiter(limits.invite);
  const csrfFor = (sessionId: string) =>
    sessionCsrfToken(deps.config.csrfSecret, sessionId);

  router.use(AUTH_PREFIX, noStore);

  router.post(
    `${AUTH_PREFIX}/sign-in`,
    signInLimit,
    validate({ body: signInBody }),
    handle(async (_req, res) => {
      const result = await startSignIn(
        deps,
        input<z.infer<typeof signInBody>>(res),
      );
      res.json({ challenge: result.challenge, expiresAt: result.expiresAt });
    }),
  );

  router.post(
    `${AUTH_PREFIX}/mfa`,
    signInLimit,
    validate({ body: mfaBody }),
    handle(async (req, res) => {
      const body = input<z.infer<typeof mfaBody>>(res);
      // Rotation: any session this browser already had is ended (D-067).
      const previous = adminContext(res);
      const { token, context } = await completeSignIn(deps, body, {
        ip: req.ip,
        userAgent: req.get("user-agent"),
      });
      if (previous) await deleteSession(deps.db, previous.sessionId);
      res.cookie(ADMIN_SESSION_COOKIE, token, ADMIN_SESSION_COOKIE_OPTIONS);
      res.json({ admin: context.admin, csrfToken: csrfFor(context.sessionId) });
    }),
  );

  router.post(
    `${AUTH_PREFIX}/sign-out`,
    requireAdmin,
    handle(async (_req, res) => {
      await deleteSession(deps.db, adminContext(res)!.sessionId);
      res.clearCookie(ADMIN_SESSION_COOKIE, CLEAR_SESSION_COOKIE);
      res.status(204).end();
    }),
  );

  router.get(`${AUTH_PREFIX}/me`, requireAdmin, (_req, res) => {
    const context = adminContext(res)!;
    res.json({ admin: context.admin, csrfToken: csrfFor(context.sessionId) });
  });

  router.post(
    `${AUTH_PREFIX}/invites/inspect`,
    inviteLimit,
    validate({ body: tokenBody }),
    handle(async (_req, res) => {
      res.json(
        await inspectInvite(deps, input<z.infer<typeof tokenBody>>(res).token),
      );
    }),
  );

  router.post(
    `${AUTH_PREFIX}/invites/enrol`,
    inviteLimit,
    validate({ body: tokenBody }),
    handle(async (_req, res) => {
      res.json(
        await startEnrolment(deps, input<z.infer<typeof tokenBody>>(res).token),
      );
    }),
  );

  router.post(
    `${AUTH_PREFIX}/invites/accept`,
    inviteLimit,
    validate({ body: acceptBody }),
    handle(async (req, res) => {
      const result = await acceptInvite(
        deps,
        input<z.infer<typeof acceptBody>>(res),
        req.ip,
      );
      res.status(201).json(result);
    }),
  );

  return router;
}
