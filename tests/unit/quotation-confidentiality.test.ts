import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import {
  assertNoConfidentialFields,
  computeQuotationTotals,
  type CustomerQuotationPdfPayload,
} from '@/domain/quotations/payload';
import { QuotationPdfDocument } from '@/lib/pdf/quotation-pdf';
import { CompareCostPdfDocument } from '@/lib/pdf/compare-cost-pdf';
import { ApproveRequestPdfDocument } from '@/lib/pdf/approve-request-pdf';

describe('Quotation PDF Confidentiality Guard (Rule #6 — Anti-Leakage CI Gate)', () => {
  const cleanPayload: CustomerQuotationPdfPayload = {
    quotationNumber: 'PK-QT-202611-A1B2',
    versionNumber: 1,
    issueDate: '2026-11-18',
    validUntil: '2026-12-02',
    salesRepName: 'Sales Co.',
    customerName: 'Siam Industrial Co., Ltd.',
    customerContact: 'K. Anan',
    customerEmail: 'anan@siam.co.th',
    customerPhone: '02-123-4567',
    customerAddress: 'Bangkok',
    polPortCode: 'USLAX',
    podPortCode: 'THLCH',
    containerSummary: '1×40DV + 1×20GP',
    commodityDescription: 'Machinery',
    transitTimeText: '28 days',
    freeTimeText: '14 days',
    serviceType: 'CY/CY',
    paymentTerms: 'Credit 30 Days',
    termsAndConditions: 'Valid until stated date.',
    remarks: null,
    currency: 'THB',
    subtotal: '195000.0000',
    discountAmount: '0.0000',
    vatPercent: '7.00',
    vatAmount: '1400.0000',
    grandTotal: '196400.0000',
    items: [
      {
        itemOrder: 1,
        descriptionEn: 'Ocean Freight 40 DV',
        descriptionTh: 'ค่าระวางตู้ 40 DV',
        quantity: '1.00',
        chargeUnitText: 'Per Container',
        unitPrice: '175000.0000',
        totalAmount: '175000.0000',
        currency: 'THB',
        isTaxable: false,
      },
      {
        itemOrder: 2,
        descriptionEn: 'Local Service & Clearance',
        descriptionTh: 'ค่าบริการพิธีการศุลกากร',
        quantity: '1.00',
        chargeUnitText: 'Per Shipment',
        unitPrice: '20000.0000',
        totalAmount: '20000.0000',
        currency: 'THB',
        isTaxable: true,
      },
    ],
  };

  it('passes clean customer-facing PDF payloads with zero internal fields', () => {
    expect(() => assertNoConfidentialFields(cleanPayload)).not.toThrow();
  });

  it('FAILS immediately if supplier, agent, cost, markup, margin, or grossProfit leaks anywhere in payload', () => {
    const leakedCases: Array<Record<string, unknown>> = [
      { ...cleanPayload, supplierName: 'COST Delta' },
      { ...cleanPayload, agentName: 'COST msl' },
      { ...cleanPayload, totalCostThb: '166443.43' },
      { ...cleanPayload, grossProfit: '28556.57' },
      { ...cleanPayload, grossMarginPercent: '14.64' },
      { ...cleanPayload, markupPercent: '17.15' },
      {
        ...cleanPayload,
        items: [{ ...cleanPayload.items[0], buyingCost: '75800.00' }],
      },
    ];

    for (const badPayload of leakedCases) {
      expect(() => assertNoConfidentialFields(badPayload)).toThrow(/CONFIDENTIALITY_VIOLATION/);
    }
  });
});

