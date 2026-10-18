// First Owner (D-069): `npm run admin:create-owner -- --email owner@example.com`
// Needs DATABASE_URL and ADMIN_ORIGIN. Refuses if an Owner already exists or
// an Owner invite is still open. Prints a one-time 48-hour setup link.
import { parseArgs } from "node:util";

import { AdminRole } from "@sanea/shared";
import { pino } from "pino";
import { z } from "zod";

import { loadConfig } from "../../platform/config.ts";
import { createDb } from "../../platform/db.ts";
import type { AuthDeps } from "./deps.ts";
import { createInvite } from "./invites.ts";
import { DEFAULT_ARGON2 } from "./password.ts";

export class OwnerExists extends Error {}

/** Returns the setup link; throws OwnerExists if one exists or is pending. */
export async function createFirstOwnerInvite(
  deps: AuthDeps,
  email: string,
): Promise<{ url: string; expiresAt: Date }> {
  return deps.db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('sanea:first-owner'))`;
    const owners = await tx.adminUser.count({
      where: { role: AdminRole.OWNER },
    });
    const pending = await tx.adminInvite.count({
      where: {
        role: AdminRole.OWNER,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: deps.now() },
      },
    });
    if (owners > 0 || pending > 0)
      throw new OwnerExists(
        "An Owner already exists or is invited; use staff management.",
      );
    return createInvite(tx, deps, {
      email,
      role: AdminRole.OWNER,
      invitedByAdminId: null,
    });
  });
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { email: { type: "string" } } });
  const email = z.email().safeParse(values.email?.trim().toLowerCase());
  if (!email.success) {
    process.stderr.write(
      "Usage: npm run admin:create-owner -- --email owner@example.com\n",
    );
    process.exit(1);
  }
  // Full config validation: refuses to run with missing or invalid settings.
  let config;
  try {
    config = loadConfig(process.env);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
  const db = createDb(config.databaseUrl);
  const deps: AuthDeps = {
    db,
    config,
    logger: pino({ level: "silent" }),
    now: () => new Date(),
    argon2: DEFAULT_ARGON2,
  };
  try {
    const invite = await createFirstOwnerInvite(deps, email.data);
    process.stdout.write(
      `Owner setup link (single use, expires ${invite.expiresAt.toISOString()}).\n` +
        `Treat it like a password; do not paste it into chat or tickets:\n${invite.url}\n`,
    );
  } catch (error) {
    process.stderr.write(
      `${error instanceof OwnerExists ? error.message : "Failed to create the Owner invite."}\n`,
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
