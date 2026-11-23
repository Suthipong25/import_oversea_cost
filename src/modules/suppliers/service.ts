import { asc, eq, ilike } from 'drizzle-orm';
import { db, withUserContext } from '@/lib/db';
import { rateRecords, sourceDocuments, suppliers } from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import type { CreateSupplierInput } from './schema';

/**
 * ดึงรายชื่อ Supplier / Agent ทั้งหมดที่เปิดใช้งานอยู่ เรียงตามตัวอักษร
 */
export async function listSuppliers() {
  return db.select().from(suppliers).orderBy(asc(suppliers.name));
}

/**
 * บันทึกสร้าง Agent รายใหม่ พร้อมบันทึกประวัติใน Audit Log
 */
export async function createSupplierForUser(user: AuthUser, input: CreateSupplierInput) {
  if (!hasPermission(user.role, 'suppliers:manage')) {
    throw new Error('FORBIDDEN');
  }

  return withUserContext(user, async (tx) => {
    const [created] = await tx
      .insert(suppliers)
      .values({
        name: input.name,
        companyName: input.companyName,
        contactPerson: input.contactPerson || null,
        phone: input.phone || null,
        email: input.email || null,
        countryCode: input.countryCode,
        address: input.address || null,
        notes: input.notes || null,
      })
      .returning();

    if (!created) throw new Error('Failed to create agent');

    await writeAuditLog(tx, {
      entityType: 'supplier',
      entityId: created.id,
      action: 'CREATE',
      actorId: user.id,
      newState: { name: created.name, companyName: created.companyName },
    });

    return created;
  });
}

/**
 * ค้นหาหรือสร้าง Agent อัตโนมัติจากชื่อที่สกัดได้จากเอกสาร/แชต:
 * 1. กำหนดรูปแบบชื่อให้ขึ้นต้นด้วย "COST " เสมอ (เช่น "COST MAERSK") เพื่อความเป็นระเบียบ
 * 2. ค้นหาแบบ Case-Insensitive (ilike) ทั้งแบบมีและไม่มีคำนำหน้า "COST " เพื่อป้องกันการสร้างซ้ำ
 * 3. หากยังไม่มีในระบบ จะสร้าง Supplier ใหม่ให้อัตโนมัติ
 */
export async function findOrCreateAgentByName(user: AuthUser, rawAgentName: string) {
  const trimmed = rawAgentName.trim();
  const displayName = trimmed.toUpperCase().startsWith('COST ') ? trimmed : `COST ${trimmed}`;

  const existing = await db
    .select()
    .from(suppliers)
    .where(ilike(suppliers.name, displayName))
    .limit(1);

  if (existing[0]) return existing[0];

  const existingPlain = await db
    .select()
    .from(suppliers)
    .where(ilike(suppliers.name, trimmed))
    .limit(1);

  if (existingPlain[0]) return existingPlain[0];

  return createSupplierForUser(user, {
    name: displayName,
    companyName: trimmed,
    countryCode: 'TH',
  });
}

/**
 * ลบ Agent ออกจากระบบอย่างปลอดภัย:
 * - กฎความปลอดภัย: ตรวจสอบก่อนว่า Agent นี้เคยถูกผูกกับใบราคา (rate_records) ใดๆ หรือไม่
 *   หากมีประวัติใช้งานอยู่ จะไม่อนุญาตให้ลบ (โยนข้อผิดพลาด 'SUPPLIER_IN_USE') เพื่อปกป้องความสมบูรณ์ของข้อมูลย้อนหลัง
 * - ปลดการเชื่อมโยงใน source_documents.supplierId = null ก่อนลบ
 */
export async function deleteSupplierForUser(user: AuthUser, supplierId: string) {
  if (!hasPermission(user.role, 'suppliers:manage')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  const [linkedRate] = await db
    .select({ id: rateRecords.id })
    .from(rateRecords)
    .where(eq(rateRecords.supplierId, supplierId))
    .limit(1);

  if (linkedRate) {
    throw new Error('SUPPLIER_IN_USE');
  }

  return withUserContext(user, async (tx) => {
    await tx
      .update(sourceDocuments)
      .set({ supplierId: null })
      .where(eq(sourceDocuments.supplierId, supplierId));

    await tx.delete(suppliers).where(eq(suppliers.id, supplierId));

    await writeAuditLog(tx, {
      entityType: 'supplier',
      entityId: supplierId,
      action: 'DELETE',
      actorId: user.id,
      previousState: { name: existing.name, companyName: existing.companyName },
      newState: { deleted: true },
    });

    return { deleted: true, id: supplierId };
  });
}

/**
 * อัปเดตข้อมูลของ Agent (ชื่อบริษัท, ผู้ติดต่อ, เบอร์โทร, อีเมล, ที่อยู่, โน้ต)
 */
export async function updateSupplierForUser(
  user: AuthUser,
  supplierId: string,
  input: CreateSupplierInput
) {
  if (!hasPermission(user.role, 'suppliers:manage')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, supplierId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  return withUserContext(user, async (tx) => {
    const [updated] = await tx
      .update(suppliers)
      .set({
        name: input.name,
        companyName: input.companyName,
        contactPerson: input.contactPerson || null,
        phone: input.phone || null,
        email: input.email || null,
        countryCode: input.countryCode,
        address: input.address || null,
        notes: input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(suppliers.id, supplierId))
      .returning();

    await writeAuditLog(tx, {
      entityType: 'supplier',
      entityId: supplierId,
      action: 'UPDATE',
      actorId: user.id,
      previousState: { name: existing.name, companyName: existing.companyName },
      newState: { name: input.name, companyName: input.companyName },
    });

    return updated;
  });
}
