import { and, eq, inArray } from 'drizzle-orm';
import { db, withUserContext } from '@/lib/db';
import {
  chargeAliases,
  chargeCatalog,
  costComparisonItems,
  costComparisons,
  rateCharges,
  rateRecords,
  shipments,
} from '@/lib/db/schema';
import { writeAuditLog } from '@/lib/audit/logger';
import { canViewAllShipments, hasPermission } from '@/lib/auth/rbac';
import type { AuthUser } from '@/lib/auth/session';
import { sumRateCharges } from '@/lib/ai/normalize';
import { convertUsdToThb, evaluateAgentScope } from '@/domain/comparison/scope';
import type {
  ApplyExplicitFxInput,
  MapUnmappedChargeInput,
  SelectWinningAgentInput,
} from './schema';

export async function selectWinningAgentForShipment(
  user: AuthUser,
  shipmentId: string,
  input: SelectWinningAgentInput
) {
  if (!hasPermission(user.role, 'comparisons:execute')) {
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

  const rates = await db
    .select()
    .from(rateRecords)
    .where(eq(rateRecords.shipmentId, shipmentId));

  const verifiedRates = rates.filter((r) => r.verificationStatus === 'Verified');
  if (verifiedRates.length < 2) {
    throw new Error('MIN_TWO_VERIFIED_RATES');
  }
  if (verifiedRates.length > 5) {
    throw new Error('MAX_FIVE_RATES');
  }

  const chosen = verifiedRates.find((r) => r.id === input.selectedRateRecordId);
  if (!chosen) {
    throw new Error('SELECTED_RATE_NOT_VERIFIED');
  }

  const rateIds = verifiedRates.map((r) => r.id);
  const allCharges = await db
    .select()
    .from(rateCharges)
    .where(inArray(rateCharges.rateRecordId, rateIds));

  return withUserContext(user, async (tx) => {
    // Supersede any previously active comparison for this shipment
    await tx
      .update(costComparisons)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(costComparisons.shipmentId, shipmentId), eq(costComparisons.isActive, true)));

    const [comparison] = await tx
      .insert(costComparisons)
      .values({
        shipmentId,
        status: 'Supplier_Selected',
        selectedRateRecordId: chosen.id,
        selectedBy: user.id,
        selectedAt: new Date(),
        selectionReason: input.selectionReason,
        comparisonNotes: input.comparisonNotes || null,
        isActive: true,
      })
      .returning();

    if (!comparison) throw new Error('Failed to create comparison snapshot');

    const itemRows = verifiedRates.map((r) => {
      const charges = allCharges.filter((c) => c.rateRecordId === r.id);
      const totals = sumRateCharges(charges);
      const scope = evaluateAgentScope(charges);

      return {
        costComparisonId: comparison.id,
        rateRecordId: r.id,
        isSelected: r.id === chosen.id,
        totalWhtThb: totals.whtThb,
        totalVatThb: totals.vatThb,
        totalAmountThb: totals.amountThb,
        totalAmountUsd: totals.amountUsd,
        isFullyComparable: scope.isFullyComparable,
        scopeCompletenessJson: scope.scopeMap,
        comparabilityNotes:
          scope.missingScopes.length > 0
            ? `Missing: ${scope.missingScopes.join(', ')}`
            : 'Complete',
      };
    });

    await tx.insert(costComparisonItems).values(itemRows);

    await writeAuditLog(tx, {
      entityType: 'shipment',
      entityId: shipmentId,
      action: 'SELECT_WINNING_AGENT',
      actorId: user.id,
      newState: {
        costComparisonId: comparison.id,
        selectedRateRecordId: chosen.id,
        selectionReason: input.selectionReason,
        comparedCount: verifiedRates.length,
      },
      reason: input.selectionReason,
    });

    return comparison;
  });
}

