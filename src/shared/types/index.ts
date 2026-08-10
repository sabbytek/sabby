import type { PlanTier } from '../../config/features.js';

export interface TenantContext {
  tenantId: string;
  schema: string;
}

export interface AuthUser {
  userId: string;
  tenantId: string;
  role: UserRole;
  email: string;
}

export type UserRole = 'owner' | 'manager' | 'staff' | 'viewer';

export interface JwtPayload {
  sub: string;       // userId
  tid: string;       // tenantId
  role: UserRole;
  email: string;
  type: 'access' | 'refresh';
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  schema: string;
  planTier: PlanTier;
  createdAt: Date;
}

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

