import { z } from 'zod';

export const listInventoryQuerySchema = z.object({
  locationId: z.string().optional().describe('Filter by location ID'),
  variantId: z.string().optional().describe('Filter by product variant ID'),
});

export const receiveStockBodySchema = z.object({
  variantId: z.string().describe('Product variant ID'),
  locationId: z.string().describe('Location ID to receive stock at'),
  quantity: z.number().int().min(1).describe('Quantity to receive (must be positive)'),
  note: z.string().optional().describe('Optional note for audit trail'),
}).strict();

export const adjustStockBodySchema = z.object({
  variantId: z.string().describe('Product variant ID'),
  locationId: z.string().describe('Location ID to adjust stock at'),
  quantity: z.number().int().describe('Adjustment quantity (positive = add, negative = remove)'),
  note: z.string().optional().describe('Reason for adjustment'),
}).strict();

export const movementsQuerySchema = z.object({
  variantId: z.string().optional().describe('Filter by product variant ID'),
  from: z.string().optional().describe('Start date (ISO 8601)'),
  to: z.string().optional().describe('End date (ISO 8601)'),
  page: z.string().optional().describe('Page number (default: 1)'),
  limit: z.string().optional().describe('Items per page (default: 20, max: 100)'),
});

export const lowStockQuerySchema = z.object({
  locationId: z.string().optional().describe('Filter by location ID'),
});

export const availabilityQuerySchema = z.object({
  sku: z.string().optional().describe('Product SKU to check availability for'),
  variantId: z.string().optional().describe('Product variant ID to check availability for'),
}).refine((data) => data.sku || data.variantId, {
  message: 'Either sku or variantId is required',
});

export const transferStockBodySchema = z.object({
  variantId: z.string().describe('Product variant ID to transfer'),
  fromLocationId: z.string().describe('Source location ID'),
  toLocationId: z.string().describe('Destination location ID'),
  quantity: z.number().int().min(1).describe('Quantity to transfer (must be positive)'),
  note: z.string().optional().describe('Transfer note for audit trail'),
}).strict();

// Response schemas for OpenAPI documentation
export const inventoryItemResponseSchema = z.object({
  id: z.string(),
  variantId: z.string(),
  locationId: z.string(),
  quantityOnHand: z.number(),
  lowStockThreshold: z.number(),
  updatedAt: z.string(),
  variantSku: z.string().nullable(),
  variantName: z.string().nullable(),
  locationName: z.string().nullable(),
});

export const locationStockSchema = z.object({
  locationId: z.string(),
  locationName: z.string(),
  quantityOnHand: z.number(),
  lowStockThreshold: z.number(),
  isLowStock: z.boolean(),
});

export const availabilityResponseSchema = z.object({
  sku: z.string().nullable(),
  variantId: z.string().nullable(),
  variantName: z.string().nullable(),
  totalStock: z.number().describe('Total stock across all locations'),
  availableAt: z.number().describe('Number of locations with stock > 0'),
  locations: z.array(locationStockSchema).describe('Stock levels at each location'),
});

export const transferResponseSchema = z.object({
  transferId: z.string().describe('Unique transfer reference ID'),
  variantId: z.string(),
  quantity: z.number(),
  from: z.object({
    locationId: z.string(),
    locationName: z.string(),
    quantityOnHand: z.number().describe('Remaining stock after transfer'),
  }),
  to: z.object({
    locationId: z.string(),
    locationName: z.string(),
    quantityOnHand: z.number().describe('New stock level after transfer'),
  }),
});

export type ListInventoryQuery = z.infer<typeof listInventoryQuerySchema>;
export type ReceiveStockBody = z.infer<typeof receiveStockBodySchema>;
export type AdjustStockBody = z.infer<typeof adjustStockBodySchema>;
export type MovementsQuery = z.infer<typeof movementsQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;
export type TransferStockBody = z.infer<typeof transferStockBodySchema>;
