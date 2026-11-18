import { createHash } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db, withUserContext } from '@/lib/db';
import {
  auditLogs,
  chargeAliases,
  chargeCatalog,
  costComparisons,
  processingJobs,
  rateCharges,
  rateRecords,
  sellingRateCharges,
  sellingRates,
  shipmentContainers,
  shipments,
  sourceDocuments,
  suppliers,
  users,
} from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { canViewAllShipments, hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import { runExtractionPipeline } from '@/lib/ai/extract';
import { getLiveUsdToThbRate } from '@/lib/fx/live-rate';
import { matchChargeToCatalog, parseMoneyInput, sumRateCharges } from '@/lib/ai/normalize';
import { evaluateAgentScope, findLowestComparableRateId } from '@/domain/comparison/scope';
import {
  savePrivateFile,
  signDocumentUrl,
  validateFileMagicBytes,
} from '@/lib/storage/local';
import { findOrCreateAgentByName } from '@/modules/suppliers/service';
import type { CopyBaselineRowInput, CreateCatalogSubjectInput, UpsertRateChargeInput } from './schema';

export async function getShipmentWorkspaceData(user: AuthUser, shipmentId: string) {
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
      targetEtd: shipments.targetEtd,
      assignedUserId: shipments.assignedUserId,
      assignedUserName: users.fullName,
      createdAt: shipments.createdAt,
    })
    .from(shipments)
    .innerJoin(users, eq(shipments.assignedUserId, users.id))
    .where(eq(shipments.id, shipmentId))
    .limit(1);

  if (!shipment) return null;
  if (!canViewAllShipments(user.role) && shipment.assignedUserId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  const [containers, catalogRows, supplierRows, rateRows, fxSnapshot, timeline, activeCompRows] =
    await Promise.all([
      db.select().from(shipmentContainers).where(eq(shipmentContainers.shipmentId, shipmentId)),
      db.select().from(chargeCatalog).where(eq(chargeCatalog.isActive, true)).orderBy(asc(chargeCatalog.displayOrder)),
      db.select().from(suppliers).where(eq(suppliers.isActive, true)).orderBy(asc(suppliers.name)),
      db
        .select({
          id: rateRecords.id,
          supplierId: rateRecords.supplierId,
          agentName: suppliers.name,
          sourceDocumentId: rateRecords.sourceDocumentId,
          verificationStatus: rateRecords.verificationStatus,
          validTo: rateRecords.validTo,
          rateRef: rateRecords.rateRef,
          rawAiOutput: rateRecords.rawAiOutput,
          createdAt: rateRecords.createdAt,
        })
        .from(rateRecords)
        .innerJoin(suppliers, eq(rateRecords.supplierId, suppliers.id))
        .where(eq(rateRecords.shipmentId, shipmentId))
        .orderBy(asc(rateRecords.createdAt)),
      getLiveUsdToThbRate(),
      db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          actorName: users.fullName,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .innerJoin(users, eq(auditLogs.actorId, users.id))
        .where(eq(auditLogs.entityId, shipmentId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(30),
      db
        .select({
          id: costComparisons.id,
          status: costComparisons.status,
          selectedRateRecordId: costComparisons.selectedRateRecordId,
          selectionReason: costComparisons.selectionReason,
          selectedAt: costComparisons.selectedAt,
        })
        .from(costComparisons)
        .where(and(eq(costComparisons.shipmentId, shipmentId), eq(costComparisons.isActive, true)))
        .limit(1),
    ]);

  const rateIds = rateRows.map((r) => r.id);
  const docIds = rateRows
    .map((r) => r.sourceDocumentId)
    .filter((id): id is string => Boolean(id));

  const [chargeRows, docRows] = await Promise.all([
    rateIds.length > 0
      ? db.select().from(rateCharges).where(inArray(rateCharges.rateRecordId, rateIds))
      : Promise.resolve([]),
    docIds.length > 0
      ? db.select().from(sourceDocuments).where(inArray(sourceDocuments.id, docIds))
      : Promise.resolve([]),
  ]);

  const docMap = new Map(docRows.map((d) => [d.id, d]));

  const ratesWithDetails = rateRows.map((rate) => {
    const charges = chargeRows.filter((c) => c.rateRecordId === rate.id);
    const doc = rate.sourceDocumentId ? docMap.get(rate.sourceDocumentId) : undefined;
    const totals = sumRateCharges(charges);
    const scope = evaluateAgentScope(charges);
    const rawMeta = rate.rawAiOutput as { warnings?: string[]; provider?: string } | null;

    return {
      id: rate.id,
      supplierId: rate.supplierId,
      agentName: rate.agentName,
      verificationStatus: rate.verificationStatus,
      validTo: rate.validTo,
      rateRef: rate.rateRef,
      warnings: rawMeta?.warnings ?? [],
      extractionProvider: rawMeta?.provider ?? null,
      sourceDocument: doc
        ? {
            id: doc.id,
            fileName: doc.fileName,
            fileType: doc.fileType,
            mimeType: doc.mimeType,
            rawTextContent: doc.rawTextContent,
            signedUrl: doc.storagePath ? signDocumentUrl(doc.id) : null,
          }
        : null,
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
      totals,
      scope,
    };
  });

  const lowestComparableRateId = findLowestComparableRateId(
    ratesWithDetails.map((r) => ({
      id: r.id,
      verificationStatus: r.verificationStatus,
      totalAmountThb: r.totals.amountThb,
      isFullyComparable: r.scope.isFullyComparable,
    }))
  );

  return {
    shipment,
    containers,
    catalog: catalogRows,
    agents: supplierRows,
    fxRateUsdToThb: fxSnapshot.rateFixed,
    fxSnapshot,
    rates: ratesWithDetails,
    lowestComparableRateId,
    activeComparison: activeCompRows[0] ?? null,
    timeline,
  };
}

export interface IngestRateParams {
  shipmentId: string;
  agentName: string;
  file?: { name: string; buffer: Buffer } | null;
  pastedText?: string | null;
}

export async function ingestRateForShipment(user: AuthUser, params: IngestRateParams) {
  if (!hasPermission(user.role, 'rates:ingest')) {
    throw new Error('FORBIDDEN');
  }

  const [shipment] = await db
    .select()
    .from(shipments)
    .where(eq(shipments.id, params.shipmentId))
    .limit(1);

  if (!shipment) {
    throw new Error('NOT_FOUND');
  }
  if (!canViewAllShipments(user.role) && shipment.assignedUserId !== user.id) {
    throw new Error('FORBIDDEN');
  }

  const existingRates = await db
    .select({ id: rateRecords.id })
    .from(rateRecords)
    .where(eq(rateRecords.shipmentId, params.shipmentId));

  if (existingRates.length >= 5) {
    throw new Error('MAX_AGENTS_REACHED');
  }

  // Validate uploaded file or pasted text
  let fileType: 'PDF' | 'IMAGE' | 'PASTED_TEXT' = 'PASTED_TEXT';
  let mimeType = 'text/plain';
  let fileName = 'Pasted_Chat_Text.txt';
  let fileSize: number | null = null;
  let storagePath: string | null = null;
  let sha256 = '';
  let fileBuffer: Buffer | undefined;

  if (params.file && params.file.buffer.length > 0) {
    const validated = validateFileMagicBytes(params.file.buffer);
    fileType = validated.fileType;
    mimeType = validated.mimeType;
    fileName = params.file.name || `upload.${validated.extension}`;
    fileSize = validated.size;
    sha256 = validated.sha256;
    fileBuffer = params.file.buffer;
    storagePath = await savePrivateFile(params.shipmentId, params.file.buffer, validated);
  } else if (params.pastedText && params.pastedText.trim().length > 0) {
    const cleanText = params.pastedText.trim();
    fileSize = Buffer.byteLength(cleanText, 'utf8');
    sha256 = createHash('sha256').update(cleanText).digest('hex');
  } else {
    throw new Error('EMPTY_INPUT');
  }

  // Duplicate check on same shipment
  const duplicateDocs = await db
    .select({ id: sourceDocuments.id, fileName: sourceDocuments.fileName })
    .from(sourceDocuments)
    .where(
      and(
        eq(sourceDocuments.shipmentId, params.shipmentId),
        eq(sourceDocuments.fileHashSha256, sha256)
      )
    )
    .limit(1);

  const duplicateWarning = duplicateDocs[0]
    ? `พบไฟล์/ข้อความซ้ำกับที่อัปโหลดไว้ก่อนหน้า (${duplicateDocs[0].fileName})`
    : null;

  const agent = await findOrCreateAgentByName(user, params.agentName);

  const [catalogRows, aliasRows, fxSnapshot] = await Promise.all([
    db.select().from(chargeCatalog).where(eq(chargeCatalog.isActive, true)),
    db.select().from(chargeAliases),
    getLiveUsdToThbRate(),
  ]);

  const fxRateNum = fxSnapshot.rate;

  // Execute AI / unpdf / deterministic extraction pipeline
  const extraction = await runExtractionPipeline({
    fileType,
    mimeType,
    fileBuffer,
    pastedText: params.pastedText ?? undefined,
    fxRateUsdToThb: fxRateNum,
  });

  if (duplicateWarning) {
    extraction.result.warnings.unshift(duplicateWarning);
  }

  return withUserContext(user, async (tx) => {
    const [doc] = await tx
      .insert(sourceDocuments)
      .values({
        shipmentId: params.shipmentId,
        supplierId: agent.id,
        fileName,
        fileType,
        mimeType,
        fileSize,
        storagePath,
        fileHashSha256: sha256,
        rawTextContent: extraction.extractedTextLayer ?? params.pastedText ?? null,
        extractionStatus: 'Extracted',
        createdBy: user.id,
      })
      .returning();

    if (!doc) throw new Error('Failed to store source document');

    await tx
      .insert(processingJobs)
      .values({
        jobType: 'AI_EXTRACTION',
        status: 'COMPLETED',
        idempotencyKey: `${params.shipmentId}:${doc.id}:${sha256.slice(0, 16)}`,
        payload: { fileName, fileType, agentName: agent.name },
        result: {
          provider: extraction.provider,
          model: extraction.model,
          chargeCount: extraction.result.charges.length,
        },
        attempts: 1,
      })
      .onConflictDoNothing();

    const [rate] = await tx
      .insert(rateRecords)
      .values({
        shipmentId: params.shipmentId,
        sourceDocumentId: doc.id,
        supplierId: agent.id,
        shippingLineName: extraction.result.shippingLine,
        rateRef: extraction.result.rateReference,
        polPortCode: shipment.polPortCode,
        podPortCode: shipment.podPortCode,
        validFrom: extraction.result.validFrom,
        validTo: extraction.result.validTo,
        transitTimeDays: extraction.result.transitTimeDays,
        verificationStatus: 'Awaiting_Verification',
        rawAiOutput: {
          provider: extraction.provider,
          model: extraction.model,
          warnings: extraction.result.warnings,
          extractedAt: new Date().toISOString(),
          raw: extraction.result,
        },
      })
      .returning();

    if (!rate) throw new Error('Failed to create rate record');

    // Normalize extracted charges against charge_catalog & aliases
    if (extraction.result.charges.length > 0) {
      const chargeValues = extraction.result.charges.map((ch) => {
        const matched = matchChargeToCatalog(ch.rawChargeName, catalogRows, aliasRows);
        const amountThb = parseMoneyInput(ch.amountThb);
        const amountUsd = parseMoneyInput(ch.amountUsd);
        const whtAmount = parseMoneyInput(ch.whtAmount) ?? '0.0000';
        const vatAmount = parseMoneyInput(ch.vatAmount) ?? '0.0000';

        return {
          rateRecordId: rate.id,
          chargeCatalogId: matched?.id ?? null,
          rawChargeName: ch.rawChargeName,
          category: matched?.category ?? ch.categoryHint,
          cellStatus: ch.cellStatus,
          amount: amountThb ?? amountUsd,
          currency: amountUsd ? 'USD' : amountThb ? 'THB' : null,
          amountUsd,
          amountThb,
          whtPercent: matched?.defaultWhtPercent ?? '0.00',
          whtAmount,
          vatPercent: matched?.defaultVatPercent ?? '0.00',
          vatAmount,
          chargeUnit: ch.chargeUnit ?? 'PER_SHIPMENT',
          sourcePage: ch.sourcePage ?? 1,
          sourceTextSnippet: ch.sourceTextSnippet,
          confidenceScore: ch.confidenceScore.toFixed(3),
          isVerified: false,
        };
      });

      await tx.insert(rateCharges).values(chargeValues);
    }

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: params.shipmentId,
      action: 'INGEST_AGENT_RATE',
      actorId: user.id,
      newState: {
        rateRecordId: rate.id,
        agentName: agent.name,
        fileName,
        provider: extraction.provider,
        extractedCharges: extraction.result.charges.length,
      },
    });

    return {
      rateRecordId: rate.id,
      agentName: agent.name,
      warnings: extraction.result.warnings,
      extractedCharges: extraction.result.charges.length,
    };
  });
}

