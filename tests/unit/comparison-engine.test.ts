import { describe, expect, it } from 'vitest';
import {
  convertUsdToThb,
  evaluateAgentScope,
  findLowestComparableRateId,
} from '@/domain/comparison/scope';

describe('Scope Completeness & Partial Quote Trap Guard', () => {
  it('detects missing scopes across Delta, MSL, and Air accurately', () => {
    // Delta has Ocean + TH Local + Dest Port, missing Origin Pickup
    const deltaScope = evaluateAgentScope([
      { category: 'Ocean', cellStatus: 'QUOTED', amountThb: '75800', amountUsd: '2295' },
      { category: 'TH_Local_Transport', cellStatus: 'QUOTED', amountThb: '5500', amountUsd: null },
      { category: 'Dest_Port', cellStatus: 'QUOTED', amountThb: '7400', amountUsd: null },
    ]);
    expect(deltaScope.isFullyComparable).toBe(false);
    expect(deltaScope.missingScopes).toEqual(['Origin Pickup']);

    // Complete agent covers all 4 groups
    const completeScope = evaluateAgentScope([
      { category: 'Ocean', cellStatus: 'QUOTED', amountThb: '75800', amountUsd: '2295' },
      { category: 'Origin_Local', cellStatus: 'QUOTED', amountThb: '49500', amountUsd: '1500' },
      { category: 'TH_Local_Transport', cellStatus: 'QUOTED', amountThb: '5500', amountUsd: null },
      { category: 'Dest_Port', cellStatus: 'QUOTED', amountThb: '7400', amountUsd: null },
    ]);
    expect(completeScope.isFullyComparable).toBe(true);
    expect(completeScope.missingScopes).toHaveLength(0);
  });

  it('never crowns an incomplete quote as lowest comparable cost', () => {
    const lowest = findLowestComparableRateId([
      { id: 'msl', verificationStatus: 'Verified', totalAmountThb: '119943.43', isFullyComparable: false },
      { id: 'agentA', verificationStatus: 'Verified', totalAmountThb: '185000.00', isFullyComparable: true },
      { id: 'agentB', verificationStatus: 'Verified', totalAmountThb: '179500.00', isFullyComparable: true },
    ]);
    expect(lowest).toBe('agentB');
  });

  it('returns null when fewer than 2 scope-complete verified rates exist', () => {
    const lowest = findLowestComparableRateId([
      { id: 'delta', verificationStatus: 'Verified', totalAmountThb: '166443.43', isFullyComparable: false },
      { id: 'msl', verificationStatus: 'Verified', totalAmountThb: '119943.43', isFullyComparable: false },
      { id: 'air', verificationStatus: 'Verified', totalAmountThb: '151543.43', isFullyComparable: false },
    ]);
    expect(lowest).toBeNull();
  });
});

describe('Explicit USD -> THB FX Conversion (Perkin CEIL_100 & EXACT)', () => {
  it('matches Perkin Logistics reference paper numbers with CEIL_100 at 33.00 THB/USD', () => {
    expect(convertUsdToThb('2295', '33', 'CEIL_100')).toBe('75800.0000');
    expect(convertUsdToThb('1835', '33', 'CEIL_100')).toBe('60600.0000');
    expect(convertUsdToThb('1500', '33', 'CEIL_100')).toBe('49500.0000');
    expect(convertUsdToThb('190', '33', 'CEIL_100')).toBe('6300.0000');
    expect(convertUsdToThb('180', '33', 'CEIL_100')).toBe('6000.0000');
    expect(convertUsdToThb('25', '33', 'CEIL_100')).toBe('900.0000');
    expect(convertUsdToThb('95', '33', 'CEIL_100')).toBe('3200.0000');
    expect(convertUsdToThb('1075', '33', 'CEIL_100')).toBe('35500.0000');
    expect(convertUsdToThb('1924', '33', 'CEIL_100')).toBe('63500.0000');
    expect(convertUsdToThb('151.89', '33', 'CEIL_100')).toBe('5100.0000');
    expect(convertUsdToThb('50', '33', 'CEIL_100')).toBe('1700.0000');
    expect(convertUsdToThb('60', '33', 'CEIL_100')).toBe('2000.0000');
  });

  it('computes exact 2-decimal conversion when EXACT mode is selected', () => {
    expect(convertUsdToThb('151.89', '33', 'EXACT')).toBe('5012.3700');
    expect(convertUsdToThb('2295', '33', 'EXACT')).toBe('75735.0000');
  });
});
