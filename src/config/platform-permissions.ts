/**
 * Platform (internal staff) permissions.
 *
 * Deliberately SEPARATE from PLAN_ENTITLEMENTS in ./features.ts:
 *   - Plan entitlements answer "what did this merchant pay for".
 *   - Platform permissions answer "what is this employee trusted with".
 * Conflating them would let a billing change alter internal access.
 *
 * Like feature gating, this is configuration — adding or moving a permission
 * never requires a change in a business module.
 */

export type PlatformRole = 'super_admin' | 'admin' | 'support' | 'read_only';

export type PlatformPermission =
  // Tenant lifecycle
  | 'tenants:read'
  | 'tenants:create'
  | 'tenants:suspend'
  | 'tenants:delete'
  | 'tenants:change_plan'
  | 'tenants:override_features'
  // Platform staff administration
  | 'platform_users:read'
  | 'platform_users:manage'
  // Audit
  | 'audit:read'
  // Support tooling (Phase B)
  | 'support:grant_read'
  | 'support:grant_write'
  | 'support:resend_receipt'
  | 'support:retry_webhook'
  | 'support:unlock_account'
  | 'support:reset_password'
  // Billing
  | 'billing:read'
  | 'billing:refund'
  // Analytics
  | 'analytics:read';

const READ_ONLY: PlatformPermission[] = [
  'tenants:read',
  'audit:read',
  'analytics:read',
  'billing:read',
];

const SUPPORT: PlatformPermission[] = [
  ...READ_ONLY,
  'support:grant_read',
  'support:grant_write',
  'support:resend_receipt',
  'support:retry_webhook',
  'support:unlock_account',
  'support:reset_password',
];

const ADMIN: PlatformPermission[] = [
  ...SUPPORT,
  'tenants:create',
  'tenants:suspend',
  'tenants:change_plan',
  'platform_users:read',
];

const SUPER_ADMIN: PlatformPermission[] = [
  ...ADMIN,
  'tenants:delete',
  'tenants:override_features',
  'platform_users:manage',
  'billing:refund',
];

export const PLATFORM_PERMISSIONS: Record<PlatformRole, readonly PlatformPermission[]> = {
  read_only: READ_ONLY,
  support: SUPPORT,
  admin: ADMIN,
  super_admin: SUPER_ADMIN,
};

/**
 * Roles that must have TOTP MFA enabled before they can obtain an access token.
 * These roles can reach across every tenant, so a stolen password alone
 * must not be sufficient.
 */
export const MFA_REQUIRED_ROLES: readonly PlatformRole[] = ['super_admin', 'admin'];

export function hasPermission(role: PlatformRole, permission: PlatformPermission): boolean {
  return PLATFORM_PERMISSIONS[role].includes(permission);
}

export function requiresMfa(role: PlatformRole): boolean {
  return MFA_REQUIRED_ROLES.includes(role);
}
