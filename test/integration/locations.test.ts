import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service ─────────────────────────────────────────────────────────────

vi.mock('../../src/modules/locations/service.js', () => {
  const location = {
    id: 'loc-1',
    tenantId: 'tenant-test',
    name: 'Main Store',
    address: '45 Lagos Island',
    city: 'Lagos',
    state: 'Lagos',
    phone: '+2348012345678',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    listLocations: vi.fn().mockResolvedValue([location]),
    getLocation: vi.fn().mockResolvedValue(location),
    createLocation: vi.fn().mockResolvedValue(location),
    updateLocation: vi.fn().mockResolvedValue({ ...location, name: 'Updated Store' }),
    deactivateLocation: vi.fn().mockResolvedValue({ ...location, isActive: false }),
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
let bearerToken: string;

beforeAll(async () => {
  app = await getTestApp();
  bearerToken = app.jwt.sign({
    sub: 'user-test',
    tid: 'tenant-test',
    role: 'manager',
    email: 'test@example.com',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Locations API', () => {
  describe('POST /v1/locations', () => {
    it('creates a location', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/locations',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: {
          name: 'Main Store',
          address: '45 Lagos Island',
          city: 'Lagos',
          state: 'Lagos',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Main Store');
    });
  });

  describe('GET /v1/locations', () => {
    it('lists locations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/locations',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
    });
  });

  describe('GET /v1/locations/:id', () => {
    it('gets a location by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/locations/loc-1',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('loc-1');
    });
  });

  describe('PATCH /v1/locations/:id', () => {
    it('updates a location', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/locations/loc-1',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: { name: 'Updated Store' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });

  describe('DELETE /v1/locations/:id', () => {
    it('deactivates a location', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/locations/loc-1',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
