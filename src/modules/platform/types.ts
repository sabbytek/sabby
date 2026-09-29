/**
 * Shared types for the platform (internal admin) plane.
 *
 * Mirrors the role of shared/types/controller.ts on the tenant side, but
 * carries no tenant context: a platform actor belongs to no tenant.
 */

import type { PlatformRole } from '../../config/platform-permissions.js';

/**
 * Everything the audit log needs about who performed an action and from where.
 * Built once per request by makePlatformContext().
 */
export interface PlatformAuditActor {
  platformUserId: string;
  email: string;
  role: PlatformRole;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

/** Context handed to platform controllers. */
export type PlatformContext = PlatformAuditActor;
