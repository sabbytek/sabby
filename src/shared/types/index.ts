import type { PlanTier } from '../../config/features.js';
import type { PlatformRole } from '../../config/platform-permissions.js';

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

/**
 * Authenticated internal-staff identity. Deliberately has NO tenantId —
 * a platform user belongs to no tenant. Cross-tenant reach is granted
 * per-tenant and time-boxed via tenant_access_grants (Phase B), never
 * implied by the identity itself.
 */
export interface PlatformAuthUser {
  platformUserId: string;
  role: PlatformRole;
  email: string;
}

/** Payload carried in a platform access token. `aud` separates the planes. */
export interface PlatformJwtPayload {
  sub: string; // platformUserId
  role: PlatformRole;
  email: string;
  aud: 'platform';
  type: 'access';
}

export interface JwtPayload {
  sub: string; // userId
  tid: string; // tenantId
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

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

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
