import { createHash, randomBytes } from 'node:crypto';
import { asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { db, withUserContext } from '@/lib/db';
import {
  chargeAliases,
  chargeCatalog,
  rateCharges,
  rateRecords,
  shipmentContainers,
  shipments,
  sourceDocuments,
  suppliers,
} from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import { runExtractionPipeline } from '@/lib/ai/extract';
import { getLiveUsdToThbRate } from '@/lib/fx/live-rate';
import { matchChargeToCatalog, sumRateCharges } from '@/lib/ai/normalize';
import { convertUsdToThb } from '@/domain/comparison/scope';
import { savePrivateFile, signDocumentUrl, validateFileMagicBytes } from '@/lib/storage/local';
import { findOrCreateAgentByName } from '@/modules/suppliers/service';

export interface StandaloneAgentCostCharge {
  id: string;
  chargeCatalogId: string | null;
  rawChargeName: string;
  category: string;
  cellStatus: string;
  whtAmount: string;
  vatAmount: string;
  amountThb: string | null;
  amountUsd: string | null;
  sourceTextSnippet: string | null;
}

export interface StandaloneAgentCostItem {
  id: string;
  supplierId: string;
  agentName: string;
  polPortCode: string;
  podPortCode: string;
  modeType: string;
  containerSummary: string;
  verificationStatus: string;
  sourceFileType: string | null;
  sourceFileName: string | null;
  sourceFileUrl: string | null;
  sourceRawText: string | null;
  totals: {
    whtThb: string;
    vatThb: string;
    amountThb: string;
    amountUsd: string;
  };
  charges: StandaloneAgentCostCharge[];
  createdAt: string;
}

/**
 * ดึงรายการ Cost Agent ในคลังกลางทั้งหมด (`shipment_id IS NULL`) สูงสุด 150 รายการล่าสุด
 * พร้อม Master Catalog, รายชื่อ Supplier, อัตราแลกเปลี่ยน และยอดรวม WHT/VAT/THB/USD
 */
export async function listStandaloneAgentCosts(user: AuthUser) {
  if (!hasPermission(user.role, 'shipments:read')) {
    throw new Error('FORBIDDEN');
  }

  const [rateRows, catalogRows, supplierRows, fxSnapshot] = await Promise.all([
    db
      .select({
        id: rateRecords.id,
        supplierId: rateRecords.supplierId,
        agentName: suppliers.name,
        polPortCode: rateRecords.polPortCode,
        podPortCode: rateRecords.podPortCode,
        modeType: rateRecords.modeType,
        containerSummary: rateRecords.containerSummary,
        verificationStatus: rateRecords.verificationStatus,
        sourceDocumentId: rateRecords.sourceDocumentId,
        createdAt: rateRecords.createdAt,
      })
      .from(rateRecords)
      .innerJoin(suppliers, eq(rateRecords.supplierId, suppliers.id))
      .where(isNull(rateRecords.shipmentId))
      .orderBy(desc(rateRecords.createdAt))
      .limit(150),
    db
      .select()
      .from(chargeCatalog)
      .where(eq(chargeCatalog.isActive, true))
      .orderBy(asc(chargeCatalog.displayOrder)),
    db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)),
    getLiveUsdToThbRate(),
  ]);

  const rateIds = rateRows.map((r) => r.id);
  const docIds = rateRows
    .map((r) => r.sourceDocumentId)
    .filter((id): id is string => Boolean(id));

  const [allCharges, allDocs] = await Promise.all([
    rateIds.length > 0
      ? db
          .select()
          .from(rateCharges)
          .where(inArray(rateCharges.rateRecordId, rateIds))
          .orderBy(asc(rateCharges.createdAt))
      : Promise.resolve([]),
    docIds.length > 0
      ? db.select().from(sourceDocuments).where(inArray(sourceDocuments.id, docIds))
      : Promise.resolve([]),
  ]);

  const docMap = new Map(allDocs.map((d) => [d.id, d]));

  const items: StandaloneAgentCostItem[] = rateRows.map((r) => {
    const charges = allCharges.filter((c) => c.rateRecordId === r.id);
    const totals = sumRateCharges(charges);
    const doc = r.sourceDocumentId ? docMap.get(r.sourceDocumentId) : null;

    return {
      id: r.id,
      supplierId: r.supplierId,
      agentName: r.agentName,
      polPortCode: r.polPortCode,
      podPortCode: r.podPortCode,
      modeType: r.modeType,
      containerSummary: r.containerSummary,
      verificationStatus: r.verificationStatus,
      sourceFileType: doc?.fileType ?? null,
      sourceFileName: doc?.fileName ?? null,
      sourceFileUrl: doc?.storagePath ? signDocumentUrl(doc.id) : null,
      sourceRawText: doc?.rawTextContent ?? null,
      totals,
      charges: charges.map((c) => ({
        id: c.id,
        chargeCatalogId: c.chargeCatalogId,
        rawChargeName: c.rawChargeName,
        category: c.category,
        cellStatus: c.cellStatus,
        whtAmount: c.whtAmount,
        vatAmount: c.vatAmount,
        amountThb: c.amountThb,
        amountUsd: c.amountUsd,
        sourceTextSnippet: c.sourceTextSnippet,
      })),
      createdAt: r.createdAt.toISOString(),
    };
  });

  return {
    items,
    catalog: catalogRows.map((c) => ({
      id: c.id,
      code: c.code,
      nameEn: c.nameEn,
      nameTh: c.nameTh,
      category: c.category,
      isSectionHeader: c.isSectionHeader,
    })),
    suppliers: supplierRows.map((s) => ({
      id: s.id,
      name: s.name,
      companyName: s.companyName,
    })),
    fxRateUsdToThb: fxSnapshot.rate,
    fxSnapshot,
  };
}

