import { describe, it, expect } from 'vitest';
import {
  roleHasPermission,
  permissionsForRole,
  PLATFORM_PERMISSIONS,
} from '../../src/modules/platform/permissions.js';

describe('platform RBAC matrix', () => {
  it('support can view and read tenants but cannot suspend or manage users', () => {
    expect(roleHasPermission('support', 'platform:view')).toBe(true);
    expect(roleHasPermission('support', 'tenant:read')).toBe(true);
    expect(roleHasPermission('support', 'tenant:suspend')).toBe(false);
    expect(roleHasPermission('support', 'tenant:pii:reveal')).toBe(false);
    expect(roleHasPermission('support', 'platform_user:manage')).toBe(false);
  });

  it('admin can suspend and manage billing but cannot manage platform users or config', () => {
    expect(roleHasPermission('admin', 'tenant:suspend')).toBe(true);
    expect(roleHasPermission('admin', 'billing:manage')).toBe(true);
    expect(roleHasPermission('admin', 'tenant:pii:reveal')).toBe(true);
    expect(roleHasPermission('admin', 'platform_user:manage')).toBe(false);
    expect(roleHasPermission('admin', 'config:manage')).toBe(false);
  });

  it('super_admin holds every permission', () => {
    for (const permission of PLATFORM_PERMISSIONS) {
      expect(roleHasPermission('super_admin', permission)).toBe(true);
    }
  });

  it('audit read scope narrows for support', () => {
    expect(roleHasPermission('support', 'audit:read:own')).toBe(true);
    expect(roleHasPermission('support', 'audit:read:all')).toBe(false);
    expect(roleHasPermission('admin', 'audit:read:all')).toBe(true);
  });

  it('every listed permission is unique', () => {
    expect(new Set(PLATFORM_PERMISSIONS).size).toBe(PLATFORM_PERMISSIONS.length);
  });

  it('support permissions are a subset of admin, and admin of super_admin', () => {
    const support = new Set(permissionsForRole('support'));
    const admin = new Set(permissionsForRole('admin'));
    const superAdmin = new Set(permissionsForRole('super_admin'));
    for (const p of support) expect(admin.has(p)).toBe(true);
    for (const p of admin) expect(superAdmin.has(p)).toBe(true);
  });
});
