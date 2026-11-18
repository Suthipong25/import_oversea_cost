import { z } from 'zod';

export const SelectWinningAgentSchema = z.object({
  selectedRateRecordId: z.string().uuid('Invalid rate record ID'),
  selectionReason: z.string().trim().min(2, 'กรุณาระบุเหตุผลที่เลือก Agent นี้').max(500),
  comparisonNotes: z.string().trim().max(1000).optional().nullable(),
});

export const MapUnmappedChargeSchema = z.object({
  chargeId: z.string().uuid('Invalid charge ID'),
  chargeCatalogId: z.string().uuid('Invalid target subject ID'),
  learnAlias: z.boolean().default(true),
});

export const ApplyExplicitFxSchema = z.object({
  fxRate: z.coerce.number().positive('FX rate must be positive').max(1000),
  roundingMode: z.enum(['EXACT', 'CEIL_100']).default('CEIL_100'),
  overwriteExisting: z.boolean().default(false),
});

export type SelectWinningAgentInput = z.infer<typeof SelectWinningAgentSchema>;
export type MapUnmappedChargeInput = z.infer<typeof MapUnmappedChargeSchema>;
export type ApplyExplicitFxInput = z.infer<typeof ApplyExplicitFxSchema>;
