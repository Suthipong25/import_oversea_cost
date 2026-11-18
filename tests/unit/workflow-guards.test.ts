import { describe, expect, it } from 'vitest';
import { deriveShipmentStatus } from '@/domain/workflow/shipment-status';
import { canEnterComparison } from '@/domain/workflow/rate-state';
import { CreateShipmentSchema } from '@/modules/shipments/schema';

describe('Derived Shipment Status Projection', () => {
  it('derives status deterministically from child entities', () => {
    expect(deriveShipmentStatus({ rateStatuses: [] })).toBe('New / Draft');
    expect(deriveShipmentStatus({ rateStatuses: ['Awaiting_Verification'] })).toBe(
      'Rates Pending Verification'
    );
    expect(deriveShipmentStatus({ rateStatuses: ['Verified', 'Verified'] })).toBe(
      'Ready for Comparison'
    );
    expect(
      deriveShipmentStatus({ rateStatuses: ['Verified', 'Verified'], comparisonStatus: 'Open' })
    ).toBe('Comparison Open');
    expect(
      deriveShipmentStatus({
        rateStatuses: ['Verified', 'Verified'],
        comparisonStatus: 'Supplier_Selected',
      })
    ).toBe('Supplier Selected');
    expect(
      deriveShipmentStatus({
        rateStatuses: ['Verified', 'Expired'],
        comparisonStatus: 'Needs_Review',
      })
    ).toBe('Needs Attention');
    expect(
      deriveShipmentStatus({
        rateStatuses: ['Verified', 'Verified'],
        comparisonStatus: 'Supplier_Selected',
        sellingRateStatus: 'Pending_Approval',
      })
    ).toBe('Pending Approval');
    expect(
      deriveShipmentStatus({
        rateStatuses: ['Verified', 'Verified'],
        comparisonStatus: 'Supplier_Selected',
        sellingRateStatus: 'Approved',
      })
    ).toBe('Price Approved');
    expect(
      deriveShipmentStatus({
        rateStatuses: ['Verified', 'Verified'],
        comparisonStatus: 'Supplier_Selected',
        sellingRateStatus: 'Approved',
        quotationStatus: 'Draft',
      })
    ).toBe('Quotation Draft');
    expect(
      deriveShipmentStatus({
        rateStatuses: ['Verified', 'Verified'],
        comparisonStatus: 'Supplier_Selected',
        sellingRateStatus: 'Approved',
        quotationStatus: 'Sent',
      })
    ).toBe('Completed (3/3)');
  });
});

describe('Comparison Transition Guards', () => {
  const baseRate = {
    verificationStatus: 'Verified' as const,
    polPortCode: 'USLAX',
    podPortCode: 'THLCH',
    validTo: '2026-12-31',
  };

  it('allows 2 to 5 verified, unexpired rates with matching ports', () => {
    const res = canEnterComparison(
      [
        { id: '1', ...baseRate },
        { id: '2', ...baseRate },
        { id: '3', ...baseRate },
      ],
      '2026-11-18'
    );
    expect(res.allowed).toBe(true);
    expect(res.reasons).toHaveLength(0);
  });

  it('blocks fewer than 2 rates, unverified rates, expired rates, and mismatched routes', () => {
    expect(canEnterComparison([{ id: '1', ...baseRate }], '2026-11-18').allowed).toBe(false);

    const unverified = canEnterComparison(
      [
        { id: '1', ...baseRate },
        { id: '2', ...baseRate, verificationStatus: 'Awaiting_Verification' },
      ],
      '2026-11-18'
    );
    expect(unverified.allowed).toBe(false);

    const expired = canEnterComparison(
      [
        { id: '1', ...baseRate },
        { id: '2', ...baseRate, validTo: '2026-11-01' },
      ],
      '2026-11-18'
    );
    expect(expired.allowed).toBe(false);

    const mismatch = canEnterComparison(
      [
        { id: '1', ...baseRate },
        { id: '2', ...baseRate, podPortCode: 'THBKK' },
      ],
      '2026-11-18'
    );
    expect(mismatch.allowed).toBe(false);
  });
});

describe('CreateShipmentSchema (Multi-Container)', () => {
  it('accepts mixed containers like 1x40DV + 1x20GP and uppercases port codes', () => {
    const parsed = CreateShipmentSchema.parse({
      customerName: 'Import USA — Delta / MSL / Air',
      polPortCode: 'uslax',
      podPortCode: 'thlch',
      containers: [
        { containerType: '40DV', quantity: 1 },
        { containerType: '20GP', quantity: 1 },
      ],
    });
    expect(parsed.polPortCode).toBe('USLAX');
    expect(parsed.podPortCode).toBe('THLCH');
    expect(parsed.containers).toHaveLength(2);
  });

  it('rejects empty containers array', () => {
    const result = CreateShipmentSchema.safeParse({
      customerName: 'Test Co',
      polPortCode: 'USLAX',
      podPortCode: 'THLCH',
      containers: [],
    });
    expect(result.success).toBe(false);
  });
});
