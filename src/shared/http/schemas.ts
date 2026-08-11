import { z } from 'zod';

// ─── Common params ───────────────────────────────────────────────────────────

export const idParamsSchema = z.object({
  id: z.string(),
});

export const twoIdParamsSchema = z.object({
  id: z.string(),
  vid: z.string(),
});

// ─── Common pagination query ─────────────────────────────────────────────────

export const paginationQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

// ─── Common date range query ─────────────────────────────────────────────────

export const dateRangeQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

// ─── Pagination + date range combo ───────────────────────────────────────────

export const paginatedDateRangeQuerySchema = paginationQuerySchema.extend({
  from: z.string().optional(),
  to: z.string().optional(),
});

// ─── Response wrappers for OpenAPI documentation ─────────────────────────────

export function successResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

export function createdResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}

export function paginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    success: z.literal(true),
    data: z.object({
      items: z.array(itemSchema),
      total: z.number(),
      page: z.number(),
      limit: z.number(),
      totalPages: z.number(),
    }),
  });
}

export function errorResponseSchema() {
  return z.object({
    success: z.literal(false),
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
  });
}

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
