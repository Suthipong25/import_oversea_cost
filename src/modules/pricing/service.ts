import { and, asc, desc, eq } from 'drizzle-orm';
import Decimal from 'decimal.js';
import { db, withUserContext } from '@/lib/db';
import {
  auditLogs,
  chargeCatalog,
  costComparisons,
  rateCharges,
  rateRecords,
  sellingRateCharges,
  sellingRates,
  shipmentContainers,
  shipments,
  suppliers,
  users,
} from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { canViewAllShipments, hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import { calculateSellingRate } from '@/domain/pricing/calculator';
import type {
  RequestApprovalInput,
  ReturnSellingRateInput,
  UpdateSellingRateInput,
} from './schema';

/**
 * ขั้น ② (Sale Price Approve Request): โหลดหรือสร้าง Draft ใบขออนุมัติราคาขายอัตโนมัติ
 *
 * ลอจิกสำคัญ:
 * - หากยังไม่ได้เลือก Winning Agent ในขั้น ① -> คืน `sellingRate: null` เพื่อให้หน้าจอแนะนำให้กลับไปเลือกก่อน
 * - หากเลือก Agent แล้วแต่ยังไม่เคยเปิดขั้น ② -> สร้าง Draft ใน `selling_rates` + `selling_rate_charges` อัตโนมัติ
 *   โดยดึงต้นทุนจาก Agent ที่เลือกมาใส่ฝั่ง COST และเว้นฝั่ง REVENUE เป็น null (Zero Auto-Markup)
 * - รองรับ Maker-Checker: เมื่อเปิด `REQUIRE_AUTH="true"` ผู้ขออนุมัติกับผู้อนุมัติต้องเป็นคนละสิทธิ์/คนละคน
 */
export async function getOrInitSellingRateWorkspace(user: AuthUser, shipmentId: string) {
  if (!hasPermission(user.role, 'shipments:read')) {
    throw new Error('FORBIDDEN');
  }

  const [shipment] = await db
    .select({
      id: shipments.id,
      shipmentRef: shipments.shipmentRef,
      customerName: shipments.customerName,
      polPortCode: shipments.polPortCode,
      podPortCode: shipments.podPortCode,
      incoterm: shipments.incoterm,
      commodityDescription: shipments.commodityDescription,
      assignedUserId: shipments.assignedUserId,
      assignedUserName: users.fullName,
    })
    .from(shipments)
    .innerJoin(users, eq(shipments.assignedUserId, users.id))
    .where(eq(shipments.id, shipmentId))
    .limit(1);

  if (!shipment) return null;
  if (!canViewAllShipments(user.role) && shipment.assignedUserId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  const [containers, activeCompRows] = await Promise.all([
    db.select().from(shipmentContainers).where(eq(shipmentContainers.shipmentId, shipmentId)),
    db
      .select()
      .from(costComparisons)
      .where(and(eq(costComparisons.shipmentId, shipmentId), eq(costComparisons.isActive, true)))
      .limit(1),
  ]);

  const activeComparison = activeCompRows[0] ?? null;

  if (!activeComparison || !activeComparison.selectedRateRecordId) {
    return {
      shipment,
      containers,
      activeComparison: null,
      selectedAgentName: null,
      sellingRate: null,
      lines: [],
      timeline: [],
      requireAuthMode: process.env.REQUIRE_AUTH === 'true',
    };
  }

  const [selectedRateRow] = await db
    .select({
      id: rateRecords.id,
      agentName: suppliers.name,
      verificationStatus: rateRecords.verificationStatus,
    })
    .from(rateRecords)
    .innerJoin(suppliers, eq(rateRecords.supplierId, suppliers.id))
    .where(eq(rateRecords.id, activeComparison.selectedRateRecordId))
    .limit(1);

  let [sellingRate] = await db
    .select()
    .from(sellingRates)
    .where(
      and(
        eq(sellingRates.shipmentId, shipmentId),
        eq(sellingRates.costComparisonId, activeComparison.id),
        eq(sellingRates.isActive, true)
      )
    )
    .limit(1);

  // Auto-initialize a Draft selling rate from the selected Agent's verified cost
  // IMPORTANT: sellingAmountThb starts as NULL (zero auto-markup; Sales enters selling price manually!)
  if (!sellingRate && selectedRateRow && hasPermission(user.role, 'pricing:edit')) {
    const costLines = await db
      .select({
        chargeCatalogId: rateCharges.chargeCatalogId,
        rawChargeName: rateCharges.rawChargeName,
        category: rateCharges.category,
        cellStatus: rateCharges.cellStatus,
        amountThb: rateCharges.amountThb,
        amountUsd: rateCharges.amountUsd,
        whtAmount: rateCharges.whtAmount,
        vatAmount: rateCharges.vatAmount,
        chargeUnit: rateCharges.chargeUnit,
        displayOrder: chargeCatalog.displayOrder,
        defaultVatPercent: chargeCatalog.defaultVatPercent,
      })
      .from(rateCharges)
      .leftJoin(chargeCatalog, eq(rateCharges.chargeCatalogId, chargeCatalog.id))
      .where(eq(rateCharges.rateRecordId, selectedRateRow.id))
      .orderBy(asc(chargeCatalog.displayOrder));

    const quotedCostLines = costLines.filter(
      (c) => c.cellStatus === 'QUOTED' && c.amountThb !== null && Number(c.amountThb) > 0
    );

    const calc = calculateSellingRate({
      lines: quotedCostLines.map((c) => ({
        costAmountThb: c.amountThb ?? '0',
        sellingAmountThb: null,
        isVatApplicable: Number(c.defaultVatPercent ?? '0') > 0,
      })),
      discountAmount: 0,
      vatPercent: 7,
    });

    const lclContainer = containers.find((c) => c.containerType.toUpperCase() === 'LCL');
    const isLcl = Boolean(lclContainer);
    const lclVolume = lclContainer && Number(lclContainer.quantity) > 0 ? Number(lclContainer.quantity) : 1;
    const isAutoCompareTitle = shipment.customerName.startsWith('เปรียบเทียบ ');
    const defaultDocMeta = {
      jobNo: '',
      customerName: isAutoCompareTitle ? '' : shipment.customerName,
      consigneeName: isAutoCompareTitle ? '' : shipment.customerName,
      agentName: selectedRateRow.agentName,
      commodity: shipment.commodityDescription ?? '',
      volume:
        containers
          .map((c) => (c.containerType === 'LCL' ? `${c.quantity} CBM (LCL)` : `${c.quantity}×${c.containerType}`))
          .join(' + ') || '',
      weightKgs: '',
      measureCbm: isLcl && lclVolume > 0 ? String(lclVolume) : '',
      mode: isLcl ? 'Sea (LCL)' : 'Sea (FCL)',
      term: shipment.incoterm ?? 'FOB',
      pol: shipment.polPortCode,
      pod: shipment.podPortCode,
      freeDays: '',
      diffAdvance: '',
    };

    sellingRate = await withUserContext(user, async (tx) => {
      // Deactivate any older selling rates for this shipment
      await tx
        .update(sellingRates)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(sellingRates.shipmentId, shipmentId), eq(sellingRates.isActive, true)));

      const [created] = await tx
        .insert(sellingRates)
        .values({
          shipmentId,
          costComparisonId: activeComparison.id,
          selectedRateRecordId: selectedRateRow.id,
          currency: 'THB',
          status: 'Draft',
          totalCostThb: calc.totalCostThb,
          totalSellingBeforeVat: calc.totalSellingBeforeVat,
          discountAmount: calc.discountAmount,
          netSellingExclVat: calc.netSellingExclVat,
          grossProfit: calc.grossProfit,
          markupPercent: calc.markupPercent,
          grossMarginPercent: calc.grossMarginPercent,
          vatPercent: calc.vatPercent,
          vatAmount: calc.vatAmount,
          grandTotalSelling: calc.grandTotalSelling,
          documentMeta: defaultDocMeta,
          createdBy: user.id,
        })
        .returning();

      if (!created) throw new Error('Failed to initialize selling rate');

      if (quotedCostLines.length > 0) {
        await tx.insert(sellingRateCharges).values(
          quotedCostLines.map((c, idx) => {
            const isVat = Number(c.defaultVatPercent ?? '0') > 0;
            return {
              sellingRateId: created.id,
              chargeCatalogId: c.chargeCatalogId,
              description: c.rawChargeName,
              category: c.category,
              costAmountThb: c.amountThb ?? '0.0000',
              costWhtThb: c.whtAmount ?? '0.0000',
              costVatThb: c.vatAmount ?? '0.0000',
              costAmountUsd: c.amountUsd ?? null,
              costForeignCurrUsd: null,
              sellingAmountThb: null, // Sales enters manually (no auto-markup)
              revenueWhtPercent: isVat ? '3.00' : '0.00',
              revenueAmountUsd: null,
              chargeUnit: c.chargeUnit,
              quantity:
                isLcl &&
                lclVolume > 1 &&
                c.category !== 'Dest_Port' &&
                (c.chargeUnit === 'PER_CBM' || c.chargeUnit === 'PER_WM' || c.chargeUnit === 'PER_RT')
                  ? lclVolume.toFixed(2)
                  : '1.00',
              isVatApplicable: isVat,
              displayOrder: c.displayOrder ?? (idx + 1) * 10,
            };
          })
        );
      }

      await writeAuditLog(tx, {
        entityType: 'shipment',
        entityId: shipmentId,
        action: 'INIT_SELLING_RATE',
        actorId: user.id,
        newState: {
          sellingRateId: created.id,
          selectedAgent: selectedRateRow.agentName,
          totalCostThb: calc.totalCostThb,
        },
      });

      return created;
    });
  }

  const [lines, timeline] = await Promise.all([
    sellingRate
      ? db
          .select()
          .from(sellingRateCharges)
          .where(eq(sellingRateCharges.sellingRateId, sellingRate.id))
          .orderBy(asc(sellingRateCharges.displayOrder))
      : Promise.resolve([]),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        actorName: users.fullName,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.actorId, users.id))
      .where(eq(auditLogs.entityId, shipmentId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(20),
  ]);

  let approverName: string | null = null;
  if (sellingRate?.approvedBy) {
    const [approver] = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, sellingRate.approvedBy))
      .limit(1);
    approverName = approver?.fullName ?? null;
  }

  return {
    shipment,
    containers,
    activeComparison,
    selectedAgentName: selectedRateRow?.agentName ?? null,
    sellingRate: sellingRate ? { ...sellingRate, approverName } : null,
    lines,
    timeline,
    requireAuthMode: process.env.REQUIRE_AUTH === 'true',
  };
}

