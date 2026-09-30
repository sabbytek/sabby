import { z } from 'zod';

export const listInventoryQuerySchema = z.object({
  locationId: z.string().optional(),
  variantId: z.string().optional(),
});

export const receiveStockBodySchema = z
  .object({
    variantId: z.string(),
    locationId: z.string(),
    quantity: z.number().int().min(1),
    note: z.string().optional(),
  })
  .strict();

export const adjustStockBodySchema = z
  .object({
    variantId: z.string(),
    locationId: z.string(),
    quantity: z.number().int(),
    note: z.string().optional(),
  })
  .strict();

export const movementsQuerySchema = z.object({
  variantId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

export const lowStockQuerySchema = z.object({
  locationId: z.string().optional(),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ReceiveStockBody = z.infer<typeof receiveStockBodySchema>;
export type AdjustStockBody = z.infer<typeof adjustStockBodySchema>;
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
