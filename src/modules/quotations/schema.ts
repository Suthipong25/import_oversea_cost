import { z } from 'zod';

export const QuotationDocumentMetaSchema = z.object({
  volumeText: z.string().trim().max(120).optional().default(''),
  modeText: z.string().trim().max(80).optional().default('Sea (FCL)'),
  termText: z.string().trim().max(60).optional().default('FOB'),
  cutOffEtdText: z.string().trim().max(120).optional().default(''),
  approvedDateText: z.string().trim().max(40).optional().default(''),
});

export const QuotationItemInputSchema = z.object({
  descriptionEn: z.string().trim().min(1, 'Description is required').max(240),
  descriptionTh: z.string().trim().max(240).optional().nullable(),
  quantity: z.coerce.number().positive().default(1),
  chargeUnitText: z.string().trim().min(1).max(60).default('1'),
  unitPrice: z.coerce.number().min(0),
  isTaxable: z.boolean().default(false),
});

export const UpdateQuotationDraftSchema = z.object({
  customerName: z.string().trim().min(2).max(200),
  customerContact: z.string().trim().max(120).optional().nullable(),
  customerEmail: z.string().trim().email('Invalid email').optional().or(z.literal('')).nullable(),
  customerPhone: z.string().trim().max(60).optional().nullable(),
  customerAddress: z.string().trim().max(500).optional().nullable(),
  commodityDescription: z.string().trim().max(300).optional().nullable(),
  transitTimeText: z.string().trim().max(120).optional().nullable(),
  freeTimeText: z.string().trim().max(160).optional().nullable(),
  serviceType: z.string().trim().max(60).default('CY/CY'),
  paymentTerms: z.string().trim().max(120).default('Credit 30 Days'),
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Valid until must be YYYY-MM-DD'),
  termsAndConditions: z.string().trim().max(3000).optional().nullable(),
  remarks: z.string().trim().max(1000).optional().nullable(),
  documentMeta: QuotationDocumentMetaSchema.optional(),
  discountAmount: z.coerce.number().min(0).default(0),
  vatPercent: z.coerce.number().min(0).max(50).default(7),
  items: z.array(QuotationItemInputSchema).min(1, 'At least one quotation line item is required'),
});

export const MarkQuotationSentSchema = z.object({
  sentChannel: z.enum(['EMAIL', 'LINE', 'HAND_DELIVERY', 'OTHER']),
  sentRecipient: z.string().trim().min(1, 'กรุณาระบุผู้รับหรือช่องทางที่ส่ง').max(200),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const CreateRevisionSchema = z.object({
  changeSummary: z.string().trim().min(2, 'กรุณาระบุเหตุผลการสร้าง Revision ใหม่').max(500),
});

export type QuotationDocumentMeta = z.infer<typeof QuotationDocumentMetaSchema>;
export type UpdateQuotationDraftInput = z.infer<typeof UpdateQuotationDraftSchema>;
export type MarkQuotationSentInput = z.infer<typeof MarkQuotationSentSchema>;
export type CreateRevisionInput = z.infer<typeof CreateRevisionSchema>;
