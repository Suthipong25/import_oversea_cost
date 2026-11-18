import { z } from 'zod';

export const ShipmentContainerInputSchema = z.object({
  containerType: z
    .string()
    .trim()
    .min(2, 'Container type is required (e.g., 40DV, 20GP)')
    .max(20),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(999),
  weightKgPerCntr: z.coerce.number().positive().optional().nullable(),
});

export const CreateShipmentSchema = z.object({
  customerName: z.string().trim().min(2, 'Customer name is required').max(200),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  contactPhone: z.string().trim().max(60).optional().nullable(),
  contactEmail: z.string().trim().email('Invalid email address').optional().or(z.literal('')).nullable(),
  polPortCode: z
    .string()
    .trim()
    .min(2, 'POL port code is required (e.g., USLAX)')
    .max(20)
    .transform((v) => v.toUpperCase()),
  podPortCode: z
    .string()
    .trim()
    .min(2, 'POD port code is required (e.g., THLCH)')
    .max(20)
    .transform((v) => v.toUpperCase()),
  incoterm: z.string().trim().max(16).optional().nullable(),
  commodityDescription: z.string().trim().max(500).optional().nullable(),
  targetEtd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Target ETD must be YYYY-MM-DD')
    .optional()
    .or(z.literal(''))
    .nullable(),
  containers: z
    .array(ShipmentContainerInputSchema)
    .min(1, 'At least one container size/quantity is required')
    .max(10),
});

export type CreateShipmentInput = z.infer<typeof CreateShipmentSchema>;
