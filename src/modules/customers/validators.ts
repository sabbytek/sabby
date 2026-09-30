import { z } from 'zod';

export const createCustomerBodySchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    note: z.string().optional(),
    consentGivenAt: z.string().optional(),
    consentSource: z.enum(['pos_signup', 'whatsapp_chat', 'web_checkout', 'manual']).optional(),
  })
  .strict();

export const listCustomersQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().optional(),
});

export const idParamsSchema = z.object({
  id: z.string(),
});

export const updateCustomerBodySchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().nullable().optional(),
    email: z.string().email().nullable().optional(),
    phone: z.string().nullable().optional(),
    address: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    consentGivenAt: z.string().nullable().optional(),
    consentSource: z
      .enum(['pos_signup', 'whatsapp_chat', 'web_checkout', 'manual'])
      .nullable()
      .optional(),
  })
  .strict();

export type CreateCustomerBody = z.infer<typeof createCustomerBodySchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type UpdateCustomerBody = z.infer<typeof updateCustomerBodySchema>;