export async function upsertRateChargeForUser(
  user: AuthUser,
  rateRecordId: string,
  input: UpsertRateChargeInput
) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const [rate] = await db
    .select()
    .from(rateRecords)
    .where(eq(rateRecords.id, rateRecordId))
    .limit(1);

  if (!rate) throw new Error('NOT_FOUND');

  const isNA = input.cellStatus === 'NOT_APPLICABLE';
  const whtAmount = isNA ? '0.0000' : (parseMoneyInput(input.whtAmount) ?? '0.0000');
  const vatAmount = isNA ? '0.0000' : (parseMoneyInput(input.vatAmount) ?? '0.0000');
  const amountThb = isNA ? null : parseMoneyInput(input.amountThb);
  const amountUsd = isNA ? null : parseMoneyInput(input.amountUsd);

  return withUserContext(user, async (tx) => {
    let existing = null;
    if (input.chargeId) {
      const found = await tx
        .select()
        .from(rateCharges)
        .where(and(eq(rateCharges.id, input.chargeId), eq(rateCharges.rateRecordId, rateRecordId)))
        .limit(1);
      existing = found[0] ?? null;
    } else if (input.chargeCatalogId) {
      const found = await tx
        .select()
        .from(rateCharges)
        .where(
          and(
            eq(rateCharges.rateRecordId, rateRecordId),
            eq(rateCharges.chargeCatalogId, input.chargeCatalogId)
          )
        )
        .limit(1);
      existing = found[0] ?? null;
    }

    const isBlankRow =
      !isNA &&
      whtAmount === '0.0000' &&
      vatAmount === '0.0000' &&
      amountThb === null &&
      amountUsd === null;

    if (existing && isBlankRow) {
      await tx.delete(rateCharges).where(eq(rateCharges.id, existing.id));
    } else if (existing) {
      await tx
        .update(rateCharges)
        .set({
          cellStatus: input.cellStatus,
          whtAmount,
          vatAmount,
          amountThb,
          amountUsd,
          amount: amountThb ?? amountUsd,
          currency: amountUsd ? 'USD' : amountThb ? 'THB' : null,
          chargeCatalogId: input.chargeCatalogId ?? existing.chargeCatalogId,
          rawChargeName: input.rawChargeName,
        })
        .where(eq(rateCharges.id, existing.id));
    } else if (!isBlankRow) {
      await tx.insert(rateCharges).values({
        rateRecordId,
        chargeCatalogId: input.chargeCatalogId ?? null,
        rawChargeName: input.rawChargeName,
        category: input.category,
        cellStatus: input.cellStatus,
        whtAmount,
        vatAmount,
        amountThb,
        amountUsd,
        amount: amountThb ?? amountUsd,
        currency: amountUsd ? 'USD' : amountThb ? 'THB' : null,
        isVerified: false,
      });
    }

    // Per Workflow FSM: editing a Verified rate returns it to Awaiting_Verification
    // and cascades Needs_Review to any active Supplier_Selected comparison
    if (rate.verificationStatus === 'Verified') {
      await tx
        .update(rateRecords)
        .set({ verificationStatus: 'Awaiting_Verification', updatedAt: new Date() })
        .where(eq(rateRecords.id, rateRecordId));

      if (rate.shipmentId) {
        await tx
          .update(costComparisons)
          .set({ status: 'Needs_Review', updatedAt: new Date() })
          .where(
            and(
              eq(costComparisons.shipmentId, rate.shipmentId),
              eq(costComparisons.isActive, true),
              eq(costComparisons.selectedRateRecordId, rateRecordId)
            )
          );

        await tx
          .update(sellingRates)
          .set({
            status: 'Needs_Review',
            approvedBy: null,
            approvedAt: null,
            snapshotData: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sellingRates.shipmentId, rate.shipmentId),
              eq(sellingRates.isActive, true),
              eq(sellingRates.selectedRateRecordId, rateRecordId)
            )
          );
      }
    }

    if (input.learnAlias && input.chargeCatalogId && input.rawChargeName) {
      await tx
        .insert(chargeAliases)
        .values({
          chargeCatalogId: input.chargeCatalogId,
          aliasPattern: input.rawChargeName.toUpperCase(),
          isConfirmed: true,
          createdBy: user.id,
        })
        .onConflictDoNothing();
    }

    await writeAuditLog(tx, {
      entityType: rate.shipmentId ? 'shipment' : 'rate_record',
      entityId: rate.shipmentId ?? rateRecordId,
      action: 'EDIT_RATE_CHARGE',
      actorId: user.id,
      newState: {
        rateRecordId,
        rawChargeName: input.rawChargeName,
        cellStatus: input.cellStatus,
        whtAmount,
        vatAmount,
        amountThb,
        amountUsd,
      },
    });

    return { updated: true };
  });
}

