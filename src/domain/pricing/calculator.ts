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
 * Pure deterministic selling rate calculator using decimal.js.
 * - Never auto-adds markup; uses only Sales-entered selling amounts.
 * - Keeps Markup % and Gross Margin % strictly distinct:
 *   Example: cost 1,000, selling 1,200 -> profit 200, markup 20.00%, margin 16.67%.
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

  const netSelling = Decimal.max(0, totalSelling.minus(discount));
  const grossProfit = netSelling.minus(totalCost);

  // Markup % = (GP / Cost) * 100
  const markupPercent = totalCost.gt(0)
    ? grossProfit.dividedBy(totalCost).times(100)
    : new Decimal(0);

  // Gross Margin % = (GP / Net Selling Excl. VAT) * 100
  const grossMarginPercent = netSelling.gt(0)
    ? grossProfit.dividedBy(netSelling).times(100)
    : new Decimal(0);

  // Proportional discount adjustment on taxable subtotal before VAT
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
    isBelowCost: hasAnySellingPrice && netSelling.lt(totalCost),
    hasAnySellingPrice,
  };
}
