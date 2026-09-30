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

// ─── Response envelopes (documentation + serialization) ──────────────────────
// Mirror sendSuccess() in response.ts and errorHandler() in errors/handler.ts.
// The zod serializer validates replies against these, so keep them exact.

export function successEnvelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
  });
}

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