export async function verifyRateRecordForUser(user: AuthUser, rateRecordId: string) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const [rate] = await db
    .select()
    .from(rateRecords)
    .where(eq(rateRecords.id, rateRecordId))
    .limit(1);

  if (!rate) throw new Error('NOT_FOUND');

  return withUserContext(user, async (tx) => {
    const now = new Date();
    await tx
      .update(rateRecords)
      .set({
        verificationStatus: 'Verified',
        verifiedBy: user.id,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(rateRecords.id, rateRecordId));

    await tx
      .update(rateCharges)
      .set({ isVerified: true })
      .where(eq(rateCharges.rateRecordId, rateRecordId));

    await writeAuditLog(tx, {
      entityType: rate.shipmentId ? 'shipment' : 'rate_record',
      entityId: rate.shipmentId ?? rateRecordId,
      action: 'VERIFY_RATE',
      actorId: user.id,
      previousState: { verificationStatus: rate.verificationStatus },
      newState: { rateRecordId, verificationStatus: 'Verified' },
    });

    return { verified: true };
  });
}

export async function deleteRateRecordForUser(user: AuthUser, rateRecordId: string) {
  if (!hasPermission(user.role, 'rates:ingest')) {
    throw new Error('FORBIDDEN');
  }

  const [rate] = await db
    .select()
    .from(rateRecords)
    .where(eq(rateRecords.id, rateRecordId))
    .limit(1);

  if (!rate) throw new Error('NOT_FOUND');

  return withUserContext(user, async (tx) => {
    await tx.delete(rateRecords).where(eq(rateRecords.id, rateRecordId));
    await writeAuditLog(tx, {
      entityType: rate.shipmentId ? 'shipment' : 'rate_record',
      entityId: rate.shipmentId ?? rateRecordId,
      action: 'DELETE_RATE',
      actorId: user.id,
      previousState: { rateRecordId, supplierId: rate.supplierId },
      newState: { deleted: true },
    });
    return { deleted: true };
  });
}