export async function mapUnmappedChargeForUser(
  user: AuthUser,
  rateRecordId: string,
  input: MapUnmappedChargeInput
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

  const [charge] = await db
    .select()
    .from(rateCharges)
    .where(and(eq(rateCharges.id, input.chargeId), eq(rateCharges.rateRecordId, rateRecordId)))
    .limit(1);
  if (!charge) throw new Error('NOT_FOUND');

  const [subject] = await db
    .select()
    .from(chargeCatalog)
    .where(eq(chargeCatalog.id, input.chargeCatalogId))
    .limit(1);
  if (!subject) throw new Error('NOT_FOUND');

  return withUserContext(user, async (tx) => {
    // If target subject already exists on this rate, merge values into existing row and drop unmapped duplicate
    const existingMapped = await tx
      .select()
      .from(rateCharges)
      .where(
        and(
          eq(rateCharges.rateRecordId, rateRecordId),
          eq(rateCharges.chargeCatalogId, subject.id)
        )
      )
      .limit(1);

    if (existingMapped[0] && existingMapped[0].id !== charge.id) {
      await tx
        .update(rateCharges)
        .set({
          amountThb: charge.amountThb ?? existingMapped[0].amountThb,
          amountUsd: charge.amountUsd ?? existingMapped[0].amountUsd,
          whtAmount: charge.whtAmount !== '0.0000' ? charge.whtAmount : existingMapped[0].whtAmount,
          vatAmount: charge.vatAmount !== '0.0000' ? charge.vatAmount : existingMapped[0].vatAmount,
          cellStatus: charge.cellStatus,
        })
        .where(eq(rateCharges.id, existingMapped[0].id));
      await tx.delete(rateCharges).where(eq(rateCharges.id, charge.id));
    } else {
      await tx
        .update(rateCharges)
        .set({
          chargeCatalogId: subject.id,
          category: subject.category,
        })
        .where(eq(rateCharges.id, charge.id));
    }

    if (input.learnAlias) {
      await tx
        .insert(chargeAliases)
        .values({
          chargeCatalogId: subject.id,
          aliasPattern: charge.rawChargeName.toUpperCase(),
          isConfirmed: true,
          createdBy: user.id,
        })
        .onConflictDoNothing({ target: chargeAliases.aliasPattern });
    }

    await writeAuditLog(tx, {
      entityType: rate.shipmentId ? 'shipment' : 'rate_record',
      entityId: rate.shipmentId ?? rateRecordId,
      action: 'MAP_CHARGE_SUBJECT',
      actorId: user.id,
      newState: {
        rawChargeName: charge.rawChargeName,
        mappedTo: subject.nameEn,
        learnedAlias: input.learnAlias,
      },
    });

    return { mappedTo: subject.nameEn };
  });
}

export async function applyExplicitFxToRate(
  user: AuthUser,
  rateRecordId: string,
  input: ApplyExplicitFxInput
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

  const charges = await db
    .select()
    .from(rateCharges)
    .where(eq(rateCharges.rateRecordId, rateRecordId));

  const targets = charges.filter(
    (c) =>
      c.cellStatus === 'QUOTED' &&
      c.amountUsd !== null &&
      (input.overwriteExisting || c.amountThb === null)
  );

  if (targets.length === 0) {
    return { convertedCount: 0 };
  }

  return withUserContext(user, async (tx) => {
    for (const c of targets) {
      const convertedThb = convertUsdToThb(c.amountUsd!, input.fxRate, input.roundingMode);
      await tx
        .update(rateCharges)
        .set({
          amountThb: convertedThb,
          fxRateUsed: input.fxRate.toFixed(4),
        })
        .where(eq(rateCharges.id, c.id));
    }

    if (rate.verificationStatus === 'Verified') {
      await tx
        .update(rateRecords)
        .set({ verificationStatus: 'Awaiting_Verification', updatedAt: new Date() })
        .where(eq(rateRecords.id, rateRecordId));
    }

    await writeAuditLog(tx, {
      entityType: rate.shipmentId ? 'shipment' : 'rate_record',
      entityId: rate.shipmentId ?? rateRecordId,
      action: 'APPLY_EXPLICIT_FX',
      actorId: user.id,
      newState: {
        rateRecordId,
        fxRate: input.fxRate,
        roundingMode: input.roundingMode,
        convertedCount: targets.length,
      },
    });

    return { convertedCount: targets.length };
  });
}
