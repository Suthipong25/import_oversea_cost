import Decimal from 'decimal.js';

export interface SellingChargeLineInput {
  costAmountThb: string | number;
  sellingAmountThb: string | number | null;
  isVatApplicable: boolean;
}

export interface SellingRateCalculationResult {
  totalCostThb: string;
  totalSellingBeforeVat: string;
  discountAmount: string;
  netSellingExclVat: string;
  grossProfit: string;
  markupPercent: string;
  grossMarginPercent: string;
  vatPercent: string;
  vatAmount: string;
  grandTotalSelling: string;
  isBelowCost: boolean;
  hasAnySellingPrice: boolean;
}

function toDec(val: string | number | null | undefined): Decimal {
  if (val === null || val === undefined || val === '') return new Decimal(0);
  const cleaned = String(val).trim().replace(/,/g, '');
  if (!cleaned || cleaned === '-') return new Decimal(0);
  return new Decimal(cleaned);
}

/**
 * ตัวคำนวณราคาขายและกำไรสำหรับขั้น ② (Sale Price Approve Request) ด้วย decimal.js
 *
 * กฎสำคัญของระบบ:
 * 1. ห้ามบวก Markup อัตโนมัติ (Zero Auto-Markup) — คำนวณจากราคาขายที่ Sales กรอกเองเท่านั้น
 * 2. แยก Markup % และ Gross Margin % ชัดเจน:
 *    - Markup % = (GP / Cost) × 100
 *    - Gross Margin % = (GP / Net Selling Excl. VAT) × 100
 *    ตัวอย่าง: ทุน 1,000 ขาย 1,200 -> กำไร 200 -> Markup = 20.00%, Margin = 16.67%
 * 3. VAT 7% คิดเฉพาะรายการที่ติ๊ก isVatApplicable = true และเฉลี่ยส่วนลดตามสัดส่วนยอดที่เสีย VAT
 */
export function calculateSellingRate(params: {
  lines: SellingChargeLineInput[];
  discountAmount?: string | number | null;
  vatPercent?: string | number | null;
}): SellingRateCalculationResult {
  const discount = toDec(params.discountAmount);
  const vatRate = params.vatPercent !== undefined && params.vatPercent !== null
    ? toDec(params.vatPercent)
    : new Decimal(7);

  let totalCost = new Decimal(0);
  let totalSelling = new Decimal(0);
  let taxableSelling = new Decimal(0);
  let hasAnySellingPrice = false;

  // รวมยอดต้นทุน (Cost), ยอดขายรวม (Revenue) และยอดขายเฉพาะรายการที่ต้องคิด VAT
  for (const line of params.lines) {
    const cost = toDec(line.costAmountThb);
    totalCost = totalCost.plus(cost);

    if (line.sellingAmountThb !== null && line.sellingAmountThb !== '') {
      const sell = toDec(line.sellingAmountThb);
      if (sell.gt(0)) hasAnySellingPrice = true;
      totalSelling = totalSelling.plus(sell);
      if (line.isVatApplicable) {
        taxableSelling = taxableSelling.plus(sell);
      }
    }
  }

  // ยอดขายสุทธิก่อน VAT และกำไรขั้นต้น (Gross Profit)
  const netSelling = Decimal.max(0, totalSelling.minus(discount));
  const grossProfit = netSelling.minus(totalCost);

  // Markup % = (กำไรขั้นต้น / ต้นทุนรวม) × 100
  const markupPercent = totalCost.gt(0)
    ? grossProfit.dividedBy(totalCost).times(100)
    : new Decimal(0);

  // Gross Margin % = (กำไรขั้นต้น / ยอดขายสุทธิก่อน VAT) × 100 (ใช้เทียบเกณฑ์ CONDITION >= 25%)
  const grossMarginPercent = netSelling.gt(0)
    ? grossProfit.dividedBy(netSelling).times(100)
    : new Decimal(0);

  // หากมีส่วนลดรวม ให้หักส่วนลดออกจากฐานภาษี VAT ตามสัดส่วนของรายการที่เสีย VAT
  let netTaxable = taxableSelling;
  if (totalSelling.gt(0) && discount.gt(0) && taxableSelling.gt(0)) {
    const taxableShare = taxableSelling.dividedBy(totalSelling);
    netTaxable = Decimal.max(0, taxableSelling.minus(discount.times(taxableShare)));
  }

  const vatAmount = netTaxable
    .times(vatRate)
    .dividedBy(100)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  const grandTotal = netSelling.plus(vatAmount);

  return {
    totalCostThb: totalCost.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    totalSellingBeforeVat: totalSelling.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    discountAmount: discount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    netSellingExclVat: netSelling.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    grossProfit: grossProfit.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    markupPercent: markupPercent.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    grossMarginPercent: grossMarginPercent.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    vatPercent: vatRate.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    vatAmount: vatAmount.toFixed(4),
    grandTotalSelling: grandTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(4),
    // แจ้งเตือนหากตั้งราคาขายสุทธิต่ำกว่าต้นทุนรวม (ขาดทุน)
    isBelowCost: hasAnySellingPrice && netSelling.lt(totalCost),
    hasAnySellingPrice,
  };
}
