import { z } from 'zod';

export const orderItemSchema = z
  .object({
    variantId: z.string(),
    quantity: z.number().int().min(1),
    unitPriceKobo: z.number().int().min(0),
    discountKobo: z.number().int().min(0).optional(),
    taxKobo: z.number().int().min(0).optional(),
  })
  .strict();

export const createOrderBodySchema = z
  .object({
    customerId: z.string().optional(),
    locationId: z.string().optional(),
    assignedTo: z.string().optional(),
    channel: z.enum(['website', 'pos', 'whatsapp', 'manual']).default('manual'),
    items: z.array(orderItemSchema).min(1),
    discountKobo: z.number().int().min(0).optional(),
    taxKobo: z.number().int().min(0).optional(),
    note: z.string().optional(),
  })
  .strict();

export const listOrdersQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z
    .enum(['draft', 'confirmed', 'processing', 'fulfilled', 'cancelled', 'refunded'])
    .optional(),
  channel: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const idParamsSchema = z.object({
  id: z.string(),
});

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