describe('Quotation Totals Calculation (decimal.js)', () => {
  it('computes subtotal, discount, taxable-only VAT, and grand total accurately', () => {
    const res = computeQuotationTotals({
      items: [
        { quantity: 1, unitPrice: 175000, isTaxable: false },
        { quantity: 2, unitPrice: 10000, isTaxable: true },
      ],
      discountAmount: 0,
      vatPercent: 7,
    });

    expect(res.subtotal).toBe('195000.0000');
    expect(res.vatAmount).toBe('1400.0000');
    expect(res.grandTotal).toBe('196400.0000');
  });

  it('renders Perkin Quotation PDF template to a valid %PDF binary buffer', async () => {
    const buf = await renderToBuffer(
      QuotationPdfDocument({
        lang: 'en',
        data: {
          quotationNumber: '2026.0801001',
          versionNumber: 1,
          issueDate: '2026-08-13',
          validUntil: '2026-08-27',
          salesRepName: 'Sales Co.',
          customerName: 'MAJESTIC HOME THANAVACH CO., LTD.',
          customerContact: null,
          customerEmail: null,
          customerPhone: '+66815590455',
          customerAddress: '22 SRINAKHARIN ROAD, NONGBORN, PRAVET, BANGKOK, 10250 THAILAND',
          polPortCode: 'NINGBO, China',
          podPortCode: 'Bangkok',
          containerSummary: '75 cartons',
          commodityDescription: 'Shower Filter',
          volumeText: '75 cartons',
          modeText: 'Sea (LCL)',
          termText: 'FOB',
          cutOffEtdText: 'TUE/THU; THU/MON',
          approvedDateText: '12/08/2026',
          transitTimeText: '7 DAYS',
          freeTimeText: null,
          serviceType: 'CY/CY',
          paymentTerms: 'Credit 30 Days',
          termsAndConditions: null,
          remarks: null,
          currency: 'THB',
          subtotal: '21300.0000',
          discountAmount: '5000.0000',
          vatPercent: '7.00',
          vatAmount: '1141.0000',
          grandTotal: '17441.0000',
          items: [
            {
              itemOrder: 1,
              descriptionEn: 'Freight Charge & Local Charge',
              descriptionTh: null,
              quantity: '1.00',
              chargeUnitText: '1',
              unitPrice: '15500.0000',
              totalAmount: '15500.0000',
              currency: 'THB',
              isTaxable: true,
            },
          ],
        },
      })
    );

    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders ① Compare Cost A4 landscape PDF cleanly with official Perkin logo', async () => {
    const buf = await renderToBuffer(
      CompareCostPdfDocument({
        data: {
          shipmentRef: 'SHP-202611-DEMO',
          customerName: 'Import USA — Perkin Demo',
          polPortCode: 'USLAX',
          podPortCode: 'THLCH',
          containerSummary: '1×40DV + 1×20GP',
          fxRateUsdToThb: 33,
          generatedDate: '18/11/2026',
          selectedRateRecordId: 'r1',
          selectionReason: 'Best overall transit & cost',
          lowestComparableRateId: 'r2',
          catalog: [
            { id: 'c1', nameEn: '40 DV', isSectionHeader: false },
            { id: 'c2', nameEn: 'Local Charge', isSectionHeader: true },
            { id: 'c3', nameEn: 'Dest TRML HANDLG', isSectionHeader: false },
          ],
          rates: [
            {
              id: 'r1',
              agentName: 'COST Delta',
              verificationStatus: 'Verified',
              totals: { whtThb: '55.0000', vatThb: '0.0000', amountThb: '166443.4300', amountUsd: '4340.0000' },
              charges: [
                { chargeCatalogId: 'c1', rawChargeName: '40 DV', cellStatus: 'QUOTED', whtAmount: '0', vatAmount: '0', amountThb: '75800', amountUsd: '2295' },
                { chargeCatalogId: 'c3', rawChargeName: 'Dest TRML HANDLG', cellStatus: 'QUOTED', whtAmount: '0', vatAmount: '0', amountThb: '7400', amountUsd: null },
              ],
            },
            {
              id: 'r2',
              agentName: 'COST msl',
              verificationStatus: 'Verified',
              totals: { whtThb: '55.0000', vatThb: '0.0000', amountThb: '119943.4300', amountUsd: '2925.0000' },
              charges: [
                { chargeCatalogId: 'c3', rawChargeName: 'Dest TRML HANDLG', cellStatus: 'QUOTED', whtAmount: '0', vatAmount: '0', amountThb: '7400', amountUsd: null },
              ],
            },
          ],
        },
      })
    );

    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('renders ② Sale Price Approve Request A4 PDF matching Perkin web layout', async () => {
    const buf = await renderToBuffer(
      ApproveRequestPdfDocument({
        data: {
          shipmentRef: 'SHP-202611-DEMO',
          docMeta: {
            jobNo: 'JOB-2026-001',
            customerName: 'MAJESTIC HOME THANAVACH CO., LTD.',
            consigneeName: 'MAJESTIC HOME THANAVACH CO., LTD.',
            agentName: 'COST Delta',
            commodity: 'Shower Filter',
            volume: '1×40DV + 1×20GP',
            weightKgs: '1,025',
            measureCbm: '2.775',
            mode: 'Sea (FCL)',
            term: 'FOB',
            pol: 'USLAX',
            pod: 'THLCH',
            freeDays: '3 Days',
            diffAdvance: '',
          },
          vatPercent: '7.00',
          totalRevenueThb: '191350.0000',
          totalCostThb: '166443.4300',
          grossProfitThb: '24906.5700',
          grossMarginPercent: '13.0200',
          status: 'Approved',
          approverName: 'IT Admin (Perkin)',
          approvedDateStr: '18/11/2026',
          lines: [
            {
              description: '40 DV',
              isVatApplicable: false,
              costWhtThb: '0.0000',
              costVatThb: '0.0000',
              costAmountThb: '75800.0000',
              costAmountUsd: '2295.0000',
              costForeignCurrUsd: null,
              revenueWhtPercent: '0.00',
              sellingAmountThb: '85000.0000',
              revenueAmountUsd: '3900.0000',
            },
            {
              description: '1x40 TRANSPORTATION CHARGE',
              isVatApplicable: true,
              costWhtThb: '55.0000',
              costVatThb: '0.0000',
              costAmountThb: '5500.0000',
              costAmountUsd: null,
              costForeignCurrUsd: null,
              revenueWhtPercent: '3.00',
              sellingAmountThb: '6550.0000',
              revenueAmountUsd: null,
            },
          ],
        },
      })
    );

    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