export async function copyRowAcrossShipmentRates(
  user: AuthUser,
  shipmentId: string,
  input: CopyBaselineRowInput
) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const rates = await db
    .select({ id: rateRecords.id })
    .from(rateRecords)
    .where(eq(rateRecords.shipmentId, shipmentId));

  if (rates.length === 0) return { copiedCount: 0 };

  const whtAmount = parseMoneyInput(input.whtAmount) ?? '0.0000';
  const vatAmount = parseMoneyInput(input.vatAmount) ?? '0.0000';
  const amountThb = parseMoneyInput(input.amountThb);
  const amountUsd = parseMoneyInput(input.amountUsd);

  return withUserContext(user, async (tx) => {
    for (const r of rates) {
      const existing = await tx
        .select({ id: rateCharges.id })
        .from(rateCharges)
        .where(
          and(
            eq(rateCharges.rateRecordId, r.id),
            eq(rateCharges.chargeCatalogId, input.chargeCatalogId)
          )
        )
        .limit(1);

      if (existing[0]) {
        await tx
          .update(rateCharges)
          .set({
            cellStatus: 'QUOTED',
            whtAmount,
            vatAmount,
            amountThb,
            amountUsd,
            amount: amountThb ?? amountUsd,
            currency: amountUsd ? 'USD' : amountThb ? 'THB' : null,
          })
          .where(eq(rateCharges.id, existing[0].id));
      } else {
        await tx.insert(rateCharges).values({
          rateRecordId: r.id,
          chargeCatalogId: input.chargeCatalogId,
          rawChargeName: input.rawChargeName,
          category: input.category,
          cellStatus: 'QUOTED',
          whtAmount,
          vatAmount,
          amountThb,
          amountUsd,
          amount: amountThb ?? amountUsd,
          currency: amountUsd ? 'USD' : amountThb ? 'THB' : null,
          isVerified: false,
        });
      }
    }

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: shipmentId,
      action: 'COPY_ROW_ALL_AGENTS',
      actorId: user.id,
      newState: {
        rawChargeName: input.rawChargeName,
        amountThb,
        amountUsd,
        agentCount: rates.length,
      },
    });

    return { copiedCount: rates.length };
  });
}

