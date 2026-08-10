import { z } from 'zod';

export const createCategoryBodySchema = z.object({
  name: z.string().min(1),
  parentId: z.string().optional(),
}).strict();

export const listProductsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  search: z.string().optional(),
});

export const createProductBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  imageUrl: z.string().optional(),
}).strict();

export const updateProductBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export const idParamsSchema = z.object({
  id: z.string(),
});

export const createVariantBodySchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  priceKobo: z.number().int().min(0),
  costKobo: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).optional(),
  attributes: z.string().optional(),
}).strict();

export const variantParamsSchema = z.object({
  id: z.string(),
  vid: z.string(),
});

export const updateVariantBodySchema = z.object({
  name: z.string().min(1).optional(),
  priceKobo: z.number().int().min(0).optional(),
  costKobo: z.number().int().min(0).optional(),
  taxRateBps: z.number().int().min(0).max(10000).nullable().optional(),
  attributes: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
}).strict();

export type CreateCategoryBody = z.infer<typeof createCategoryBodySchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type CreateProductBody = z.infer<typeof createProductBodySchema>;
export type UpdateProductBody = z.infer<typeof updateProductBodySchema>;
export type CreateVariantBody = z.infer<typeof createVariantBodySchema>;
export type UpdateVariantBody = z.infer<typeof updateVariantBodySchema>;
