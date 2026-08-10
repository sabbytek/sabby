import { z } from 'zod';

export const createInvoiceBodySchema = z.object({
  orderId: z.string(),
}).strict();

export const listInvoicesQuerySchema = z.object({
  orderId: z.string().optional(),
});

export const idParamsSchema = z.object({
  id: z.string(),
});

export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