export async function createCatalogSubjectForUser(
  user: AuthUser,
  input: CreateCatalogSubjectInput
) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const maxOrderRows = await db
    .select({ displayOrder: chargeCatalog.displayOrder })
    .from(chargeCatalog)
    .orderBy(desc(chargeCatalog.displayOrder))
    .limit(1);

  const nextOrder = (maxOrderRows[0]?.displayOrder ?? 290) + 10;
  const code = `CUSTOM_${Date.now().toString(36).toUpperCase()}`;

  return withUserContext(user, async (tx) => {
    const [created] = await tx
      .insert(chargeCatalog)
      .values({
        code,
        nameEn: input.nameEn,
        nameTh: input.nameTh || null,
        category: input.category,
        defaultWhtPercent: Number(input.defaultWhtPercent ?? 0).toFixed(2),
        isSectionHeader: input.isSectionHeader,
        displayOrder: nextOrder,
        isActive: true,
      })
      .returning();

    if (!created) throw new Error('Failed to create subject');

    const cleanAliases = Array.from(
      new Set((input.aliases ?? []).map((a) => a.trim().toUpperCase()).filter(Boolean))
    );
    for (const pattern of cleanAliases) {
      await tx
        .insert(chargeAliases)
        .values({
          chargeCatalogId: created.id,
          aliasPattern: pattern,
          isConfirmed: true,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: chargeAliases.aliasPattern });
    }

    await writeAuditLog(tx, {
      entityType: 'charge_catalog',
      entityId: created.id,
      action: 'CREATE_SUBJECT',
      actorId: user.id,
      newState: { code: created.code, nameEn: created.nameEn, aliases: cleanAliases },
    });

    return created;
  });
}

