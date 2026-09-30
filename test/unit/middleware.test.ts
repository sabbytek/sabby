import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyRequest, FastifyReply } from 'fastify';

// ─── Mock db for tenant and feature-gate tests ────────────────────────────────
vi.mock('../../src/shared/db/client.js', () => ({
  db: { select: vi.fn() },
}));

import { db } from '../../src/shared/db/client.js';
import {
  requireAuth,
  requireRole,
  requireOwner,
  requireManager,
} from '../../src/shared/middleware/auth.js';
import { resolveTenant } from '../../src/shared/middleware/tenant.js';
import { requireFeature } from '../../src/shared/middleware/feature-gate.js';
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  FeatureGatedError,
} from '../../src/shared/errors/types.js';
import type { UserRole } from '../../src/shared/types/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mockRequest(overrides: Record<string, unknown> = {}): FastifyRequest {
  return {
    user: undefined,
    jwtVerify: vi.fn(),
    tenant: undefined,
    ...overrides,
  } as unknown as FastifyRequest;
}

const mockReply = {} as FastifyReply;

// ─── Auth middleware ───────────────────────────────────────────────────────────
describe('Auth middleware', () => {
  describe('requireAuth', () => {
    it('passes when jwtVerify succeeds', async () => {
      const request = mockRequest({ jwtVerify: vi.fn().mockResolvedValue(undefined) });
      await expect(requireAuth(request, mockReply)).resolves.toBeUndefined();
    });

    it('throws UnauthorizedError when jwtVerify rejects', async () => {
      const request = mockRequest({ jwtVerify: vi.fn().mockRejectedValue(new Error('bad token')) });
      await expect(requireAuth(request, mockReply)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('requireRole', () => {
    it('calls jwtVerify first then checks role', async () => {
      const jwtVerify = vi.fn().mockResolvedValue(undefined);
      const request = mockRequest({
        jwtVerify,
        user: { role: 'owner' as UserRole },
      });
      const mw = requireRole('owner');
      await expect(mw(request, mockReply)).resolves.toBeUndefined();
      expect(jwtVerify).toHaveBeenCalledOnce();
    });

    it('passes when user role matches', async () => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role: 'manager' as UserRole },
      });
      await expect(requireRole('manager')(request, mockReply)).resolves.toBeUndefined();
    });

    it('throws ForbiddenError when user role does not match', async () => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role: 'viewer' as UserRole },
      });
      await expect(requireRole('owner')(request, mockReply)).rejects.toThrow(ForbiddenError);
    });

    it('accepts multiple roles', async () => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role: 'manager' as UserRole },
      });
      await expect(requireRole('owner', 'manager')(request, mockReply)).resolves.toBeUndefined();
    });
  });

  describe('requireOwner', () => {
    it('passes for owner role', async () => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role: 'owner' as UserRole },
      });
      await expect(requireOwner(request, mockReply)).resolves.toBeUndefined();
    });

    const nonOwnerRoles: UserRole[] = ['manager', 'staff', 'viewer'];
    it.each(nonOwnerRoles)('throws ForbiddenError for %s', async (role) => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role },
      });
      await expect(requireOwner(request, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('requireManager', () => {
    it('passes for owner role', async () => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role: 'owner' as UserRole },
      });
      await expect(requireManager(request, mockReply)).resolves.toBeUndefined();
    });

    it('passes for manager role', async () => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role: 'manager' as UserRole },
      });
      await expect(requireManager(request, mockReply)).resolves.toBeUndefined();
    });

    const nonManagerRoles: UserRole[] = ['staff', 'viewer'];
    it.each(nonManagerRoles)('throws ForbiddenError for %s', async (role) => {
      const request = mockRequest({
        jwtVerify: vi.fn().mockResolvedValue(undefined),
        user: { role },
      });
      await expect(requireManager(request, mockReply)).rejects.toThrow(ForbiddenError);
    });
  });
});

