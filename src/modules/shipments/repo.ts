import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  auditLogs,
  costComparisons,
  quotations,
  rateRecords,
  sellingRates,
  shipmentContainers,
  shipments,
  users,
} from '@/lib/db/schema';
import {
  deriveShipmentStatus,
  type ComparisonStatus,
  type DerivedShipmentStatus,
  type QuotationWorkflowStatus,
  type RateVerificationStatus,
  type SellingRateWorkflowStatus,
} from '@/domain/workflow/shipment-status';

export interface ShipmentWorkflowProgress {
  step1Done: boolean;
  step1At: string | null;
  step2Status: SellingRateWorkflowStatus | null;
  step2Done: boolean;
  step2At: string | null;
  step3Status: QuotationWorkflowStatus | null;
  step3Done: boolean;
  step3At: string | null;
  quotationNumber: string | null;
  completedSteps: 0 | 1 | 2 | 3;
  isAllCompleted: boolean;
}

export interface ShipmentListItem {
  id: string;
  shipmentRef: string;
  customerName: string;
  polPortCode: string;
  podPortCode: string;
  incoterm: string | null;
  targetEtd: string | null;
  assignedUserName: string;
  containers: { containerType: string; quantity: number }[];
  rateCount: number;
  derivedStatus: DerivedShipmentStatus;
  workflow: ShipmentWorkflowProgress;
  createdAt: Date;
}

/**
 * รวมสถานะความคืบหน้าครบทั้ง 3 ขั้นตอนสำหรับหน้า "ประวัติงาน":
 * - ขั้น ① (Compare Cost): เสร็จเมื่อเลือก Agent ผู้ชนะแล้ว (`Supplier_Selected`)
 * - ขั้น ② (Sale Price Approve): เสร็จเมื่อ Manager อนุมัติแล้ว (`Approved`)
 * - ขั้น ③ (Quotation PDF): เสร็จเมื่อบันทึกว่าส่งลูกค้าแล้ว (`Sent`)
 * เมื่อครบทั้ง 3 ขั้น `isAllCompleted` จะเป็น true
 */
function buildWorkflowProgress(params: {
  comparisonStatus: ComparisonStatus | null;
  selectedAt: Date | null;
  sellingRateStatus: SellingRateWorkflowStatus | null;
  approvedAt: Date | null;
  quotationStatus: QuotationWorkflowStatus | null;
  sentAt: Date | null;
  quotationNumber: string | null;
}): ShipmentWorkflowProgress {
  const step1Done = params.comparisonStatus === 'Supplier_Selected';
  const step2Done = params.sellingRateStatus === 'Approved';
  const step3Done = params.quotationStatus === 'Sent';
  const completedSteps = ((step1Done ? 1 : 0) + (step2Done ? 1 : 0) + (step3Done ? 1 : 0)) as
    | 0
    | 1
    | 2
    | 3;

  return {
    step1Done,
    step1At: params.selectedAt ? params.selectedAt.toISOString() : null,
    step2Status: params.sellingRateStatus,
    step2Done,
    step2At: params.approvedAt ? params.approvedAt.toISOString() : null,
    step3Status: params.quotationStatus,
    step3Done,
    step3At: params.sentAt ? params.sentAt.toISOString() : null,
    quotationNumber: params.quotationNumber,
    completedSteps,
    isAllCompleted: step1Done && step2Done && step3Done,
  };
}

/**
 * ดึงรายการประวัติงานทั้งหมด (สูงสุด 100 งานล่าสุด) แบบ Batch Query (`inArray`)
 * เพื่อหลีกเลี่ยงปัญหา N+1 Query โดยดึง containers, rates, comparisons, sellingRates และ quotations
 * พร้อมกันใน Promise.all แล้วนำมาประกอบสถานะ 3 ขั้นตอนต่อแถว
 */
