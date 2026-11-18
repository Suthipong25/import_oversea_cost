import { z } from 'zod';

export const SellingDocumentMetaSchema = z.object({
  jobNo: z.string().trim().max(120).optional().default(''),
  customerName: z.string().trim().max(200).optional().default(''),
  consigneeName: z.string().trim().max(200).optional().default(''),
  agentName: z.string().trim().max(200).optional().default(''),
  commodity: z.string().trim().max(240).optional().default(''),
  volume: z.string().trim().max(120).optional().default(''),
  weightKgs: z.string().trim().max(60).optional().default(''),
  measureCbm: z.string().trim().max(60).optional().default(''),
  mode: z.string().trim().max(60).optional().default('Sea (FCL)'),
  term: z.string().trim().max(60).optional().default('FOB'),
  pol: z.string().trim().max(100).optional().default(''),
  pod: z.string().trim().max(100).optional().default(''),
  freeDays: z.string().trim().max(60).optional().default(''),
  diffAdvance: z.string().trim().max(60).optional().default(''),
});

export const SellingChargeLineSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  chargeCatalogId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1, 'Description is required').max(240),
  category: z.string().trim().max(40).default('Other'),
  costAmountThb: z.coerce.number().min(0).default(0),
  costWhtThb: z.coerce.number().min(0).default(0),
  costVatThb: z.coerce.number().min(0).default(0),
  costAmountUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
  costForeignCurrUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
  sellingAmountThb: z.union([z.coerce.number().min(0), z.null()]).optional(),
  revenueWhtPercent: z.coerce.number().min(0).max(30).default(0),
  revenueAmountUsd: z.union([z.coerce.number().min(0), z.null()]).optional(),
  chargeUnit: z.string().trim().max(40).default('PER_SHIPMENT'),
  quantity: z.coerce.number().positive().default(1),
  isVatApplicable: z.boolean().default(false),
});

export const UpdateSellingRateSchema = z.object({
  discountAmount: z.coerce.number().min(0).default(0),
  vatPercent: z.coerce.number().min(0).max(50).default(7),
  requestNotes: z.string().trim().max(1000).optional().nullable(),
  documentMeta: SellingDocumentMetaSchema.optional(),
  lines: z.array(SellingChargeLineSchema).min(1, 'At least one charge line is required'),
});

export const RequestApprovalSchema = z.object({
  requestNotes: z.string().trim().max(1000).optional().nullable(),
});

export const ReturnSellingRateSchema = z.object({
  reason: z.string().trim().min(2, 'กรุณาระบุเหตุผลที่ส่งกลับแก้ไข').max(1000),
});

export type SellingDocumentMeta = z.infer<typeof SellingDocumentMetaSchema>;
export type UpdateSellingRateInput = z.infer<typeof UpdateSellingRateSchema>;
export type RequestApprovalInput = z.infer<typeof RequestApprovalSchema>;
export type ReturnSellingRateInput = z.infer<typeof ReturnSellingRateSchema>;