export async function updateCatalogSubjectForUser(
  user: AuthUser,
  subjectId: string,
  input: CreateCatalogSubjectInput
) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(chargeCatalog)
    .where(eq(chargeCatalog.id, subjectId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  const cleanAliases = Array.from(
    new Set((input.aliases ?? []).map((a) => a.trim().toUpperCase()).filter(Boolean))
  );

  return withUserContext(user, async (tx) => {
    const [updated] = await tx
      .update(chargeCatalog)
      .set({
        nameEn: input.nameEn,
        nameTh: input.nameTh || null,
        category: input.category,
        defaultWhtPercent: Number(input.defaultWhtPercent ?? 0).toFixed(2),
        isSectionHeader: input.isSectionHeader,
      })
      .where(eq(chargeCatalog.id, subjectId))
      .returning();

    await tx.delete(chargeAliases).where(eq(chargeAliases.chargeCatalogId, subjectId));
    for (const pattern of cleanAliases) {
      await tx
        .insert(chargeAliases)
        .values({
          chargeCatalogId: subjectId,
          aliasPattern: pattern,
          isConfirmed: true,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: chargeAliases.aliasPattern });
    }

    await writeAuditLog(tx, {
      entityType: 'charge_catalog',
      entityId: subjectId,
      action: 'UPDATE_SUBJECT',
      actorId: user.id,
      previousState: { nameEn: existing.nameEn, category: existing.category },
      newState: { nameEn: input.nameEn, category: input.category, aliases: cleanAliases },
    });

    return updated;
  });
}

export async function deleteCatalogSubjectForUser(user: AuthUser, subjectId: string) {
  if (!hasPermission(user.role, 'rates:verify')) {
    throw new Error('FORBIDDEN');
  }

  const [existing] = await db
    .select()
    .from(chargeCatalog)
    .where(eq(chargeCatalog.id, subjectId))
    .limit(1);

  if (!existing) throw new Error('NOT_FOUND');

  return withUserContext(user, async (tx) => {
    // Detach nullable references cleanly so historical rate records preserve their rawChargeName
    await tx
      .update(rateCharges)
      .set({ chargeCatalogId: null })
      .where(eq(rateCharges.chargeCatalogId, subjectId));

    await tx
      .update(sellingRateCharges)
      .set({ chargeCatalogId: null })
      .where(eq(sellingRateCharges.chargeCatalogId, subjectId));

    await tx.delete(chargeAliases).where(eq(chargeAliases.chargeCatalogId, subjectId));
    await tx.delete(chargeCatalog).where(eq(chargeCatalog.id, subjectId));

    await writeAuditLog(tx, {
      entityType: 'charge_catalog',
      entityId: subjectId,
      action: 'DELETE_SUBJECT',
      actorId: user.id,
      previousState: { code: existing.code, nameEn: existing.nameEn },
      newState: { deleted: true },
    });

    return { deleted: true, id: subjectId };
  });
}