// ─── Tenant middleware ─────────────────────────────────────────────────────────
describe('Tenant middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws UnauthorizedError when tenantId is missing', async () => {
    const request = mockRequest({ user: { role: 'owner' } });
    await expect(resolveTenant(request, mockReply)).rejects.toThrow(UnauthorizedError);
    await expect(resolveTenant(request, mockReply)).rejects.toThrow('Tenant context missing');
  });

  it('throws NotFoundError when tenant not found in DB', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const request = mockRequest({ user: { tenantId: 'tenant-1' } });
    await expect(resolveTenant(request, mockReply)).rejects.toThrow(NotFoundError);
  });

  it('throws UnauthorizedError when tenant is inactive', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'tenant-1', schemaName: 't_tenant_1', isActive: false }]),
        }),
      }),
    } as never);

    const request = mockRequest({ user: { tenantId: 'tenant-1' } });
    await expect(resolveTenant(request, mockReply)).rejects.toThrow(UnauthorizedError);
    await expect(resolveTenant(request, mockReply)).rejects.toThrow('suspended');
  });

  it('sets request.tenant when tenant is found and active', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockResolvedValue([{ id: 'tenant-1', schemaName: 't_tenant_1', isActive: true }]),
        }),
      }),
    } as never);

    const request = mockRequest({ user: { tenantId: 'tenant-1' } });
    await resolveTenant(request, mockReply);

    expect(request.tenant).toEqual({
      tenantId: 'tenant-1',
      schema: 't_tenant_1',
    });
  });
});

// ─── Feature-gate middleware ───────────────────────────────────────────────────
describe('Feature-gate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDbMock(row: unknown) {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(row ? [row] : []),
        }),
      }),
    } as never);
  }

  it('passes when feature is allowed on the plan', async () => {
    setupDbMock({ planTier: 'growth', subscriptionStatus: 'active' });

    const request = mockRequest({ tenant: { tenantId: 'tenant-1' } });
    await expect(requireFeature('reporting:pl')(request, mockReply)).resolves.toBeUndefined();
  });

  it('throws FeatureGatedError when feature is not allowed on plan', async () => {
    setupDbMock({ planTier: 'trial', subscriptionStatus: 'active' });

    const request = mockRequest({ tenant: { tenantId: 'tenant-1' } });
    await expect(requireFeature('reporting:pl')(request, mockReply)).rejects.toThrow(
      FeatureGatedError,
    );
  });

  it('throws FeatureGatedError when subscription is lapsed (non-subscription feature)', async () => {
    setupDbMock({ planTier: 'growth', subscriptionStatus: 'lapsed' });

    const request = mockRequest({ tenant: { tenantId: 'tenant-1' } });
    await expect(requireFeature('reporting:pl')(request, mockReply)).rejects.toThrow(
      FeatureGatedError,
    );
  });

  it('allows subscriptions:manage even when subscription is lapsed', async () => {
    setupDbMock({ planTier: 'growth', subscriptionStatus: 'lapsed' });

    const request = mockRequest({ tenant: { tenantId: 'tenant-1' } });
    await expect(
      requireFeature('subscriptions:manage')(request, mockReply),
    ).resolves.toBeUndefined();
  });

  it('throws FeatureGatedError when tenant not found', async () => {
    setupDbMock(undefined);

    const request = mockRequest({ tenant: { tenantId: 'tenant-1' } });
    await expect(requireFeature('orders:create')(request, mockReply)).rejects.toThrow(
      FeatureGatedError,
    );
  });

  it('throws FeatureGatedError for disallowed entry-level feature on trial plan', async () => {
    setupDbMock({ planTier: 'trial', subscriptionStatus: 'active' });

    const request = mockRequest({ tenant: { tenantId: 'tenant-1' } });
    await expect(requireFeature('invoicing:generate')(request, mockReply)).rejects.toThrow(
      FeatureGatedError,
    );
  });
});
