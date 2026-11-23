export type RateVerificationStatus =
  | 'Awaiting_Verification'
  | 'Verified'
  | 'Rejected'
  | 'Expired'
  | 'Superseded';

export type ComparisonStatus = 'Open' | 'Supplier_Selected' | 'Needs_Review';

export type SellingRateWorkflowStatus =
  | 'Draft'
  | 'Pending_Approval'
  | 'Approved'
  | 'Returned'
  | 'Needs_Review';

export type QuotationWorkflowStatus = 'Draft' | 'Sent' | 'Revised' | 'Cancelled';

export type DerivedShipmentStatus =
  | 'New / Draft'
  | 'Rates Pending Verification'
  | 'Ready for Comparison'
  | 'Comparison Open'
  | 'Supplier Selected'
  | 'Pricing Draft'
  | 'Pending Approval'
  | 'Pricing Returned'
  | 'Price Approved'
  | 'Quotation Draft'
  | 'Completed (3/3)'
  | 'Needs Attention';

export interface ShipmentStatusInput {
  rateStatuses: RateVerificationStatus[];
  comparisonStatus?: ComparisonStatus | null;
  sellingRateStatus?: SellingRateWorkflowStatus | null;
  quotationStatus?: QuotationWorkflowStatus | null;
}

/**
 * ฟังก์ชันคำนวณสถานะรวมของงานแบบ Deterministic (Pure Projection)
 *
 * หลักการ: สถานะของ Shipment จะไม่ถูกแก้ด้วยมือ แต่คำนวณย้อนกลับจากขั้นตอนล่าสุดที่ทำไปแล้ว
 * ลำดับความสำคัญจากปลายทางย้อนกลับมาต้นทาง:
 *   ③ Quotation (Sent -> Completed 3/3, Draft -> Quotation Draft)
 *   ② Selling Rate (Approved -> Pending_Approval -> Returned -> Draft)
 *   ① Cost Comparison (Supplier_Selected -> Open)
 *   0  Rate Records (Verified >= 2 -> Ready for Comparison -> Pending Verification -> New/Draft)
 */
export function deriveShipmentStatus(input: ShipmentStatusInput): DerivedShipmentStatus {
  if (input.quotationStatus === 'Sent') {
    return 'Completed (3/3)';
  }
  if (input.comparisonStatus === 'Needs_Review' || input.sellingRateStatus === 'Needs_Review') {
    return 'Needs Attention';
  }
  if (input.quotationStatus === 'Draft') {
    return 'Quotation Draft';
  }
  if (input.sellingRateStatus === 'Approved') {
    return 'Price Approved';
  }
  if (input.sellingRateStatus === 'Pending_Approval') {
    return 'Pending Approval';
  }
  if (input.sellingRateStatus === 'Returned') {
    return 'Pricing Returned';
  }
  if (input.sellingRateStatus === 'Draft') {
    return 'Pricing Draft';
  }
  if (input.comparisonStatus === 'Supplier_Selected') {
    return 'Supplier Selected';
  }
  if (input.comparisonStatus === 'Open') {
    return 'Comparison Open';
  }

  const verifiedCount = input.rateStatuses.filter((s) => s === 'Verified').length;
  const pendingCount = input.rateStatuses.filter((s) => s === 'Awaiting_Verification').length;

  if (verifiedCount >= 2) {
    return 'Ready for Comparison';
  }
  if (pendingCount > 0) {
    return 'Rates Pending Verification';
  }
  return 'New / Draft';
}
