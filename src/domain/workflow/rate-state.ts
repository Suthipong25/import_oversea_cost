import type { RateVerificationStatus } from './shipment-status';

export interface ComparableRateCandidate {
  id: string;
  verificationStatus: RateVerificationStatus;
  polPortCode: string;
  podPortCode: string;
  validTo: string | null; // YYYY-MM-DD
}

export interface ComparisonGuardResult {
  allowed: boolean;
  reasons: string[];
}

/**
 * Enforces Business Rules #3, #4, and Transition Guards:
 * - Minimum 2, maximum 5 suppliers
 * - Only Verified, unexpired rates may enter comparison
 * - POL and POD must match across all rates
 */
export function canEnterComparison(
  rates: ComparableRateCandidate[],
  todayIso: string
): ComparisonGuardResult {
  const reasons: string[] = [];

  if (rates.length < 2) {
    reasons.push('At least 2 verified supplier rates are required for comparison.');
  }
  if (rates.length > 5) {
    reasons.push('A maximum of 5 supplier rates can be compared at once.');
  }

  const unverified = rates.filter((r) => r.verificationStatus !== 'Verified');
  if (unverified.length > 0) {
    reasons.push('All rates must be human-verified before comparison.');
  }

  const expired = rates.filter((r) => r.validTo !== null && r.validTo < todayIso);
  if (expired.length > 0) {
    reasons.push('Expired supplier rates cannot enter a new comparison.');
  }

  const first = rates[0];
  if (first) {
    const routeMismatch = rates.some(
      (r) =>
        r.polPortCode.toUpperCase() !== first.polPortCode.toUpperCase() ||
        r.podPortCode.toUpperCase() !== first.podPortCode.toUpperCase()
    );
    if (routeMismatch) {
      reasons.push('All compared rates must have matching POL and POD ports.');
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
