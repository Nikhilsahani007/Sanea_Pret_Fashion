// Audit entries (security-design.md §9, D-073). Callers pass only non-secret,
// non-personal fields: roles, flags and IDs, never emails, names, passwords,
// codes or tokens. The IP address is stored as a keyed hash.
import type { Prisma } from "../../generated/prisma/client.ts";
import { ipHash } from "../auth/secrets.ts";

type Tx = Prisma.TransactionClient;

export type AuditEntry = {
  readonly actorAdminId: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly before?: Prisma.InputJsonValue;
  readonly after?: Prisma.InputJsonValue;
  readonly ip?: string | undefined;
};

export async function recordAudit(
  tx: Tx,
  ipHashKey: string,
  entry: AuditEntry,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorAdminId: entry.actorAdminId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(entry.before === undefined ? {} : { before: entry.before }),
      ...(entry.after === undefined ? {} : { after: entry.after }),
      ipHash: ipHash(ipHashKey, entry.ip),
    },
  });
}
