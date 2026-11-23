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
 * ตัวตรวจสอบเงื่อนไขก่อนนำใบราคาเข้าตารางเปรียบเทียบ (Compare Cost Guards):
 * 1. ต้องมีอย่างน้อย 2 เจ้า และไม่เกิน 5 เจ้าต่อ 1 งาน
 * 2. ทุกใบราคาต้องผ่านการตรวจสอบ (Verified) แล้วเท่านั้น
 * 3. ห้ามนำใบราคาที่หมดอายุแล้ว (validTo < วันนี้) เข้ามาเทียบ
 * 4. เส้นทางต้นทาง (POL) และปลายทาง (POD) ต้องตรงกันทุกเจ้า
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
