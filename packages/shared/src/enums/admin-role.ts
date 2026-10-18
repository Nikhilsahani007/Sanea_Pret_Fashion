import { z } from "zod";

import { requiredOr } from "../validation/schema-helpers.ts";

/** Admin roles (`security-design.md` §4). All four require 2FA (D-032). */
export const AdminRole = {
  OWNER: "OWNER",
  MANAGER: "MANAGER",
  CATALOGUE_EDITOR: "CATALOGUE_EDITOR",
  FULFILMENT: "FULFILMENT",
} as const;

export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

export const adminRoleSchema = z.enum(AdminRole, {
  error: requiredOr("INVALID_OPTION"),
});
