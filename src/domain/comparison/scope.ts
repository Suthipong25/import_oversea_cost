import Decimal from 'decimal.js';

export type ScopeGroupKey = 'Ocean' | 'Origin_Local' | 'Dest_Port' | 'TH_Local_Transport';
export type FxRoundingMode = 'EXACT' | 'CEIL_100';

export interface ScopeEvaluation {
  isFullyComparable: boolean;
  scopeMap: Record<ScopeGroupKey, 'COMPLETE' | 'MISSING'>;
  missingScopes: string[];
}

const SCOPE_LABELS: Record<ScopeGroupKey, string> = {
  Ocean: 'Ocean Freight',
  Origin_Local: 'Origin Pickup',
  Dest_Port: 'Dest Port',
  TH_Local_Transport: 'TH Local/Transport',
};

/**
 * Evaluates whether an Agent's rate covers all major cost scopes.
 * Prevents the "Partial Quote Trap" where an agent missing Ocean Freight
 * appears artificially cheapest.
 */
export function evaluateAgentScope(
  charges: Array<{
    category: string;
    cellStatus: string;
    amountThb: string | null;
    amountUsd: string | null;
  }>
): ScopeEvaluation {
  const populated = new Set<ScopeGroupKey>();

  for (const c of charges) {
    const hasVal =
      c.cellStatus === 'INCLUDED' ||
      c.cellStatus === 'NOT_APPLICABLE' ||
      (c.amountThb !== null && new Decimal(c.amountThb).gt(0)) ||
      (c.amountUsd !== null && new Decimal(c.amountUsd).gt(0));

    if (!hasVal) continue;

    if (
      c.category === 'Ocean' ||
      c.category === 'Origin_Local' ||
      c.category === 'Dest_Port' ||
      c.category === 'TH_Local_Transport'
    ) {
      populated.add(c.category);
    }
  }

  const keys: ScopeGroupKey[] = ['Ocean', 'Origin_Local', 'Dest_Port', 'TH_Local_Transport'];
  const scopeMap = {} as Record<ScopeGroupKey, 'COMPLETE' | 'MISSING'>;
  const missingScopes: string[] = [];

  for (const k of keys) {
    if (populated.has(k)) {
      scopeMap[k] = 'COMPLETE';
    } else {
      scopeMap[k] = 'MISSING';
      missingScopes.push(SCOPE_LABELS[k]);
    }
  }

  return {
    isFullyComparable: missingScopes.length === 0,
    scopeMap,
    missingScopes,
  };
}

/**
 * Returns the rate ID with the lowest total THB strictly among
 * Verified AND Scope-Complete rates (never crowns an incomplete quote).
 */
export function findLowestComparableRateId(
  rates: Array<{
    id: string;
    verificationStatus: string;
    totalAmountThb: string;
    isFullyComparable: boolean;
  }>
): string | null {
  const eligible = rates.filter(
    (r) =>
      r.verificationStatus === 'Verified' &&
      r.isFullyComparable &&
      new Decimal(r.totalAmountThb).gt(0)
  );

  if (eligible.length < 2) return null;

  let best = eligible[0]!;
  for (const r of eligible.slice(1)) {
    if (new Decimal(r.totalAmountThb).lt(new Decimal(best.totalAmountThb))) {
      best = r;
    }
  }
  return best.id;
}

/**
 * Explicit USD -> THB conversion using decimal.js (never silent).
 * Supports EXACT (2 decimals) or CEIL_100 (Perkin's upward rounding to nearest 100 THB).
 */
export function convertUsdToThb(
  amountUsd: string | number,
  fxRate: string | number,
  roundingMode: FxRoundingMode = 'EXACT'
): string {
  const usd = new Decimal(amountUsd);
  const rate = new Decimal(fxRate);
  if (!usd.isFinite() || !rate.isFinite() || rate.lte(0)) {
    throw new Error('Invalid USD amount or FX rate.');
  }

  const rawThb = usd.times(rate);
  if (roundingMode === 'CEIL_100') {
    const ceiled = rawThb.dividedBy(100).ceil().times(100);
    return ceiled.toFixed(4);
  }
  return rawThb.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4);
}