/**
 * บันทึกร่างราคาขาย (Save Selling Rate Draft):
 * - คำนวณยอดขาย ยอดกำไร Markup % และ Gross Margin % ด้วย decimal.js (Zero Auto-Markup)
 * - กฎความปลอดภัยของสิทธิ์: หากแก้ไขราคาขายในงานที่เคยได้รับการอนุมัติแล้ว (`Approved`) หรือขออนุมัติค้างอยู่
 *   สถานะจะถูก Reset กลับเป็น `Draft` ทันที และยกเลิกสิทธิ์การอนุมัติเดิม (Revoke Prior Approval)
 * - ซิงค์ข้อมูลลูกค้า/ท่าเรือต้นทาง-ปลายทางจาก `documentMeta` กลับไปยังตาราง `shipments` เพื่อให้ขั้น ③ ดึงไปใช้อัตโนมัติ
 */
export async function updateSellingRateForUser(
  user: AuthUser,
  sellingRateId: string,
  input: UpdateSellingRateInput
) {
  if (!hasPermission(user.role, 'pricing:edit')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(sellingRates)
    .where(eq(sellingRates.id, sellingRateId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  if (!canViewAllShipments(user.role)) {
    const [owner] = await db
      .select({ assignedUserId: shipments.assignedUserId })
      .from(shipments)
      .where(eq(shipments.id, existing.shipmentId))
      .limit(1);
    if (!owner || owner.assignedUserId !== user.id) {
      throw new Error('FORBIDDEN');
    }
  }

  const calc = calculateSellingRate({
    lines: input.lines.map((l) => ({
      costAmountThb: l.costAmountThb,
      sellingAmountThb: l.sellingAmountThb ?? null,
      isVatApplicable: l.isVatApplicable,
    })),
    discountAmount: input.discountAmount,
    vatPercent: input.vatPercent,
  });

  return withUserContext(user, async (tx) => {
    // Editing an Approved or Returned or Needs_Review selling rate resets status to Draft (revokes prior approval!)
    const nextStatus = existing.status === 'Pending_Approval' ? 'Draft' : 'Draft';

    const [updated] = await tx
      .update(sellingRates)
      .set({
        status: nextStatus,
        totalCostThb: calc.totalCostThb,
        totalSellingBeforeVat: calc.totalSellingBeforeVat,
        discountAmount: calc.discountAmount,
        netSellingExclVat: calc.netSellingExclVat,
        grossProfit: calc.grossProfit,
        markupPercent: calc.markupPercent,
        grossMarginPercent: calc.grossMarginPercent,
        vatPercent: calc.vatPercent,
        vatAmount: calc.vatAmount,
        grandTotalSelling: calc.grandTotalSelling,
        requestNotes: input.requestNotes ?? existing.requestNotes,
        documentMeta: input.documentMeta ?? existing.documentMeta ?? {},
        approvedBy: null,
        approvedAt: null,
        snapshotData: null,
        updatedAt: new Date(),
      })
      .where(eq(sellingRates.id, sellingRateId))
      .returning();

    await tx
      .delete(sellingRateCharges)
      .where(eq(sellingRateCharges.sellingRateId, sellingRateId));

    // Sync manually entered Customer / POL / POD back onto shipment so ③ Quotation inherits them cleanly
    if (input.documentMeta) {
      const shipmentPatch: Partial<typeof shipments.$inferInsert> = {};
      if (input.documentMeta.customerName && input.documentMeta.customerName.trim().length >= 2) {
        shipmentPatch.customerName = input.documentMeta.customerName.trim();
      }
      if (input.documentMeta.pol && input.documentMeta.pol.trim().length >= 2) {
        shipmentPatch.polPortCode = input.documentMeta.pol.trim();
      }
      if (input.documentMeta.pod && input.documentMeta.pod.trim().length >= 2) {
        shipmentPatch.podPortCode = input.documentMeta.pod.trim();
      }
      if (Object.keys(shipmentPatch).length > 0) {
        shipmentPatch.updatedAt = new Date();
        await tx
          .update(shipments)
          .set(shipmentPatch)
          .where(eq(shipments.id, existing.shipmentId));
      }
    }

    await tx.insert(sellingRateCharges).values(
      input.lines.map((l, idx) => ({
        sellingRateId,
        chargeCatalogId: l.chargeCatalogId ?? null,
        description: l.description,
        category: l.category,
        costAmountThb: new Decimal(l.costAmountThb).toFixed(4),
        costWhtThb: new Decimal(l.costWhtThb ?? 0).toFixed(4),
        costVatThb: new Decimal(l.costVatThb ?? 0).toFixed(4),
        costAmountUsd:
          l.costAmountUsd !== null && l.costAmountUsd !== undefined
            ? new Decimal(l.costAmountUsd).toFixed(4)
            : null,
        costForeignCurrUsd:
          l.costForeignCurrUsd !== null && l.costForeignCurrUsd !== undefined
            ? new Decimal(l.costForeignCurrUsd).toFixed(4)
            : null,
        sellingAmountThb:
          l.sellingAmountThb !== null && l.sellingAmountThb !== undefined
            ? new Decimal(l.sellingAmountThb).toFixed(4)
            : null,
        revenueWhtPercent: new Decimal(l.revenueWhtPercent ?? (l.isVatApplicable ? 3 : 0)).toFixed(2),
        revenueAmountUsd:
          l.revenueAmountUsd !== null && l.revenueAmountUsd !== undefined
            ? new Decimal(l.revenueAmountUsd).toFixed(4)
            : null,
        chargeUnit: l.chargeUnit,
        quantity: new Decimal(l.quantity).toFixed(2),
        isVatApplicable: l.isVatApplicable,
        displayOrder: (idx + 1) * 10,
      }))
    );

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: existing.shipmentId,
      action: existing.status === 'Approved' ? 'EDIT_SELLING_RATE_REVOKED_APPROVAL' : 'SAVE_SELLING_RATE',
      actorId: user.id,
      previousState: {
        status: existing.status,
        grandTotalSelling: existing.grandTotalSelling,
      },
      newState: {
        status: nextStatus,
        totalCostThb: calc.totalCostThb,
        netSellingExclVat: calc.netSellingExclVat,
        grossProfit: calc.grossProfit,
        grandTotalSelling: calc.grandTotalSelling,
      },
    });

    return { sellingRate: updated, calculation: calc };
  });
}

/**
 * ส่งคำขออนุมัติราคาขายไปยังผู้จัดการ (Request Sale Price Approval):
 * - ตรวจสอบว่าต้องมีราคาขายที่กรอกแล้ว (ยอดขายสุทธิ > 0)
 * - เปลี่ยนสถานะเป็น `Pending_Approval` และบันทึกวันเวลาที่ส่งขออนุมัติ
 */
export async function requestSellingRateApproval(
  user: AuthUser,
  sellingRateId: string,
  input: RequestApprovalInput
) {
  if (!hasPermission(user.role, 'pricing:edit')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(sellingRates)
    .where(eq(sellingRates.id, sellingRateId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  if (!canViewAllShipments(user.role)) {
    const [owner] = await db
      .select({ assignedUserId: shipments.assignedUserId })
      .from(shipments)
      .where(eq(shipments.id, existing.shipmentId))
      .limit(1);
    if (!owner || owner.assignedUserId !== user.id) {
      throw new Error('FORBIDDEN');
    }
  }

  if (existing.status !== 'Draft' && existing.status !== 'Returned') {
    throw new Error('INVALID_STATE');
  }
  if (Number(existing.netSellingExclVat) <= 0) {
    throw new Error('EMPTY_SELLING_PRICE');
  }

  return withUserContext(user, async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(sellingRates)
      .set({
        status: 'Pending_Approval',
        requestNotes: input.requestNotes ?? existing.requestNotes,
        approvalRequestedAt: now,
        rejectionReason: null,
        updatedAt: now,
      })
      .where(eq(sellingRates.id, sellingRateId))
      .returning();

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: existing.shipmentId,
      action: 'REQUEST_SALE_PRICE_APPROVAL',
      actorId: user.id,
      previousState: { status: existing.status },
      newState: {
        status: 'Pending_Approval',
        grandTotalSelling: existing.grandTotalSelling,
        grossProfit: existing.grossProfit,
      },
      reason: input.requestNotes ?? null,
    });

    return updated;
  });
}

/**
 * ผู้อนุมัติทำการอนุมัติราคาขาย (Approve Sale Price):
 * - ตรวจสอบสิทธิ์ `pricing:approve` (เฉพาะ Sales Manager หรือ Management)
 * - บังคับกฎ Maker-Checker (เมื่อ `REQUIRE_AUTH="true"`): ผู้ขออนุมัติ (`createdBy`) และผู้อนุมัติ (`user.id`) ต้องไม่ใช่คนเดียวกัน
 * - ถ่ายภาพรวมข้อมูล (Snapshot Data) ของราคาขายและรายการต้นทุนทุกรายการ ณ วินาทีที่อนุมัติไว้ใน JSON
 *   เพื่อเป็นหลักฐานอ้างอิงที่ไม่สามารถแก้ไขได้อีก (Immutable Approval Evidence)
 */
export async function approveSellingRate(user: AuthUser, sellingRateId: string) {
  if (!hasPermission(user.role, 'pricing:approve')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(sellingRates)
    .where(eq(sellingRates.id, sellingRateId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');
  if (existing.status !== 'Pending_Approval') {
    throw new Error('INVALID_STATE');
  }

  // Enforce strict Maker-Checker when REQUIRE_AUTH=true
  if (process.env.REQUIRE_AUTH === 'true' && existing.createdBy === user.id) {
    throw new Error('MAKER_CHECKER_BLOCKED');
  }

  const lines = await db
    .select()
    .from(sellingRateCharges)
    .where(eq(sellingRateCharges.sellingRateId, sellingRateId))
    .orderBy(asc(sellingRateCharges.displayOrder));

  const snapshotData = {
    approvedAt: new Date().toISOString(),
    approvedBy: user.id,
    totalCostThb: existing.totalCostThb,
    totalSellingBeforeVat: existing.totalSellingBeforeVat,
    discountAmount: existing.discountAmount,
    netSellingExclVat: existing.netSellingExclVat,
    grossProfit: existing.grossProfit,
    markupPercent: existing.markupPercent,
    grossMarginPercent: existing.grossMarginPercent,
    vatPercent: existing.vatPercent,
    vatAmount: existing.vatAmount,
    grandTotalSelling: existing.grandTotalSelling,
    lines: lines.map((l) => ({
      description: l.description,
      category: l.category,
      costAmountThb: l.costAmountThb,
      sellingAmountThb: l.sellingAmountThb,
      chargeUnit: l.chargeUnit,
      quantity: l.quantity,
      isVatApplicable: l.isVatApplicable,
    })),
  };

  return withUserContext(user, async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(sellingRates)
      .set({
        status: 'Approved',
        approvedBy: user.id,
        approvedAt: now,
        snapshotData,
        updatedAt: now,
      })
      .where(eq(sellingRates.id, sellingRateId))
      .returning();

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: existing.shipmentId,
      action: 'APPROVE_SALE_PRICE',
      actorId: user.id,
      previousState: { status: existing.status },
      newState: {
        status: 'Approved',
        grandTotalSelling: existing.grandTotalSelling,
        grossProfit: existing.grossProfit,
        grossMarginPercent: existing.grossMarginPercent,
      },
    });

    return updated;
  });
}

/**
 * ส่งคืนใบขออนุมัติราคาขายให้ฝ่ายขายกลับไปแก้ไข (Return / Reject Sale Price):
 * - ตรวจสอบว่าใบราคาขายอยู่ในสถานะ `Pending_Approval`
 * - บันทึกเหตุผลการตีกลับ (`rejectionReason`) และเปลี่ยนสถานะเป็น `Returned`
 * - บันทึกประวัติและเหตุผลใน Audit Log
 */
export async function returnSellingRate(
  user: AuthUser,
  sellingRateId: string,
  input: ReturnSellingRateInput
) {
  if (!hasPermission(user.role, 'pricing:approve')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(sellingRates)
    .where(eq(sellingRates.id, sellingRateId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');
  if (existing.status !== 'Pending_Approval') {
    throw new Error('INVALID_STATE');
  }

  return withUserContext(user, async (tx) => {
    const [updated] = await tx
      .update(sellingRates)
      .set({
        status: 'Returned',
        rejectionReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(sellingRates.id, sellingRateId))
      .returning();

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: existing.shipmentId,
      action: 'RETURN_SALE_PRICE',
      actorId: user.id,
      previousState: { status: existing.status },
      newState: { status: 'Returned', rejectionReason: input.reason },
      reason: input.reason,
    });

    return updated;
  });
}
