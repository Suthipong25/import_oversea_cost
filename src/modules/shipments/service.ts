import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, withUserContext } from '@/lib/db';
import {
  costComparisons,
  quotations,
  rateRecords,
  sellingRates,
  shipmentContainers,
  shipments,
} from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { canViewAllShipments, hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import type { CreateShipmentInput } from './schema';
import { getShipmentByIdRepo, listShipmentsRepo } from './repo';

function generateShipmentRef(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `SHP-${y}${m}-${suffix}`;
}

export async function listShipmentsForUser(user: AuthUser) {
  if (!hasPermission(user.role, 'shipments:read')) {
    throw new Error('FORBIDDEN');
  }
  const assignedFilter = canViewAllShipments(user.role) ? undefined : user.id;
  return listShipmentsRepo(assignedFilter);
}

export async function getShipmentDetailForUser(user: AuthUser, shipmentId: string) {
  if (!hasPermission(user.role, 'shipments:read')) {
    throw new Error('FORBIDDEN');
  }
  const detail = await getShipmentByIdRepo(shipmentId);
  if (!detail) return null;
  if (!canViewAllShipments(user.role) && detail.assignedUserId !== user.id) {
    throw new Error('FORBIDDEN');
  }
  return detail;
}

export async function createShipmentForUser(
  user: AuthUser,
  input: CreateShipmentInput,
  ipAddress?: string | null
) {
  if (!hasPermission(user.role, 'shipments:create')) {
    throw new Error('FORBIDDEN');
  }

  return withUserContext(user, async (tx) => {
    const shipmentRef = generateShipmentRef();

    const [created] = await tx
      .insert(shipments)
      .values({
        shipmentRef,
        customerName: input.customerName,
        contactPerson: input.contactPerson || null,
        contactPhone: input.contactPhone || null,
        contactEmail: input.contactEmail || null,
        polPortCode: input.polPortCode,
        podPortCode: input.podPortCode,
        incoterm: input.incoterm || null,
        commodityDescription: input.commodityDescription || null,
        targetEtd: input.targetEtd || null,
        assignedUserId: user.id,
      })
      .returning();

    if (!created) {
      throw new Error('Failed to create shipment');
    }

    await tx.insert(shipmentContainers).values(
      input.containers.map((c) => ({
        shipmentId: created.id,
        containerType: c.containerType.toUpperCase(),
        quantity: c.quantity,
        weightKgPerCntr: c.weightKgPerCntr ? String(c.weightKgPerCntr) : null,
      }))
    );

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: created.id,
      action: 'CREATE',
      actorId: user.id,
      newState: {
        shipmentRef: created.shipmentRef,
        customerName: created.customerName,
        polPortCode: created.polPortCode,
        podPortCode: created.podPortCode,
        containers: input.containers,
      },
      ipAddress: ipAddress ?? null,
    });

    return created;
  });
}

/**
 * ลบงานเปรียบเทียบ (Shipment) พร้อมข้อมูลลูกทั้งหมดอย่างปลอดภัยใน Transaction เดียว
 *
 * กฎสิทธิ์:
 * - เฉพาะ Admin / Sales Manager (`shipments:edit_all`) เท่านั้นที่ลบงานซึ่งส่งใบเสนอราคาแล้ว (`Sent`) ได้
 * ลำดับการลบ (สำคัญมาก — ป้องกัน Foreign Key Violation):
 *   quotations -> selling_rates -> cost_comparisons -> rate_records -> shipments
 *   เพราะบางคอลัมน์ FK (`selling_rate_id`, `selected_rate_record_id`, `source_document_id`) ไม่ได้ตั้ง ON DELETE CASCADE
 */
export async function deleteShipmentForUser(user: AuthUser, shipmentId: string) {
  if (!hasPermission(user.role, 'shipments:create')) {
    throw new Error('FORBIDDEN');
  }

  const [shipment] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.id, shipmentId))
    .limit(1);

  if (!shipment) throw new Error('NOT_FOUND');
  if (!canViewAllShipments(user.role) && shipment.assignedUserId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  // Only Admin / Sales Manager (shipments:edit_all) can delete a shipment that already has a Sent quotation
  if (!hasPermission(user.role, 'shipments:edit_all')) {
    const sentQuotes = await db
      .select({ id: quotations.id })
      .from(quotations)
      .where(and(eq(quotations.shipmentId, shipmentId), eq(quotations.status, 'Sent')))
      .limit(1);

    if (sentQuotes.length > 0) {
      throw new Error('HAS_SENT_QUOTATION');
    }
  }

  return withUserContext(user, async (tx) => {
    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: shipment.id,
      action: 'DELETE_SHIPMENT',
      actorId: user.id,
      previousState: {
        shipmentRef: shipment.shipmentRef,
        customerName: shipment.customerName,
        polPortCode: shipment.polPortCode,
        podPortCode: shipment.podPortCode,
      },
      newState: { deleted: true },
    });

    // Delete child records in strict FK dependency order before deleting the shipment
    await tx.delete(quotations).where(eq(quotations.shipmentId, shipmentId));
    await tx.delete(sellingRates).where(eq(sellingRates.shipmentId, shipmentId));
    await tx.delete(costComparisons).where(eq(costComparisons.shipmentId, shipmentId));
    await tx.delete(rateRecords).where(eq(rateRecords.shipmentId, shipmentId));
    await tx.delete(shipments).where(eq(shipments.id, shipmentId));
    return { deleted: true };
  });
}
