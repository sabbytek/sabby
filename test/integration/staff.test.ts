import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service ─────────────────────────────────────────────────────────────

vi.mock('../../src/modules/staff/service.js', () => {
  const staff = {
    id: 'staff-1',
    tenantId: 'tenant-test',
    email: 'staff@example.com',
    firstName: 'Staff',
    lastName: 'User',
    role: 'staff',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    listStaff: vi.fn().mockResolvedValue([staff]),
    getStaffMember: vi.fn().mockResolvedValue(staff),
    inviteStaff: vi.fn().mockResolvedValue(staff),
    updateStaffMember: vi.fn().mockResolvedValue({ ...staff, role: 'manager' }),
    deactivateStaffMember: vi.fn().mockResolvedValue({ ...staff, isActive: false }),
  };
});

vi.mock('../../src/shared/middleware/tenant.js', () => ({
  resolveTenant: vi.fn(async (request: { tenant: { tenantId: string; schema: string } }) => {
    request.tenant = { tenantId: 'tenant-test', schema: 'test_schema' };
  }),
}));

vi.mock('../../src/shared/middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() => vi.fn(async () => {})),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

let app: FastifyInstance;
let ownerToken: string;

beforeAll(async () => {
  app = await getTestApp();
  ownerToken = app.jwt.sign({
    sub: 'user-test',
    tid: 'tenant-test',
    role: 'owner',
    email: 'owner@example.com',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Staff API', () => {
  describe('POST /v1/staff/invite', () => {
    it('invites a staff member', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/staff/invite',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: {
          email: 'staff@example.com',
          firstName: 'Staff',
          lastName: 'User',
          role: 'staff',
          temporaryPassword: 'securePass123',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('staff@example.com');
    });
  });

  describe('GET /v1/staff', () => {
    it('lists staff members', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/staff',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('GET /v1/staff/:id', () => {
    it('gets a staff member by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/staff/staff-1',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('staff-1');
    });
  });

  describe('PATCH /v1/staff/:id', () => {
    it('updates staff role', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/staff/staff-1',
        headers: { authorization: `Bearer ${ownerToken}` },
        payload: { role: 'manager' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /v1/staff/:id', () => {
    it('deactivates a staff member', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/staff/staff-1',
        headers: { authorization: `Bearer ${ownerToken}` },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
