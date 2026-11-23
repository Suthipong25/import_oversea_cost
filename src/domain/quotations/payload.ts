import Decimal from 'decimal.js';

export interface CustomerQuotationPdfItem {
  itemOrder: number;
  descriptionEn: string;
  descriptionTh: string | null;
  quantity: string;
  chargeUnitText: string;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  isTaxable: boolean;
}

export interface CustomerQuotationPdfPayload {
  quotationNumber: string;
  versionNumber: number;
  issueDate: string;
  validUntil: string;
  salesRepName: string;
  customerName: string;
  customerContact: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  polPortCode: string;
  podPortCode: string;
  containerSummary: string;
  commodityDescription: string | null;
  volumeText?: string | null;
  modeText?: string | null;
  termText?: string | null;
  cutOffEtdText?: string | null;
  approvedDateText?: string | null;
  transitTimeText: string | null;
  freeTimeText: string | null;
  serviceType: string;
  paymentTerms: string;
  termsAndConditions: string | null;
  remarks: string | null;
  currency: string;
  subtotal: string;
  discountAmount: string;
  vatPercent: string;
  vatAmount: string;
  grandTotal: string;
  items: CustomerQuotationPdfItem[];
}

/**
 * รายชื่อคำต้องห้าม (ความลับภายในบริษัท) ที่ห้ามหลุดไปใน Payload ใบเสนอราคาลูกค้า (ขั้น ③) เด็ดขาด
 * ระบบจะเรียก assertNoConfidentialFields() ตรวจแบบ Recursive ทุกครั้งก่อนสร้าง PDF และตรวจซ้ำใน Unit Test
 */
const FORBIDDEN_CONFIDENTIAL_KEYS = [
  'cost',
  'supplier',
  'agent',
  'markup',
  'margin',
  'grossprofit',
  'gross_profit',
  'buying',
  'internalnote',
  'internal_note',
  'raterecord',
  'rate_record',
  'sellingrateid',
  'selling_rate_id',
];

/**
 * ตรวจสอบ Object/Array ทุกชั้นแบบ Recursive หากพบคีย์ที่เกี่ยวข้องกับต้นทุน Agent หรือกำไร
 * จะโยน Error ทันทีเพื่อป้องกันข้อมูลความลับรั่วไปยัง PDF ฝั่งลูกค้า
 */
export function assertNoConfidentialFields(payload: unknown, path = 'root'): void {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => assertNoConfidentialFields(item, `${path}[${idx}]`));
    return;
  }

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    const normalized = key.toLowerCase();
    for (const forbidden of FORBIDDEN_CONFIDENTIAL_KEYS) {
      if (normalized.includes(forbidden)) {
        throw new Error(
          `CONFIDENTIALITY_VIOLATION: Forbidden internal field "${key}" detected at ${path}.${key}`
        );
      }
    }
    assertNoConfidentialFields(value, `${path}.${key}`);
  }
}

/**
 * คำนวณยอดรวมฝั่งใบเสนอราคาลูกค้า (Subtotal, Discount, VAT 7%, Grand Total)
 * คิดเฉพาะรายการขายที่แสดงให้ลูกค้าเห็นเท่านั้น — ไม่มีฟิลด์ต้นทุนหรือกำไรเข้ามาเกี่ยวข้อง
 */
export function computeQuotationTotals(params: {
  items: Array<{ quantity: string | number; unitPrice: string | number; isTaxable: boolean }>;
  discountAmount?: string | number | null;
  vatPercent?: string | number | null;
}) {
  const discount = new Decimal(params.discountAmount ?? 0);
  const vatRate = new Decimal(params.vatPercent ?? 7);

  let subtotal = new Decimal(0);
  let taxableSubtotal = new Decimal(0);

  const computedItems = params.items.map((item) => {
    const qty = new Decimal(item.quantity);
    const unitPrice = new Decimal(item.unitPrice);
    const total = qty.times(unitPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    subtotal = subtotal.plus(total);
    if (item.isTaxable) {
      taxableSubtotal = taxableSubtotal.plus(total);
    }
    return {
      quantity: qty.toFixed(2),
      unitPrice: unitPrice.toFixed(4),
      totalAmount: total.toFixed(4),
    };
  });

  const netBeforeVat = Decimal.max(0, subtotal.minus(discount));
  let netTaxable = taxableSubtotal;
  if (subtotal.gt(0) && discount.gt(0) && taxableSubtotal.gt(0)) {
    netTaxable = Decimal.max(
      0,
      taxableSubtotal.minus(discount.times(taxableSubtotal.dividedBy(subtotal)))
    );
  }

  const vatAmount = netTaxable.times(vatRate).dividedBy(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const grandTotal = netBeforeVat.plus(vatAmount);

  return {
    subtotal: subtotal.toFixed(4),
    discountAmount: discount.toFixed(4),
    vatPercent: vatRate.toFixed(2),
    vatAmount: vatAmount.toFixed(4),
    grandTotal: grandTotal.toFixed(4),
    computedItems,
  };
}
