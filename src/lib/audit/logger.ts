import type { DbTransaction } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema';

export interface AuditEntry {
  entityType: string;
  entityId: string;
  action: string;
  actorId: string;
  previousState?: Record<string, unknown> | null;
  newState: Record<string, unknown>;
  reason?: string | null;
  ipAddress?: string | null;
}

/**
 * Writes an immutable audit log entry inside the caller's database transaction.
 */
export async function writeAuditLog(tx: DbTransaction, entry: AuditEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    actorId: entry.actorId,
    previousState: entry.previousState ?? null,
    newState: entry.newState,
    reason: entry.reason ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}
