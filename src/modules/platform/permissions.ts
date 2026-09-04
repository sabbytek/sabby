/**
 * Platform RBAC.
 *
 * Permissions are the unit of authorization; roles are bundles of permissions.
 * Routes declare the permission they need, never a role, so the capability
 * matrix lives here and only here. Mirrors the matrix in
 * sabby-admin/docs/ADMIN-DASHBOARD-PLAN.md (section 2).
 */
import type { PlatformRole } from '../../shared/types/index.js';

export const PLATFORM_PERMISSIONS = [
  'platform:view', // KPIs and dashboards
  'tenant:read', // list + detail with masked PII
  'tenant:pii:reveal', // unmask PII (audited)
  'tenant:suspend', // suspend / reactivate a tenant
  'tenant:plan:manage', // change plan tier, extend trial
  'billing:manage', // manual billing overrides, refunds
  'support:access', // request time-boxed access to a tenant
  'audit:read:all', // read every actor's audit entries
  'audit:read:own', // read only own audit entries
  'platform_user:manage', // create / disable platform users, assign roles
  'config:manage', // feature entitlements and platform config
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  // audit:read:own is universal (everyone can see their own trail);
  // audit:read:all is the elevation that lets admin+ see everyone's.
  support: ['platform:view', 'tenant:read', 'support:access', 'audit:read:own'],
  admin: [
    'platform:view',
    'tenant:read',
    'tenant:pii:reveal',
    'tenant:suspend',
    'tenant:plan:manage',
    'billing:manage',
    'support:access',
    'audit:read:own',
    'audit:read:all',
  ],
  super_admin: [
    'platform:view',
    'tenant:read',
    'tenant:pii:reveal',
    'tenant:suspend',
    'tenant:plan:manage',
    'billing:manage',
    'support:access',
    'audit:read:own',
    'audit:read:all',
    'platform_user:manage',
    'config:manage',
  ],
};

export function permissionsForRole(role: PlatformRole): readonly PlatformPermission[] {
  return ROLE_PERMISSIONS[role];
}

export function roleHasPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
