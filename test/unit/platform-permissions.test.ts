import { describe, it, expect } from 'vitest';
import {
  PLATFORM_PERMISSIONS,
  hasPermission,
  requiresMfa,
  type PlatformPermission,
  type PlatformRole,
} from '../../src/config/platform-permissions.js';

const ALL_ROLES: PlatformRole[] = ['read_only', 'support', 'admin', 'super_admin'];

describe('platform permission matrix', () => {
  it('read_only cannot mutate anything', () => {
    const forbidden: PlatformPermission[] = [
      'tenants:create',
      'tenants:suspend',
      'tenants:delete',
      'tenants:change_plan',
      'tenants:override_features',
      'platform_users:manage',
      'billing:refund',
      'support:grant_write',
    ];
    for (const perm of forbidden) {
      expect(hasPermission('read_only', perm)).toBe(false);
    }
  });

  it('support can open grants and run repair actions but cannot administer tenants', () => {
    expect(hasPermission('support', 'support:grant_read')).toBe(true);
    expect(hasPermission('support', 'support:grant_write')).toBe(true);
    expect(hasPermission('support', 'support:resend_receipt')).toBe(true);
    expect(hasPermission('support', 'support:retry_webhook')).toBe(true);

    // The read+narrow-write boundary: support must not reach tenant lifecycle.
    expect(hasPermission('support', 'tenants:suspend')).toBe(false);
    expect(hasPermission('support', 'tenants:change_plan')).toBe(false);
    expect(hasPermission('support', 'tenants:delete')).toBe(false);
    expect(hasPermission('support', 'platform_users:manage')).toBe(false);
  });

  it('admin can suspend and change plans but cannot delete tenants or manage staff', () => {
    expect(hasPermission('admin', 'tenants:suspend')).toBe(true);
    expect(hasPermission('admin', 'tenants:change_plan')).toBe(true);
    expect(hasPermission('admin', 'tenants:create')).toBe(true);

    expect(hasPermission('admin', 'tenants:delete')).toBe(false);
    expect(hasPermission('admin', 'platform_users:manage')).toBe(false);
    expect(hasPermission('admin', 'billing:refund')).toBe(false);
  });

  it('super_admin holds every permission', () => {
    const everyPermission = new Set<PlatformPermission>(
      ALL_ROLES.flatMap((r) => [...PLATFORM_PERMISSIONS[r]]),
    );
    for (const perm of everyPermission) {
      expect(hasPermission('super_admin', perm)).toBe(true);
    }
  });

  it('roles are strictly cumulative — each tier is a superset of the one below', () => {
    const tiers: PlatformRole[] = ['read_only', 'support', 'admin', 'super_admin'];
    for (let i = 1; i < tiers.length; i++) {
      const lower = PLATFORM_PERMISSIONS[tiers[i - 1]!];
      const higher = PLATFORM_PERMISSIONS[tiers[i]!];
      for (const perm of lower) {
        expect(higher).toContain(perm);
      }
    }
  });

  it('every role can read audit — support access is never invisible to reviewers', () => {
    for (const role of ALL_ROLES) {
      expect(hasPermission(role, 'audit:read')).toBe(true);
    }
  });
});

describe('MFA requirements', () => {
  it('requires MFA for the roles that can reach across tenants destructively', () => {
    expect(requiresMfa('super_admin')).toBe(true);
    expect(requiresMfa('admin')).toBe(true);
  });

  it('does not force MFA on lower-privilege roles', () => {
    expect(requiresMfa('support')).toBe(false);
    expect(requiresMfa('read_only')).toBe(false);
  });
});

describe('plane separation', () => {
  it('tenant role names are not platform roles', () => {
    // A tenant users row hand-edited to role='owner'/'super_admin' must gain
    // nothing here: the platform matrix is keyed only by PlatformRole.
    const tenantRoles = ['owner', 'manager', 'staff', 'viewer'];
    for (const role of tenantRoles) {
      expect(Object.keys(PLATFORM_PERMISSIONS)).not.toContain(role);
    }
  });
});
