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
 * บันทึก Audit Log แบบ Immutable ภายใต้ Transaction เดียวกันกับคำสั่งงานหลัก
 * เพื่อรับประกันว่าหากคำสั่งงานหลักล้มเหลว (Rollback) บันทึก Audit จะไม่ค้างหลงเหลือ
 * และหากคำสั่งงานสำเร็จ บันทึกการเปลี่ยนแปลง (previousState / newState) จะถูกบันทึกไว้อย่างสมบูรณ์
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
