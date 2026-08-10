/**
 * Controller layer types and utilities.
 * Controllers receive pre-extracted, typed data — never the raw Fastify request.
 */

import type { UserRole } from './index.js';

/**
 * Standardized context passed to all controller methods.
 * Extracts only what controllers need from the Fastify request.
 * Controllers never import Fastify types directly.
 */
export interface RequestContext {
  /** Tenant schema name for database queries */
  schema: string;
  /** Tenant ID */
  tenantId: string;
  /** Authenticated user's ID */
  userId: string;
  /** Authenticated user's role */
  role: UserRole;
  /** Authenticated user's email */
  email: string;
}

/**
 * Pagination input — common across all list endpoints.
 */
export interface PaginationInput {
  page: number;
  limit: number;
}

/**
 * Parse pagination query params with defaults.
 * Enforces min/max bounds.
 */
export function parsePagination(query: { page?: string; limit?: string }): PaginationInput {
  return {
    page: Math.max(1, parseInt(query.page ?? '1', 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20)),
  };
}

/**
 * Date range query params — common across reporting endpoints.
 */
export interface DateRangeInput {
  from?: string;
  to?: string;
}

/**
 * Parse and validate date range query params.
 * Returns undefined dates if not provided.
 */
export function parseDateRange(query: { from?: string; to?: string }): {
  from?: Date;
  to?: Date;
} {
  const from = query.from ? new Date(query.from) : undefined;
  const to = query.to ? new Date(query.to) : undefined;
  const result: { from?: Date; to?: Date } = {};
  if (from) result.from = from;
  if (to) result.to = to;
  return result;
}
