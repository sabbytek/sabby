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

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
