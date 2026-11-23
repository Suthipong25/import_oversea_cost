import { z } from 'zod';

export const ExtractedChargeItemSchema = z.object({
  rawChargeName: z
    .string()
    .min(1)
    .describe('Verbatim charge description from the document, e.g., "40 DV", "Pickup", "Dest TRML HANDLG"'),
  categoryHint: z
    .enum(['Ocean', 'Origin_Local', 'Dest_Port', 'TH_Local_Transport', 'Insurance_Misc', 'Other'])
    .default('Other'),
  cellStatus: z
    .enum(['QUOTED', 'NOT_APPLICABLE', 'INCLUDED', 'MISSING'])
    .default('QUOTED')
    .describe('Use NOT_APPLICABLE when document explicitly shows "-" or "Waived/N/A"; INCLUDED when bundled'),
  amountThb: z
    .number()
    .nullable()
    .describe('Exact THB amount stated in document, or null if not explicitly stated'),
  amountUsd: z
    .number()
    .nullable()
    .describe('Exact USD amount stated in document, or null if not explicitly stated'),
  whtAmount: z
    .number()
    .nullable()
    .describe('Withholding tax amount in THB if explicitly stated, otherwise null'),
  vatAmount: z
    .number()
    .nullable()
    .describe('VAT amount in THB if explicitly stated, otherwise null'),
  chargeUnit: z
    .string()
    .nullable()
    .describe('Pricing unit such as PER_CBM, PER_WM, PER_RT, PER_CONTAINER, PER_BL, PER_HBL, PER_DAY, PER_SHIPMENT, or null'),
  unitAmountThb: z
    .number()
    .nullable()
    .optional()
    .describe('Unit price in THB before volume multiplier (e.g., per CBM or R/T)'),
  unitAmountUsd: z
    .number()
    .nullable()
    .optional()
    .describe('Unit price in USD before volume multiplier (e.g., per CBM or R/T)'),
  multiplier: z
    .number()
    .nullable()
    .optional()
    .describe('Multiplier applied (e.g., 2 for 2 CBM, 4 for 4 CBM/RT)'),
  sourcePage: z.number().int().positive().nullable().default(1),
  sourceTextSnippet: z.string().describe('Verbatim line or text snippet where this charge appeared'),
  confidenceScore: z.number().min(0).max(1).default(0.8),
});

export const ExtractionResultSchema = z.object({
  agentName: z.string().nullable().describe('Agent or supplier name issuing the rate, or null if unknown'),
  shippingLine: z.string().nullable().describe('Carrier / shipping line if stated, or null'),
  rateReference: z.string().nullable().describe('Quote reference number if stated, or null'),
  polPort: z.string().nullable().describe('Origin port (POL) if stated, or null'),
  podPort: z.string().nullable().describe('Destination port (POD) if stated, or null'),
  volumeCbm: z.number().nullable().optional().describe('Shipment volume in CBM or R/T if stated in document (e.g. 2, 4), or null'),
  validFrom: z.string().nullable().describe('ISO date YYYY-MM-DD if stated, or null'),
  validTo: z.string().nullable().describe('ISO date YYYY-MM-DD if stated, or null'),
  transitTimeDays: z.number().int().positive().nullable().describe('Transit days if stated, or null'),
  charges: z.array(ExtractedChargeItemSchema).describe('All itemized cost lines extracted from the source'),
  warnings: z.array(z.string()).default([]).describe('Ambiguities, missing dates, or suspicious instructions flagged'),
});

export type ExtractedChargeItem = z.infer<typeof ExtractedChargeItemSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;
