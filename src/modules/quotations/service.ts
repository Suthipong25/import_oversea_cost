import { and, asc, desc, eq, like, sql } from 'drizzle-orm';
import { db, withUserContext } from '@/lib/db';
import {
  chargeCatalog,
  quotationItems,
  quotations,
  quotationVersions,
  sellingRateCharges,
  sellingRates,
  shipmentContainers,
  shipments,
  users,
} from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { canViewAllShipments, hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import {
  assertNoConfidentialFields,
  computeQuotationTotals,
  type CustomerQuotationPdfPayload,
} from '@/domain/quotations/payload';
import type {
  CreateRevisionInput,
  MarkQuotationSentInput,
  UpdateQuotationDraftInput,
} from './schema';

const DEFAULT_TERMS = [
  '1. อัตราค่าบริการข้างต้นมีผลถึงวันที่ระบุในใบเสนอราคาเท่านั้น (Rates are valid until the date stated above).',
  '2. ค่าระวางและค่าธรรมเนียมอาจเปลี่ยนแปลงตามประกาศสายเรือ/ท่าเรือ ณ วันขนส่งจริง (Subject to carrier space & port tariff at actual shipment).',
  '3. ไม่รวมค่าภาษีนำเข้า-ส่งออก ค่าตรวจปล่อยพิเศษ และค่าปรับจากการคืนตู้ล่าช้า (Excludes customs duties, special inspections, and demurrage/detention beyond free time).',
].join('\n');

/**
 * รันเลขใบเสนอราคาอัตโนมัติรูปแบบ `YYYY.MMDDXXX` (เช่น `2026.1118001`) ภายใน Transaction
 * ใช้ `pg_advisory_xact_lock(hashtext(prefix))` ล็อกเฉพาะวันเดียวกันเพื่อป้องกันเลขซ้ำ
 * เมื่อมีพนักงาน 2 คนกดสร้างใบเสนอราคาพร้อมกันในวินาทีเดียวกัน
 */
async function generateQuotationNumberInTx(
  tx: Parameters<Parameters<typeof withUserContext>[1]>[0]
): Promise<string> {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `${y}.${m}${d}`;

  // Transaction-scoped advisory lock prevents concurrent YYYY.MMDDXXX collisions
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${prefix}))`);

  const existing = await tx
    .select({ quotationNumber: quotations.quotationNumber })
    .from(quotations)
    .where(like(quotations.quotationNumber, `${prefix}%`));

  let maxSeq = 0;
  for (const row of existing) {
    const tail = row.quotationNumber.slice(prefix.length);
    const num = Number.parseInt(tail, 10);
    if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
  }

  return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
}

function formatDateDdMmYyyy(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function defaultValidUntil(): string {
  const d = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * ขั้น ③ (Customer Quotation PDF): โหลดหรือสร้างร่างใบเสนอราคาลูกค้า (v1)
 *
 * กฎความปลอดภัยและความถูกต้อง:
 * 1. ต้องผ่านการอนุมัติราคาจากขั้น ② (`selling_rates.status === 'Approved'`) ก่อนจึงจะเปิดขั้น ③ ได้
 * 2. คัดลอกเฉพาะรายการขายฝั่ง Revenue เข้าสู่ตาราง `quotations` / `quotation_versions` / `quotation_items`
 *    โดยตัดต้นทุน Agent, กำไร, และ Margin ออกทั้งหมด (Isolated Customer Domain)
 * 3. เมื่อกดบันทึกส่งลูกค้าแล้ว (`status = 'Sent'`) เวอร์ชันนั้นจะล็อกแก้ไม่ได้ (Immutable)
 *    หากต้องการปรับราคาต้องสร้าง Revision ใหม่ (v2, v3, ...) เพื่อเก็บประวัติครบถ้วน
 */
export async function getOrInitQuotationWorkspace(user: AuthUser, shipmentId: string) {
  if (!hasPermission(user.role, 'shipments:read')) {
    throw new Error('FORBIDDEN');
  }

  const [shipment] = await db
    .select({
      id: shipments.id,
      shipmentRef: shipments.shipmentRef,
      customerName: shipments.customerName,
      contactPerson: shipments.contactPerson,
      contactEmail: shipments.contactEmail,
      contactPhone: shipments.contactPhone,
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

  const [containers, activeSellingRows] = await Promise.all([
    db.select().from(shipmentContainers).where(eq(shipmentContainers.shipmentId, shipmentId)),
    db
      .select()
      .from(sellingRates)
      .where(and(eq(sellingRates.shipmentId, shipmentId), eq(sellingRates.isActive, true)))
      .limit(1),
  ]);

  const activeSelling = activeSellingRows[0] ?? null;

  if (!activeSelling || activeSelling.status !== 'Approved') {
    return {
      shipment,
      containers,
      sellingRateApproved: false,
      sellingRateStatus: activeSelling?.status ?? null,
      quotation: null,
      versions: [],
      activeVersion: null,
      items: [],
    };
  }

  let [quotation] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.shipmentId, shipmentId))
    .orderBy(desc(quotations.createdAt))
    .limit(1);

  // Auto-initialize Draft Quotation v1 strictly from the Approved Selling Rate's customer-safe selling prices
  if (!quotation && hasPermission(user.role, 'quotations:manage')) {
    const sellingLines = await db
      .select({
        description: sellingRateCharges.description,
        sellingAmountThb: sellingRateCharges.sellingAmountThb,
        chargeUnit: sellingRateCharges.chargeUnit,
        quantity: sellingRateCharges.quantity,
        isVatApplicable: sellingRateCharges.isVatApplicable,
        displayOrder: sellingRateCharges.displayOrder,
        nameTh: chargeCatalog.nameTh,
      })
      .from(sellingRateCharges)
      .leftJoin(chargeCatalog, eq(sellingRateCharges.chargeCatalogId, chargeCatalog.id))
      .where(eq(sellingRateCharges.sellingRateId, activeSelling.id))
      .orderBy(asc(sellingRateCharges.displayOrder));

    const quotedLines = sellingLines.filter(
      (l) => l.sellingAmountThb !== null && Number(l.sellingAmountThb) > 0
    );

    const containerSummary =
      containers.map((c) => `${c.quantity}×${c.containerType}`).join(' + ') || '1×40DV';

    const computed = computeQuotationTotals({
      items: quotedLines.map((l) => ({
        quantity: l.quantity,
        unitPrice: l.sellingAmountThb ?? '0',
        isTaxable: l.isVatApplicable,
      })),
      discountAmount: activeSelling.discountAmount,
      vatPercent: activeSelling.vatPercent,
    });

    const isLcl = containers.some((c) => c.containerType.toUpperCase() === 'LCL');
    const sellingMeta = (activeSelling.documentMeta ?? {}) as Record<string, string | undefined>;
    const initialDocMeta = {
      volumeText: sellingMeta.volume || containerSummary,
      modeText: sellingMeta.mode || (isLcl ? 'Sea (LCL)' : 'Sea (FCL)'),
      termText: sellingMeta.term || shipment.incoterm || 'FOB',
      cutOffEtdText: '',
      approvedDateText: activeSelling.approvedAt
        ? formatDateDdMmYyyy(new Date(activeSelling.approvedAt))
        : formatDateDdMmYyyy(new Date()),
    };

    quotation = await withUserContext(user, async (tx) => {
      const qNum = await generateQuotationNumberInTx(tx);
      const validUntil = defaultValidUntil();

      const [createdQ] = await tx
        .insert(quotations)
        .values({
          shipmentId,
          sellingRateId: activeSelling.id,
          quotationNumber: qNum,
          currentVersion: 1,
          status: 'Draft',
          customerName: shipment.customerName,
          customerContact: shipment.contactPerson,
          customerEmail: shipment.contactEmail,
          customerPhone: shipment.contactPhone,
          polPortCode: shipment.polPortCode,
          podPortCode: shipment.podPortCode,
          containerSummary,
          commodityDescription: sellingMeta.commodity || shipment.commodityDescription,
          freeTimeText: sellingMeta.freeDays || null,
          serviceType: 'CY/CY',
          paymentTerms: 'Credit 30 Days',
          validUntil,
          termsAndConditions: DEFAULT_TERMS,
          documentMeta: initialDocMeta,
          assignedSalesRepId: shipment.assignedUserId,
        })
        .returning();

      if (!createdQ) throw new Error('Failed to create quotation');

      const [ver] = await tx
        .insert(quotationVersions)
        .values({
          quotationId: createdQ.id,
          versionNumber: 1,
          status: 'Draft',
          subtotal: computed.subtotal,
          discountAmount: computed.discountAmount,
          vatPercent: computed.vatPercent,
          vatAmount: computed.vatAmount,
          grandTotal: computed.grandTotal,
          currency: 'THB',
          snapshotPayload: { initializedFromApprovedSellingRate: true, version: 1 },
          createdBy: user.id,
        })
        .returning();

      if (!ver) throw new Error('Failed to create quotation version');

      if (quotedLines.length > 0) {
        await tx.insert(quotationItems).values(
          quotedLines.map((l, idx) => ({
            quotationVersionId: ver.id,
            itemOrder: idx + 1,
            descriptionEn: l.description,
            descriptionTh: l.nameTh ?? null,
            quantity: computed.computedItems[idx]!.quantity,
            chargeUnitText: l.chargeUnit.replace(/_/g, ' '),
            unitPrice: computed.computedItems[idx]!.unitPrice,
            totalAmount: computed.computedItems[idx]!.totalAmount,
            currency: 'THB',
            isTaxable: l.isVatApplicable,
          }))
        );
      }

      await writeAuditLog(tx, {
        entityType: 'shipment',
        entityId: shipmentId,
        action: 'CREATE_QUOTATION',
        actorId: user.id,
        newState: {
          quotationId: createdQ.id,
          quotationNumber: createdQ.quotationNumber,
          version: 1,
          grandTotal: computed.grandTotal,
        },
      });

      return createdQ;
    });
  }

  if (!quotation) {
    return {
      shipment,
      containers,
      sellingRateApproved: true,
      sellingRateStatus: activeSelling.status,
      quotation: null,
      versions: [],
      activeVersion: null,
      items: [],
    };
  }

  const versions = await db
    .select()
    .from(quotationVersions)
    .where(eq(quotationVersions.quotationId, quotation.id))
    .orderBy(desc(quotationVersions.versionNumber));

  const activeVersion =
    versions.find((v) => v.versionNumber === quotation.currentVersion) ?? versions[0] ?? null;

  const items = activeVersion
    ? await db
        .select()
        .from(quotationItems)
        .where(eq(quotationItems.quotationVersionId, activeVersion.id))
        .orderBy(asc(quotationItems.itemOrder))
    : [];

  return {
    shipment,
    containers,
    sellingRateApproved: true,
    sellingRateStatus: activeSelling.status,
    quotation,
    versions,
    activeVersion,
    items,
  };
}

/**
 * แก้ไขร่างใบเสนอราคาลูกค้า (Update Quotation Draft):
 * - ตรวจสอบเงื่อนไข Immutability: แก้ไขได้เฉพาะใบเสนอราคาที่สถานะเป็น `Draft` เท่านั้น
 *   หากสถานะเป็น `Sent` (ส่งลูกค้าแล้ว) จะไม่อนุญาตให้แก้ไขโดยตรง (ต้องกดสร้าง Revision ใหม่แทน)
 * - คำนวณยอด Subtotal, ส่วนลด, VAT 7% และ Grand Total ด้วย decimal.js
 * - เขียนทับรายการสินค้า (`quotation_items`) ในเวอร์ชันปัจจุบันและบันทึก Audit Log
 */
export async function updateQuotationDraft(
  user: AuthUser,
  quotationId: string,
  input: UpdateQuotationDraftInput
) {
  if (!hasPermission(user.role, 'quotations:manage')) {
    throw new Error('FORBIDDEN');
  }

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);

  if (!quotation) throw new Error('NOT_FOUND');
  if (!canViewAllShipments(user.role) && quotation.assignedSalesRepId !== user.id) {
    throw new Error('FORBIDDEN');
  }
  if (quotation.status !== 'Draft') {
    throw new Error('QUOTATION_IMMUTABLE');
  }

  const [currentVer] = await db
    .select()
    .from(quotationVersions)
    .where(
      and(
        eq(quotationVersions.quotationId, quotation.id),
        eq(quotationVersions.versionNumber, quotation.currentVersion)
      )
    )
    .limit(1);

  if (!currentVer) throw new Error('NOT_FOUND');

  const computed = computeQuotationTotals({
    items: input.items.map((it) => ({
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      isTaxable: it.isTaxable,
    })),
    discountAmount: input.discountAmount,
    vatPercent: input.vatPercent,
  });

  return withUserContext(user, async (tx) => {
    await tx
      .update(quotations)
      .set({
        customerName: input.customerName,
        customerContact: input.customerContact || null,
        customerEmail: input.customerEmail || null,
        customerPhone: input.customerPhone || null,
        customerAddress: input.customerAddress || null,
        commodityDescription: input.commodityDescription || null,
        transitTimeText: input.transitTimeText || null,
        freeTimeText: input.freeTimeText || null,
        serviceType: input.serviceType,
        paymentTerms: input.paymentTerms,
        validUntil: input.validUntil,
        termsAndConditions: input.termsAndConditions || null,
        remarks: input.remarks || null,
        documentMeta: input.documentMeta ?? quotation.documentMeta ?? {},
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, quotation.id));

    await tx
      .update(quotationVersions)
      .set({
        subtotal: computed.subtotal,
        discountAmount: computed.discountAmount,
        vatPercent: computed.vatPercent,
        vatAmount: computed.vatAmount,
        grandTotal: computed.grandTotal,
        snapshotPayload: { updatedAt: new Date().toISOString(), version: currentVer.versionNumber },
      })
      .where(eq(quotationVersions.id, currentVer.id));

    await tx
      .delete(quotationItems)
      .where(eq(quotationItems.quotationVersionId, currentVer.id));

    await tx.insert(quotationItems).values(
      input.items.map((it, idx) => ({
        quotationVersionId: currentVer.id,
        itemOrder: idx + 1,
        descriptionEn: it.descriptionEn,
        descriptionTh: it.descriptionTh || null,
        quantity: computed.computedItems[idx]!.quantity,
        chargeUnitText: it.chargeUnitText,
        unitPrice: computed.computedItems[idx]!.unitPrice,
        totalAmount: computed.computedItems[idx]!.totalAmount,
        currency: 'THB',
        isTaxable: it.isTaxable,
      }))
    );

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: quotation.shipmentId,
      action: 'UPDATE_QUOTATION_DRAFT',
      actorId: user.id,
      newState: {
        quotationNumber: quotation.quotationNumber,
        version: currentVer.versionNumber,
        grandTotal: computed.grandTotal,
      },
    });

    return { updated: true, grandTotal: computed.grandTotal };
  });
}

/**
 * บันทึกว่าส่งใบเสนอราคาให้ลูกค้าแล้ว (Mark Quotation Sent):
 * - เปลี่ยนสถานะของใบเสนอราคาและเวอร์ชันปัจจุบันเป็น `Sent`
 * - บันทึกช่องทางการส่ง (Email, LINE, Chat, Handover) และผู้รับ
 * - เมื่อส่งแล้ว เวอร์ชันนี้จะกลายเป็น Immutable ทันที และความคืบหน้าของงานจะเปลี่ยนเป็น "เสร็จสมบูรณ์ 3/3"
 */
export async function markQuotationSent(
  user: AuthUser,
  quotationId: string,
  input: MarkQuotationSentInput
) {
  if (!hasPermission(user.role, 'quotations:manage')) {
    throw new Error('FORBIDDEN');
  }

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);

  if (!quotation) throw new Error('NOT_FOUND');
  if (!canViewAllShipments(user.role) && quotation.assignedSalesRepId !== user.id) {
    throw new Error('FORBIDDEN');
  }
  if (quotation.status !== 'Draft' && quotation.status !== 'Approved') {
    throw new Error('INVALID_STATE');
  }

  return withUserContext(user, async (tx) => {
    const now = new Date();
    await tx
      .update(quotations)
      .set({
        status: 'Sent',
        sentAt: now,
        sentChannel: input.sentChannel,
        sentRecipient: input.sentRecipient,
        sentBy: user.id,
        updatedAt: now,
      })
      .where(eq(quotations.id, quotation.id));

    await tx
      .update(quotationVersions)
      .set({ status: 'Sent' })
      .where(
        and(
          eq(quotationVersions.quotationId, quotation.id),
          eq(quotationVersions.versionNumber, quotation.currentVersion)
        )
      );

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: quotation.shipmentId,
      action: 'SEND_QUOTATION',
      actorId: user.id,
      newState: {
        quotationNumber: quotation.quotationNumber,
        version: quotation.currentVersion,
        sentChannel: input.sentChannel,
        sentRecipient: input.sentRecipient,
      },
      reason: input.notes ?? null,
    });

    return { sent: true };
  });
}

/**
 * สร้างเวอร์ชันใหม่ของใบเสนอราคา (Create Quotation Revision เช่น v2, v3, ...):
 * - รักษาประวัติเดิมแบบ Immutable: เปลี่ยนสถานะเวอร์ชันเดิมเป็น `Superseded` (ไม่ลบ ไม่แก้ทับ)
 * - รันเลขเวอร์ชันถัดไป (`currentVersion + 1`) และสร้างร่างใหม่สถานะ `Draft`
 * - คัดลอกรายการสินค้าเดิมทั้งหมดมาเป็นค่าเริ่มต้นในเวอร์ชันใหม่ พร้อมบันทึกสรุปเหตุผลการแก้ไข (`changeSummary`)
 */
export async function createQuotationRevision(
  user: AuthUser,
  quotationId: string,
  input: CreateRevisionInput
) {
  if (!hasPermission(user.role, 'quotations:manage')) {
    throw new Error('FORBIDDEN');
  }

  const [quotation] = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);

  if (!quotation) throw new Error('NOT_FOUND');
  if (!canViewAllShipments(user.role) && quotation.assignedSalesRepId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  const [prevVer] = await db
    .select()
    .from(quotationVersions)
    .where(
      and(
        eq(quotationVersions.quotationId, quotation.id),
        eq(quotationVersions.versionNumber, quotation.currentVersion)
      )
    )
    .limit(1);

  if (!prevVer) throw new Error('NOT_FOUND');

  const prevItems = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationVersionId, prevVer.id))
    .orderBy(asc(quotationItems.itemOrder));

  const nextVersionNumber = quotation.currentVersion + 1;

  return withUserContext(user, async (tx) => {
    // Mark previous version Superseded (immutable history preserved)
    await tx
      .update(quotationVersions)
      .set({ status: 'Superseded' })
      .where(eq(quotationVersions.id, prevVer.id));

    const [newVer] = await tx
      .insert(quotationVersions)
      .values({
        quotationId: quotation.id,
        versionNumber: nextVersionNumber,
        status: 'Draft',
        subtotal: prevVer.subtotal,
        discountAmount: prevVer.discountAmount,
        vatPercent: prevVer.vatPercent,
        vatAmount: prevVer.vatAmount,
        grandTotal: prevVer.grandTotal,
        currency: prevVer.currency,
        snapshotPayload: { revisedFromVersion: prevVer.versionNumber, changeSummary: input.changeSummary },
        changeSummary: input.changeSummary,
        createdBy: user.id,
      })
      .returning();

    if (!newVer) throw new Error('Failed to create revision');

    if (prevItems.length > 0) {
      await tx.insert(quotationItems).values(
        prevItems.map((it) => ({
          quotationVersionId: newVer.id,
          itemOrder: it.itemOrder,
          descriptionEn: it.descriptionEn,
          descriptionTh: it.descriptionTh,
          quantity: it.quantity,
          chargeUnitText: it.chargeUnitText,
          unitPrice: it.unitPrice,
          totalAmount: it.totalAmount,
          currency: it.currency,
          isTaxable: it.isTaxable,
        }))
      );
    }

    await tx
      .update(quotations)
      .set({
        currentVersion: nextVersionNumber,
        status: 'Draft',
        updatedAt: new Date(),
      })
      .where(eq(quotations.id, quotation.id));

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: quotation.shipmentId,
      action: 'CREATE_QUOTATION_REVISION',
      actorId: user.id,
      previousState: { version: prevVer.versionNumber },
      newState: {
        quotationNumber: quotation.quotationNumber,
        version: nextVersionNumber,
        changeSummary: input.changeSummary,
      },
      reason: input.changeSummary,
    });

    return { versionNumber: nextVersionNumber };
  });
}

/**
 * CONFIDENTIALITY BY DESIGN:
 * Queries ONLY customer-facing tables (quotations, quotation_versions, quotation_items)
 * and asserts zero forbidden internal cost/supplier/profit keys before PDF rendering.
 */
export async function getCustomerQuotationPdfPayload(
  user: AuthUser,
  quotationId: string,
  versionNumber?: number
): Promise<CustomerQuotationPdfPayload | null> {
  if (!hasPermission(user.role, 'shipments:read')) {
    throw new Error('FORBIDDEN');
  }

  const [q] = await db
    .select({
      id: quotations.id,
      quotationNumber: quotations.quotationNumber,
      currentVersion: quotations.currentVersion,
      customerName: quotations.customerName,
      customerContact: quotations.customerContact,
      customerEmail: quotations.customerEmail,
      customerPhone: quotations.customerPhone,
      customerAddress: quotations.customerAddress,
      polPortCode: quotations.polPortCode,
      podPortCode: quotations.podPortCode,
      containerSummary: quotations.containerSummary,
      commodityDescription: quotations.commodityDescription,
      transitTimeText: quotations.transitTimeText,
      freeTimeText: quotations.freeTimeText,
      serviceType: quotations.serviceType,
      paymentTerms: quotations.paymentTerms,
      validUntil: quotations.validUntil,
      termsAndConditions: quotations.termsAndConditions,
      remarks: quotations.remarks,
      documentMeta: quotations.documentMeta,
      assignedSalesRepId: quotations.assignedSalesRepId,
      createdAt: quotations.createdAt,
      salesRepName: users.fullName,
    })
    .from(quotations)
    .innerJoin(users, eq(quotations.assignedSalesRepId, users.id))
    .where(eq(quotations.id, quotationId))
    .limit(1);

  if (!q) return null;
  if (!canViewAllShipments(user.role) && q.assignedSalesRepId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  const targetVerNum = versionNumber ?? q.currentVersion;
  const [ver] = await db
    .select()
    .from(quotationVersions)
    .where(
      and(
        eq(quotationVersions.quotationId, q.id),
        eq(quotationVersions.versionNumber, targetVerNum)
      )
    )
    .limit(1);

  if (!ver) return null;

  const items = await db
    .select({
      itemOrder: quotationItems.itemOrder,
      descriptionEn: quotationItems.descriptionEn,
      descriptionTh: quotationItems.descriptionTh,
      quantity: quotationItems.quantity,
      chargeUnitText: quotationItems.chargeUnitText,
      unitPrice: quotationItems.unitPrice,
      totalAmount: quotationItems.totalAmount,
      currency: quotationItems.currency,
      isTaxable: quotationItems.isTaxable,
    })
    .from(quotationItems)
    .where(eq(quotationItems.quotationVersionId, ver.id))
    .orderBy(asc(quotationItems.itemOrder));

  const docMeta = (q.documentMeta ?? {}) as Record<string, string | undefined>;

  const payload: CustomerQuotationPdfPayload = {
    quotationNumber: q.quotationNumber,
    versionNumber: ver.versionNumber,
    issueDate: q.createdAt.toISOString().slice(0, 10),
    validUntil: q.validUntil,
    salesRepName: q.salesRepName,
    customerName: q.customerName,
    customerContact: q.customerContact,
    customerEmail: q.customerEmail,
    customerPhone: q.customerPhone,
    customerAddress: q.customerAddress,
    polPortCode: q.polPortCode,
    podPortCode: q.podPortCode,
    containerSummary: q.containerSummary,
    commodityDescription: q.commodityDescription,
    volumeText: docMeta.volumeText || q.containerSummary,
    modeText: docMeta.modeText || 'Sea (FCL)',
    termText: docMeta.termText || 'FOB',
    cutOffEtdText: docMeta.cutOffEtdText || null,
    approvedDateText: docMeta.approvedDateText || formatDateDdMmYyyy(q.createdAt),
    transitTimeText: q.transitTimeText,
    freeTimeText: q.freeTimeText,
    serviceType: q.serviceType,
    paymentTerms: q.paymentTerms,
    termsAndConditions: q.termsAndConditions,
    remarks: q.remarks,
    currency: ver.currency,
    subtotal: ver.subtotal,
    discountAmount: ver.discountAmount,
    vatPercent: ver.vatPercent,
    vatAmount: ver.vatAmount,
    grandTotal: ver.grandTotal,
    items,
  };

  // Runtime safety assertion: throws immediately if any confidential field appears
  assertNoConfidentialFields(payload);

  return payload;
}
