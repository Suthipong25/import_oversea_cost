import Decimal from 'decimal.js';

export interface CatalogItemRef {
  id: string;
  code: string;
  nameEn: string;
  category: string;
  isSectionHeader: boolean;
  defaultWhtPercent: string;
  defaultVatPercent: string;
}

export interface AliasRef {
  chargeCatalogId: string | null;
  aliasPattern: string;
}

export interface RateChargeTotals {
  whtThb: string;
  vatThb: string;
  amountThb: string;
  amountUsd: string;
}

function normalizeKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9\u0E00-\u0E7F]+/g, ' ')
    .trim();
}

/**
 * จับคู่ชื่อค่าใช้จ่ายดิบจากใบราคา Agent (เช่น "Dest THC", "40'HC") เข้ากับหัวข้อมาตรฐาน 38 รายการ
 * เรียงลำดับความแม่นยำ 4 ขั้น:
 *   1) ตรงกับคำย่อ (Alias) แบบ Exact Match
 *   2) ตรงกับชื่อภาษาอังกฤษหรือรหัสใน Master Catalog แบบ Exact Match
 *   3) ค้นหาคำย่อแบบ Substring (เรียงจากคำยาวไปสั้นเพื่อกันคำสั้นอย่าง "BL" จับผิดแถว)
 *   4) ค้นหาชื่อใน Master Catalog แบบ Substring (เฉพาะชื่อยาว >= 4 ตัวอักษร)
 * หากไม่เจอเลยจะคืน null เพื่อแสดงเป็นรายการ Unmapped ให้ผู้ใช้จับคู่เองได้
 */
export function matchChargeToCatalog(
  rawChargeName: string,
  catalog: CatalogItemRef[],
  aliases: AliasRef[]
): CatalogItemRef | null {
  const normRaw = normalizeKey(rawChargeName);
  if (!normRaw) return null;

  // 1. Exact alias match
  for (const a of aliases) {
    if (!a.chargeCatalogId) continue;
    if (normalizeKey(a.aliasPattern) === normRaw) {
      const hit = catalog.find((c) => c.id === a.chargeCatalogId && !c.isSectionHeader);
      if (hit) return hit;
    }
  }

  // 2. Exact catalog name or code match
  for (const c of catalog) {
    if (c.isSectionHeader) continue;
    if (normalizeKey(c.nameEn) === normRaw || normalizeKey(c.code) === normRaw) {
      return c;
    }
  }

  // 3. Substring containment against confirmed aliases (longest pattern first to avoid false hits)
  const sortedAliases = [...aliases]
    .filter((a) => a.chargeCatalogId && normalizeKey(a.aliasPattern).length >= 2)
    .sort((a, b) => b.aliasPattern.length - a.aliasPattern.length);

  for (const a of sortedAliases) {
    const pattern = normalizeKey(a.aliasPattern);
    if (normRaw.includes(pattern) || (normRaw.length >= 4 && pattern.includes(normRaw))) {
      const hit = catalog.find((c) => c.id === a.chargeCatalogId && !c.isSectionHeader);
      if (hit) return hit;
    }
  }

  // 4. Substring containment against catalog display name
  for (const c of catalog) {
    if (c.isSectionHeader) continue;
    const catName = normalizeKey(c.nameEn);
    if (catName.length >= 4 && (normRaw.includes(catName) || catName.includes(normRaw))) {
      return c;
    }
  }

  return null;
}

/**
 * รวมยอด WHT / VAT / THB / USD ของรายการค่าใช้จ่ายทั้งหมดในใบราคาด้วย decimal.js
 * ข้ามแถวที่สถานะเป็น NOT_APPLICABLE / INCLUDED / MISSING เพื่อไม่ให้นับซ้ำหรือคลาดเคลื่อน
 */
export function sumRateCharges(
  charges: Array<{
    cellStatus: string;
    whtAmount: string | null;
    vatAmount: string | null;
    amountThb: string | null;
    amountUsd: string | null;
  }>
): RateChargeTotals {
  let wht = new Decimal(0);
  let vat = new Decimal(0);
  let thb = new Decimal(0);
  let usd = new Decimal(0);

  for (const c of charges) {
    if (c.cellStatus === 'NOT_APPLICABLE' || c.cellStatus === 'INCLUDED' || c.cellStatus === 'MISSING') {
      continue;
    }
    if (c.whtAmount) wht = wht.plus(new Decimal(c.whtAmount));
    if (c.vatAmount) vat = vat.plus(new Decimal(c.vatAmount));
    if (c.amountThb) thb = thb.plus(new Decimal(c.amountThb));
    if (c.amountUsd) usd = usd.plus(new Decimal(c.amountUsd));
  }

  return {
    whtThb: wht.toFixed(4),
    vatThb: vat.toFixed(4),
    amountThb: thb.toFixed(4),
    amountUsd: usd.toFixed(4),
  };
}

/**
 * Parses a user-entered numeric string cleanly into fixed-4 decimal string or null.
 */
export function parseMoneyInput(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = String(raw).trim().replace(/,/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  try {
    const dec = new Decimal(cleaned);
    if (!dec.isFinite() || dec.isNegative()) return null;
    return dec.toFixed(4);
  } catch {
    return null;
  }
}