/**
 * บันทึกใบราคา Agent เข้าสู่คลังกลาง (Standalone Agent Cost Library):
 * - สามารถอัปโหลดไฟล์รูปภาพ/PDF หรือวางข้อความแชต เพื่อให้ AI สกัดรายการค่าใช้จ่ายอัตโนมัติ
 * - หากมีรายการที่มีเฉพาะราคา USD จะแปลงเป็น THB ด้วยสูตร `CEIL_100` ของ Perkin ให้ทันที
 * - บันทึกเป็นรายการส่วนกลาง (`shipment_id = null`) เพื่อให้สามารถนำไปติ๊กเลือกสร้างงานเปรียบเทียบในอนาคตได้
 */
export async function createStandaloneAgentCost(
  user: AuthUser,
  params: {
    agentName: string;
    modeType: 'FCL' | 'LCL';
    polPortCode: string;
    podPortCode: string;
    containerSummary: string;
    file?: { name: string; buffer: Buffer } | null;
    pastedText?: string | null;
  }
) {
  if (!hasPermission(user.role, 'rates:ingest')) {
    throw new Error('FORBIDDEN');
  }

  let fileType: 'PDF' | 'IMAGE' | 'PASTED_TEXT' = 'PASTED_TEXT';
  let mimeType = 'text/plain';
  let fileName = 'Manual_Or_Chat_Input.txt';
  let fileSize: number | null = null;
  let storagePath: string | null = null;
  let sha256 = createHash('sha256').update(`${Date.now()}-${params.agentName}`).digest('hex');
  let fileBuffer: Buffer | undefined;

  if (params.file && params.file.buffer.length > 0) {
    const validated = validateFileMagicBytes(params.file.buffer);
    fileType = validated.fileType;
    mimeType = validated.mimeType;
    fileName = params.file.name || `upload.${validated.extension}`;
    fileSize = validated.size;
    sha256 = validated.sha256;
    fileBuffer = params.file.buffer;
    storagePath = await savePrivateFile('agent-costs', params.file.buffer, validated);
  } else if (params.pastedText && params.pastedText.trim().length > 0) {
    const cleanText = params.pastedText.trim();
    fileSize = Buffer.byteLength(cleanText, 'utf8');
    sha256 = createHash('sha256').update(cleanText).digest('hex');
  }

  const agent = await findOrCreateAgentByName(user, params.agentName);

  const [catalogRows, aliasRows, fxSnapshot] = await Promise.all([
    db.select().from(chargeCatalog).where(eq(chargeCatalog.isActive, true)),
    db.select().from(chargeAliases),
    getLiveUsdToThbRate(),
  ]);

  const fxRateNum = fxSnapshot.rate;

  const hasExtractionInput =
    Boolean(fileBuffer) || Boolean(params.pastedText && params.pastedText.trim().length > 0);

  const extraction = hasExtractionInput
    ? await runExtractionPipeline({
        fileType,
        mimeType,
        fileBuffer,
        pastedText: params.pastedText ?? undefined,
        fxRateUsdToThb: fxRateNum,
      })
    : null;

  return withUserContext(user, async (tx) => {
    const [doc] = await tx
      .insert(sourceDocuments)
      .values({
        shipmentId: null,
        supplierId: agent.id,
        fileName,
        fileType,
        mimeType,
        fileSize,
        storagePath,
        fileHashSha256: sha256,
        rawTextContent: extraction?.extractedTextLayer ?? params.pastedText ?? null,
        extractionStatus: extraction ? 'Extracted' : 'Uploaded',
        createdBy: user.id,
      })
      .returning();

    if (!doc) throw new Error('Failed to create source document');

    const [rate] = await tx
      .insert(rateRecords)
      .values({
        shipmentId: null,
        sourceDocumentId: doc.id,
        supplierId: agent.id,
        polPortCode: params.polPortCode.toUpperCase(),
        podPortCode: params.podPortCode.toUpperCase(),
        modeType: params.modeType,
        containerSummary: params.containerSummary.trim() || (params.modeType === 'LCL' ? 'LCL' : '1×40DV'),
        serviceType: params.modeType === 'LCL' ? 'CFS/CFS' : 'CY/CY',
        verificationStatus: 'Awaiting_Verification',
        rawAiOutput: extraction
          ? {
              provider: extraction.provider,
              model: extraction.model,
              warnings: extraction.result.warnings,
            }
          : null,
      })
      .returning();

    if (!rate) throw new Error('Failed to create standalone agent cost');

    const extractedCharges = extraction?.result.charges ?? [];
    if (extractedCharges.length > 0) {
      const chargeRows = extractedCharges.map((ch) => {
        const matched = matchChargeToCatalog(ch.rawChargeName, catalogRows, aliasRows);
        const amountUsdStr = ch.amountUsd !== null ? ch.amountUsd.toFixed(4) : null;
        // If only USD was quoted, convert using Perkin's CEIL_100 FX formula so THB total is ready immediately
        const amountThbStr =
          ch.amountThb !== null
            ? ch.amountThb.toFixed(4)
            : amountUsdStr !== null && ch.cellStatus === 'QUOTED'
              ? convertUsdToThb(amountUsdStr, fxRateNum, 'CEIL_100')
              : null;

        return {
          rateRecordId: rate.id,
          chargeCatalogId: matched?.id ?? null,
          rawChargeName: ch.rawChargeName,
          category: matched?.category ?? ch.categoryHint ?? 'Other',
          cellStatus: ch.cellStatus,
          amount: amountThbStr ?? amountUsdStr,
          currency: amountUsdStr ? 'USD' : amountThbStr ? 'THB' : null,
          amountUsd: amountUsdStr,
          amountThb: amountThbStr,
          fxRateUsed: amountUsdStr && ch.amountThb === null ? fxRateNum.toFixed(4) : null,
          whtPercent: matched?.defaultWhtPercent ?? '0.00',
          whtAmount: ch.whtAmount !== null ? ch.whtAmount.toFixed(4) : '0.0000',
          vatPercent: matched?.defaultVatPercent ?? '0.00',
          vatAmount: ch.vatAmount !== null ? ch.vatAmount.toFixed(4) : '0.0000',
          chargeUnit: ch.chargeUnit ?? 'PER_SHIPMENT',
          sourcePage: ch.sourcePage ?? 1,
          sourceTextSnippet: ch.sourceTextSnippet ?? null,
          confidenceScore: ch.confidenceScore !== null ? ch.confidenceScore.toFixed(3) : null,
          isVerified: false,
        };
      });

      await tx.insert(rateCharges).values(chargeRows);
    }

    await writeAuditLog(tx, {
      entityType: 'rate_record',
      entityId: rate.id,
      action: 'CREATE_AGENT_COST',
      actorId: user.id,
      newState: {
        agentName: agent.name,
        modeType: params.modeType,
        polPortCode: rate.polPortCode,
        podPortCode: rate.podPortCode,
        extractedCount: extractedCharges.length,
        provider: extraction?.provider ?? 'manual',
      },
    });

    return {
      rateRecordId: rate.id,
      agentName: agent.name,
      extractedCount: extractedCharges.length,
      warnings: extraction?.result.warnings ?? [],
    };
  });
}

