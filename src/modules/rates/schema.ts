import { z } from 'zod';

export const CellStatusSchema = z.enum(['QUOTED', 'NOT_APPLICABLE', 'INCLUDED', 'MISSING']);

export const UpsertRateChargeSchema = z.object({
  chargeId: z.string().uuid().optional().nullable(),
  chargeCatalogId: z.string().uuid().optional().nullable(),
  rawChargeName: z.string().trim().min(1).max(200),
  category: z.string().trim().max(40).default('Other'),
  cellStatus: CellStatusSchema.default('QUOTED'),
  whtAmount: z.string().nullable().optional(),
  vatAmount: z.string().nullable().optional(),
  amountThb: z.string().nullable().optional(),
  amountUsd: z.string().nullable().optional(),
  learnAlias: z.boolean().optional().default(false),
});

export const CopyBaselineRowSchema = z.object({
  chargeCatalogId: z.string().uuid(),
  rawChargeName: z.string().trim().min(1).max(200),
  category: z.string().trim().max(40).default('Other'),
  whtAmount: z.string().nullable().optional(),
  vatAmount: z.string().nullable().optional(),
  amountThb: z.string().nullable().optional(),
  amountUsd: z.string().nullable().optional(),
});

export const CreateCatalogSubjectSchema = z.object({
  nameEn: z.string().trim().min(1, 'กรุณาระบุชื่อหัวข้อ (EN)').max(200),
  nameTh: z.string().trim().max(200).optional().nullable(),
  category: z
    .enum(['Ocean', 'Origin_Local', 'Dest_Port', 'TH_Local_Transport', 'Insurance_Misc', 'Other'])
    .default('Other'),
  defaultWhtPercent: z.coerce.number().min(0).max(30).default(0),
  isSectionHeader: z.boolean().default(false),
  aliases: z.array(z.string().trim().min(1).max(120)).default([]),
});

export type UpsertRateChargeInput = z.infer<typeof UpsertRateChargeSchema>;
export type CopyBaselineRowInput = z.infer<typeof CopyBaselineRowSchema>;
export type CreateCatalogSubjectInput = z.infer<typeof CreateCatalogSubjectSchema>;