export async function listShipmentsRepo(filterAssignedUserId?: string): Promise<ShipmentListItem[]> {
  const baseQuery = db
    .select({
      id: shipments.id,
      shipmentRef: shipments.shipmentRef,
      customerName: shipments.customerName,
      polPortCode: shipments.polPortCode,
      podPortCode: shipments.podPortCode,
      incoterm: shipments.incoterm,
      targetEtd: shipments.targetEtd,
      assignedUserName: users.fullName,
      createdAt: shipments.createdAt,
    })
    .from(shipments)
    .innerJoin(users, eq(shipments.assignedUserId, users.id));

  const rows = filterAssignedUserId
    ? await baseQuery
        .where(eq(shipments.assignedUserId, filterAssignedUserId))
        .orderBy(desc(shipments.createdAt))
        .limit(100)
    : await baseQuery.orderBy(desc(shipments.createdAt)).limit(100);

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [containers, rates, comparisons, sRates, quotes] = await Promise.all([
    db.select().from(shipmentContainers).where(inArray(shipmentContainers.shipmentId, ids)),
    db
      .select({
        shipmentId: rateRecords.shipmentId,
        verificationStatus: rateRecords.verificationStatus,
      })
      .from(rateRecords)
      .where(inArray(rateRecords.shipmentId, ids)),
    db
      .select({
        shipmentId: costComparisons.shipmentId,
        status: costComparisons.status,
        isActive: costComparisons.isActive,
        selectedAt: costComparisons.selectedAt,
      })
      .from(costComparisons)
      .where(inArray(costComparisons.shipmentId, ids)),
    db
      .select({
        shipmentId: sellingRates.shipmentId,
        status: sellingRates.status,
        isActive: sellingRates.isActive,
        approvedAt: sellingRates.approvedAt,
      })
      .from(sellingRates)
      .where(inArray(sellingRates.shipmentId, ids)),
    db
      .select({
        shipmentId: quotations.shipmentId,
        quotationNumber: quotations.quotationNumber,
        status: quotations.status,
        sentAt: quotations.sentAt,
        createdAt: quotations.createdAt,
      })
      .from(quotations)
      .where(inArray(quotations.shipmentId, ids))
      .orderBy(desc(quotations.createdAt)),
  ]);

  return rows.map((r) => {
    const shipContainers = containers
      .filter((c) => c.shipmentId === r.id)
      .map((c) => ({ containerType: c.containerType, quantity: c.quantity }));
    const shipRates = rates.filter((rt) => rt.shipmentId === r.id);
    const activeComp = comparisons.find((cp) => cp.shipmentId === r.id && cp.isActive);
    const activeSelling = sRates.find((sr) => sr.shipmentId === r.id && sr.isActive);
    const shipQuotes = quotes.filter((q) => q.shipmentId === r.id);
    // Prefer a Sent quotation if one exists; otherwise the most recent quotation
    const primaryQuote = shipQuotes.find((q) => q.status === 'Sent') ?? shipQuotes[0];

    const comparisonStatus = (activeComp?.status as ComparisonStatus | undefined) ?? null;
    const sellingRateStatus =
      (activeSelling?.status as SellingRateWorkflowStatus | undefined) ?? null;
    const quotationStatus =
      (primaryQuote?.status as QuotationWorkflowStatus | undefined) ?? null;

    return {
      ...r,
      containers: shipContainers,
      rateCount: shipRates.length,
      derivedStatus: deriveShipmentStatus({
        rateStatuses: shipRates.map((x) => x.verificationStatus as RateVerificationStatus),
        comparisonStatus,
        sellingRateStatus,
        quotationStatus,
      }),
      workflow: buildWorkflowProgress({
        comparisonStatus,
        selectedAt: activeComp?.selectedAt ?? null,
        sellingRateStatus,
        approvedAt: activeSelling?.approvedAt ?? null,
        quotationStatus,
        sentAt: primaryQuote?.sentAt ?? null,
        quotationNumber: primaryQuote?.quotationNumber ?? null,
      }),
    };
  });
}

export async function getShipmentByIdRepo(id: string) {
  const [shipment] = await db
    .select({
      id: shipments.id,
      shipmentRef: shipments.shipmentRef,
      customerName: shipments.customerName,
      contactPerson: shipments.contactPerson,
      contactPhone: shipments.contactPhone,
      contactEmail: shipments.contactEmail,
      polPortCode: shipments.polPortCode,
      podPortCode: shipments.podPortCode,
      incoterm: shipments.incoterm,
      commodityDescription: shipments.commodityDescription,
      targetEtd: shipments.targetEtd,
      assignedUserId: shipments.assignedUserId,
      assignedUserName: users.fullName,
      createdAt: shipments.createdAt,
    })
    .from(shipments)
    .innerJoin(users, eq(shipments.assignedUserId, users.id))
    .where(eq(shipments.id, id))
    .limit(1);

  if (!shipment) return null;

  const [containers, rates, comparisons, sRates, quotes, timeline] = await Promise.all([
    db.select().from(shipmentContainers).where(eq(shipmentContainers.shipmentId, id)),
    db.select().from(rateRecords).where(eq(rateRecords.shipmentId, id)),
    db.select().from(costComparisons).where(eq(costComparisons.shipmentId, id)),
    db
      .select({
        status: sellingRates.status,
        isActive: sellingRates.isActive,
        approvedAt: sellingRates.approvedAt,
      })
      .from(sellingRates)
      .where(eq(sellingRates.shipmentId, id)),
    db
      .select({
        quotationNumber: quotations.quotationNumber,
        status: quotations.status,
        sentAt: quotations.sentAt,
        createdAt: quotations.createdAt,
      })
      .from(quotations)
      .where(eq(quotations.shipmentId, id))
      .orderBy(desc(quotations.createdAt)),
    db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        actorName: users.fullName,
        reason: auditLogs.reason,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .innerJoin(users, eq(auditLogs.actorId, users.id))
      .where(eq(auditLogs.entityId, id))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50),
  ]);

  const activeComp = comparisons.find((c) => c.isActive);
  const activeSelling = sRates.find((sr) => sr.isActive);
  const primaryQuote = quotes.find((q) => q.status === 'Sent') ?? quotes[0];
  const comparisonStatus = (activeComp?.status as ComparisonStatus | undefined) ?? null;
  const sellingRateStatus =
    (activeSelling?.status as SellingRateWorkflowStatus | undefined) ?? null;
  const quotationStatus =
    (primaryQuote?.status as QuotationWorkflowStatus | undefined) ?? null;

  const derivedStatus = deriveShipmentStatus({
    rateStatuses: rates.map((r) => r.verificationStatus as RateVerificationStatus),
    comparisonStatus,
    sellingRateStatus,
    quotationStatus,
  });

  const workflow = buildWorkflowProgress({
    comparisonStatus,
    selectedAt: activeComp?.selectedAt ?? null,
    sellingRateStatus,
    approvedAt: activeSelling?.approvedAt ?? null,
    quotationStatus,
    sentAt: primaryQuote?.sentAt ?? null,
    quotationNumber: primaryQuote?.quotationNumber ?? null,
  });

  return {
    ...shipment,
    containers,
    rates,
    derivedStatus,
    workflow,
    timeline,
  };
}
