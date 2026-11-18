import { describe, expect, it } from 'vitest';
import { calculateSellingRate } from '@/domain/pricing/calculator';

describe('Selling Rate Calculator (decimal.js — No Auto-Markup)', () => {
  it('keeps Markup % and Gross Margin % strictly distinct (M4 spec example: cost 1,000 -> price 1,200)', () => {
    const res = calculateSellingRate({
      lines: [{ costAmountThb: '1000', sellingAmountThb: '1200', isVatApplicable: false }],
      discountAmount: 0,
      vatPercent: 7,
    });

    expect(res.totalCostThb).toBe('1000.0000');
    expect(res.netSellingExclVat).toBe('1200.0000');
    expect(res.grossProfit).toBe('200.0000');
    expect(res.markupPercent).toBe('20.0000');
    expect(res.grossMarginPercent).toBe('16.6700');
    expect(res.vatAmount).toBe('0.0000');
    expect(res.grandTotalSelling).toBe('1200.0000');
    expect(res.isBelowCost).toBe(false);
  });

  it('starts with 0 selling price when Sales has not entered selling amounts yet (no auto-markup)', () => {
    const res = calculateSellingRate({
      lines: [
        { costAmountThb: '75800', sellingAmountThb: null, isVatApplicable: false },
        { costAmountThb: '5500', sellingAmountThb: null, isVatApplicable: true },
      ],
    });

    expect(res.totalCostThb).toBe('81300.0000');
    expect(res.netSellingExclVat).toBe('0.0000');
    expect(res.hasAnySellingPrice).toBe(false);
    expect(res.isBelowCost).toBe(false);
  });

  it('applies 7% VAT strictly to VAT-applicable lines and flags below-cost pricing', () => {
    const res = calculateSellingRate({
      lines: [
        { costAmountThb: '100000', sellingAmountThb: '90000', isVatApplicable: false },
        { costAmountThb: '5000', sellingAmountThb: '6000', isVatApplicable: true },
      ],
      discountAmount: '0',
      vatPercent: 7,
    });

    expect(res.totalCostThb).toBe('105000.0000');
    expect(res.netSellingExclVat).toBe('96000.0000');
    expect(res.grossProfit).toBe('-9000.0000');
    expect(res.isBelowCost).toBe(true);
    // 7% VAT applies only to the 6,000 THB taxable line = 420.00 THB
    expect(res.vatAmount).toBe('420.0000');
    expect(res.grandTotalSelling).toBe('96420.0000');
  });

  it('handles discounts proportionally on taxable items with decimal precision', () => {
    const res = calculateSellingRate({
      lines: [
        { costAmountThb: '10000', sellingAmountThb: '15000', isVatApplicable: true },
      ],
      discountAmount: '1000',
      vatPercent: 7,
    });

    expect(res.netSellingExclVat).toBe('14000.0000');
    expect(res.grossProfit).toBe('4000.0000');
    expect(res.vatAmount).toBe('980.0000'); // 7% of 14,000
    expect(res.grandTotalSelling).toBe('14980.0000');
  });
});
