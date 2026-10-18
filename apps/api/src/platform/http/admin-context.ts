import type { AdminRole } from "@sanea/shared";
import type { Response } from "express";

/** The signed-in admin for this request, set by the admin session middleware. */
export type AdminIdentity = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: AdminRole;
};

export type AdminContext = {
  readonly sessionId: string;
  readonly admin: AdminIdentity;
};

export function setAdminContext(res: Response, context: AdminContext): void {
  res.locals.adminContext = context;
}

export function adminContext(res: Response): AdminContext | undefined {
  return res.locals.adminContext as AdminContext | undefined;
}