/**
 * แก้ไขข้อมูลส่วนหัว (Metadata) ของรายการ Cost Agent ในคลังกลาง:
 * - ปรับปรุงชื่อ Agent, รูปแบบขนส่ง (FCL/LCL), ท่าเรือต้นทาง-ปลายทาง, และข้อความสรุปตู้
 * - ซิงค์ชื่อ Agent ไปยัง `source_documents.supplierId` ที่เกี่ยวข้อง
 */
export async function updateStandaloneAgentCostMeta(
  user: AuthUser,
  rateRecordId: string,
  input: {
    agentName: string;
    modeType: 'FCL' | 'LCL';
    polPortCode: string;
    podPortCode: string;
    containerSummary: string;
  }
) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(rateRecords)
    .where(eq(rateRecords.id, rateRecordId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  const agent = await findOrCreateAgentByName(user, input.agentName);
  const nextPol = input.polPortCode.trim().toUpperCase();
  const nextPod = input.podPortCode.trim().toUpperCase();
  const nextSummary =
    input.containerSummary.trim() || (input.modeType === 'LCL' ? 'LCL' : '1×40DV');

  return withUserContext(user, async (tx) => {
    const [updated] = await tx
      .update(rateRecords)
      .set({
        supplierId: agent.id,
        modeType: input.modeType,
        polPortCode: nextPol,
        podPortCode: nextPod,
        containerSummary: nextSummary,
        serviceType: input.modeType === 'LCL' ? 'CFS/CFS' : 'CY/CY',
        updatedAt: new Date(),
      })
      .where(eq(rateRecords.id, rateRecordId))
      .returning();

    if (existing.sourceDocumentId) {
      await tx
        .update(sourceDocuments)
        .set({ supplierId: agent.id })
        .where(eq(sourceDocuments.id, existing.sourceDocumentId));
    }

    await writeAuditLog(tx, {
      entityType: existing.shipmentId ? 'shipment' : 'rate_record',
      entityId: existing.shipmentId ?? rateRecordId,
      action: 'UPDATE_AGENT_COST_META',
      actorId: user.id,
      previousState: {
        supplierId: existing.supplierId,
        modeType: existing.modeType,
        polPortCode: existing.polPortCode,
        podPortCode: existing.podPortCode,
        containerSummary: existing.containerSummary,
      },
      newState: {
        agentName: agent.name,
        modeType: input.modeType,
        polPortCode: nextPol,
        podPortCode: nextPod,
        containerSummary: nextSummary,
      },
    });

    return { updated: true, rateRecord: updated, agentName: agent.name };
  });
}

function generateShipmentRef(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  return `SHP-${y}${m}-${suffix}`;
}

function parseContainersFromSummary(modeType: string, summary: string) {
  if (modeType.toUpperCase() === 'LCL' || summary.toUpperCase().includes('LCL')) {
    return [{ containerType: 'LCL', quantity: 1 }];
  }

  const matches = [...summary.toUpperCase().matchAll(/(\d+)\s*[X×]\s*(20GP|40DV|40HQ|45HQ|20RF|40RF)/g)];
  if (matches.length > 0) {
    const merged = new Map<string, number>();
    for (const m of matches) {
      const qty = Math.max(1, Number.parseInt(m[1]!, 10) || 1);
      const type = m[2]!;
      merged.set(type, (merged.get(type) ?? 0) + qty);
    }
    return [...merged.entries()].map(([containerType, quantity]) => ({ containerType, quantity }));
  }

  return [{ containerType: '40DV', quantity: 1 }];
}

/**
 * ขั้น 0 -> ขั้น ①: สร้างงานเปรียบเทียบ (Shipment) จากรายการ Cost Agent ที่ผู้ใช้ติ๊กเลือก 2–5 เจ้า
 *
 * หลักการออกแบบ:
 * - โคลน (Clone) ข้อมูล rate_records และ rate_charges จากคลังกลาง (`shipment_id IS NULL`)
 *   เข้าไปผูกกับ Shipment ใหม่ เพื่อไม่ให้การแก้ไข/แปลง FX ในงานเปรียบเทียบไปกระทบต้นฉบับในคลัง Cost Agent
 * - ทำทั้งหมดภายใน Transaction (`withUserContext`) เพื่อรับประกันความถูกต้องของข้อมูลและ Audit Log
 */
export async function createComparisonFromAgentCosts(
  user: AuthUser,
  input: {
    rateRecordIds: string[];
    customerName?: string | null;
    incoterm?: string | null;
    commodityDescription?: string | null;
  }
) {
  if (!hasPermission(user.role, 'shipments:create')) {
    throw new Error('FORBIDDEN');
  }

  const uniqueIds = Array.from(new Set(input.rateRecordIds));
  if (uniqueIds.length < 2) throw new Error('MIN_TWO_AGENTS');
  if (uniqueIds.length > 5) throw new Error('MAX_FIVE_AGENTS');

  const selectedRates = await db
    .select()
    .from(rateRecords)
    .where(inArray(rateRecords.id, uniqueIds));

  if (selectedRates.length < 2) throw new Error('NOT_FOUND');

  const allCharges = await db
    .select()
    .from(rateCharges)
    .where(inArray(rateCharges.rateRecordId, selectedRates.map((r) => r.id)));

  const first = selectedRates[0]!;
  const containers = parseContainersFromSummary(first.modeType, first.containerSummary);
  const dateLabel = new Date().toLocaleDateString('th-TH');
  const customerName =
    input.customerName && input.customerName.trim().length > 0
      ? input.customerName.trim()
      : `เปรียบเทียบ ${first.polPortCode} → ${first.podPortCode} (${dateLabel})`;

  return withUserContext(user, async (tx) => {
    const [createdShipment] = await tx
      .insert(shipments)
      .values({
        shipmentRef: generateShipmentRef(),
        customerName,
        polPortCode: first.polPortCode,
        podPortCode: first.podPortCode,
        incoterm: input.incoterm?.trim() || 'FOB',
        commodityDescription: input.commodityDescription?.trim() || null,
        assignedUserId: user.id,
      })
      .returning();

    if (!createdShipment) throw new Error('Failed to create comparison shipment');

    await tx.insert(shipmentContainers).values(
      containers.map((c) => ({
        shipmentId: createdShipment.id,
        containerType: c.containerType,
        quantity: c.quantity,
      }))
    );

    // Clone selected library rates into the new comparison shipment
    for (const srcRate of selectedRates) {
      const [clonedRate] = await tx
        .insert(rateRecords)
        .values({
          shipmentId: createdShipment.id,
          sourceDocumentId: srcRate.sourceDocumentId,
          supplierId: srcRate.supplierId,
          shippingLineName: srcRate.shippingLineName,
          rateRef: srcRate.rateRef,
          polPortCode: srcRate.polPortCode,
          podPortCode: srcRate.podPortCode,
          modeType: srcRate.modeType,
          containerSummary: srcRate.containerSummary,
          serviceType: srcRate.serviceType,
          transitTimeDays: srcRate.transitTimeDays,
          freeTimeDemurrageDays: srcRate.freeTimeDemurrageDays,
          freeTimeDetentionDays: srcRate.freeTimeDetentionDays,
          paymentTerms: srcRate.paymentTerms,
          validFrom: srcRate.validFrom,
          validTo: srcRate.validTo,
          verificationStatus: srcRate.verificationStatus,
          rawAiOutput: srcRate.rawAiOutput,
          verifiedBy: srcRate.verifiedBy,
          verifiedAt: srcRate.verifiedAt,
        })
        .returning();

      if (!clonedRate) continue;

      const srcCharges = allCharges.filter((c) => c.rateRecordId === srcRate.id);
      if (srcCharges.length > 0) {
        await tx.insert(rateCharges).values(
          srcCharges.map((c) => ({
            rateRecordId: clonedRate.id,
            chargeCatalogId: c.chargeCatalogId,
            rawChargeName: c.rawChargeName,
            category: c.category,
            containerTypeRef: c.containerTypeRef,
            cellStatus: c.cellStatus,
            amount: c.amount,
            currency: c.currency,
            amountUsd: c.amountUsd,
            amountThb: c.amountThb,
            fxRateUsed: c.fxRateUsed,
            whtPercent: c.whtPercent,
            whtAmount: c.whtAmount,
            vatPercent: c.vatPercent,
            vatAmount: c.vatAmount,
            chargeUnit: c.chargeUnit,
            isIncluded: c.isIncluded,
            isExcluded: c.isExcluded,
            sourcePage: c.sourcePage,
            sourceTextSnippet: c.sourceTextSnippet,
            confidenceScore: c.confidenceScore,
            isVerified: c.isVerified,
          }))
        );
      }
    }

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: createdShipment.id,
      action: 'CREATE_COMPARISON_FROM_AGENT_COSTS',
      actorId: user.id,
      newState: {
        shipmentRef: createdShipment.shipmentRef,
        customerName: createdShipment.customerName,
        sourceRateRecordIds: uniqueIds,
      },
    });

    return {
      shipmentId: createdShipment.id,
      shipmentRef: createdShipment.shipmentRef,
    };
  });
}
