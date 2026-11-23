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
 * ประเมินความครบถ้วนของหมวดค่าใช้จ่าย (4 หมวดหลัก) ในใบราคาของ Agent แต่ละเจ้า:
 * Ocean Freight / Origin Pickup / Dest Port / TH Local & Transport
 *
 * เหตุผลทางธุรกิจ: ป้องกันกับดัก "Partial Quote Trap" ที่ Agent บางเจ้าส่งราคามาไม่ครบทุกหมวด
 * (เช่น ไม่ได้ใส่ค่าระวางเรือ Ocean) ทำให้ยอดรวมดูถูกที่สุดแบบหลอกตา
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
    // ถือว่าหมวดนี้ "มีข้อมูลแล้ว" หากระบุว่ารวมแล้ว (INCLUDED), ไม่คิด (NOT_APPLICABLE) หรือมีตัวเลข > 0
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
 * หา ID ของ Agent ที่ยอดรวม THB ต่ำที่สุดเพื่อติดป้าย "ต่ำสุด"
 * กฎ: คัดเฉพาะเจ้าที่ Verified และครบทั้ง 4 หมวดเท่านั้น (และต้องมีคู่เทียบอย่างน้อย 2 เจ้า)
 * เพื่อไม่ให้ติดป้าย "ต่ำสุด" ให้ใบราคาที่ขาดหมวดสำคัญ
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
 * แปลงเงิน USD -> THB ด้วย decimal.js (หลีกเลี่ยงความคลาดเคลื่อนของ floating-point)
 * - EXACT: คูณตามอัตราแลกเปลี่ยนแล้วปัดทศนิยม 2 ตำแหน่ง
 * - CEIL_100: สูตรปัดขึ้นหลักร้อยของ Perkin เช่น 75,735 -> 75,800.0000
 * คืนค่าเป็นสตริงทศนิยม 4 ตำแหน่งให้ตรงกับคอลัมน์ numeric(18,4) ใน PostgreSQL
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

/**
 * ดึงตัวคูณจำนวน/ปริมาตร (Multiplier) จากข้อความ "ขนาดตู้ / Volume" เช่น:
 * - "LCL · 3 CBM" -> 3
 * - "4 CBM" / "4 R/T" / "2.5 W/M" -> 4 / 2.5
 * - "2×40DV" -> 2
 * - "1×40DV" / "40DV" -> 1
 * - "3" -> 3
 */
export function parseVolumeMultiplierFromSummary(summary: string | null | undefined): number {
  if (!summary) return 1;
  const raw = summary.trim();
  if (!raw) return 1;

  // 1. กรณีระบุหน่วยปริมาตรชัดเจน เช่น "LCL · 3 CBM", "3 cbm", "4 R/T", "2.5 W/M", "3 คิว"
  const volMatch = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:cbm|m3|r\/?t|w\/?m|wlm|คิว)\b/i);
  if (volMatch?.[1]) {
    const val = Number(volMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  // 2. กรณีระบุจำนวนตู้แบบ "2×40DV" หรือ "1×40DV + 2×20GP"
  const cntrMatches = [
    ...raw.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*[x×*]\s*(?:20|40|45)\s*(?:GP|DV|HQ|HC|RF|OT|FR)?/gi),
  ];
  if (cntrMatches.length > 0) {
    const totalQty = cntrMatches.reduce((sum, m) => sum + (Number(m[1]) || 0), 0);
    if (totalQty > 0) return totalQty;
  }

  // 3. ลบชื่อขนาดตู้มาตรฐานออกก่อน (เช่น 20GP, 40DV, 40HQ, 45HQ, 20RF, 40RF, 20', 40') เพื่อไม่ให้เลข 20/40 ถูกเข้าใจผิดเป็นตัวคูณ
  const cleaned = raw.replace(/\b(?:20|40|45)\s*(?:GP|DV|HQ|HC|RF|OT|FR|'|ft)\b/gi, '').trim();

  // 4. ดึงตัวเลขที่เหลือในช่อง (เช่น "LCL 3", "3", "×3", "*3")
  const numMatch = cleaned.match(/([0-9]+(?:\.[0-9]+)?)/);
  if (numMatch?.[1]) {
    const val = Number(numMatch[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }

  return 1;
}

/**
 * ตรวจสอบว่ารายการค่าใช้จ่ายนี้เป็นหมวด Destination Charge (ปลายทาง / Dest_Port) หรือไม่
 * กฎทางธุรกิจ: Destination Charge ต้องคงค่าเดิมตามที่ใส่ไว้เสมอ ต่อให้จำนวนของ/ปริมาตรเพิ่มขึ้น
 */
export function isDestinationCharge(rawChargeName: string, category?: string | null): boolean {
  if (category === 'Dest_Port') return true;
  if (category && category !== 'Other') return false;

  return /\b(?:dest\b|destination|dthc|trml\s*handlg|terminal\s*handling|thc\b|d\/?o\s*fee|delivery\s*order|eqpt\s*cleaning|container\s*cleaning|cleaning\s*fee|equipment\s*maintenance|maintenance\s*premium|emp\b|cis\s*\/\s*cic|\bcis\b|\bcic\b|cfs\b|seal\s*fee|\bseal\b|e-seal|fac\b|status\s*fee|pcs\b|port\s*congestion)\b/i.test(
    rawChargeName
  );
}
