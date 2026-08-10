import { z } from 'zod';

export const plReportQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const bestSellersQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.string().optional(),
});

export const revenueByLocationQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const staffSalesQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

export const inventoryValuationQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export type PlReportQuery = z.infer<typeof plReportQuerySchema>;
export type BestSellersQuery = z.infer<typeof bestSellersQuerySchema>;
export type RevenueByLocationQuery = z.infer<typeof revenueByLocationQuerySchema>;
export type StaffSalesQuery = z.infer<typeof staffSalesQuerySchema>;
export type InventoryValuationQuery = z.infer<typeof inventoryValuationQuerySchema>;
