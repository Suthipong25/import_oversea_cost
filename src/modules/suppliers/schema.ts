import { z } from 'zod';

export const CreateSupplierSchema = z.object({
  name: z.string().trim().min(1, 'Agent name is required').max(120),
  companyName: z.string().trim().min(1, 'Company name is required').max(200),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  email: z.string().trim().email('Invalid email').optional().or(z.literal('')).nullable(),
  countryCode: z
    .string()
    .trim()
    .min(2)
    .max(4)
    .default('TH')
    .transform((v) => v.toUpperCase()),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export type CreateSupplierInput = z.infer<typeof CreateSupplierSchema>;
