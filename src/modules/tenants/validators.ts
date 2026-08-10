import { z } from 'zod';

export const createTenantBodySchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  businessEmail: z.string().email(),
  businessPhone: z.string().optional(),
  ownerFirstName: z.string().min(1),
  ownerLastName: z.string().min(1),
  ownerPassword: z.string().min(8),
}).strict();

export type CreateTenantBody = z.infer<typeof createTenantBodySchema>;
