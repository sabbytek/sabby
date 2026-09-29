import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service ─────────────────────────────────────────────────────────────

vi.mock('../../src/modules/customers/service.js', () => {
  const customer = {
    id: 'cust-1',
    tenantId: 'tenant-test',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+2348012345678',
    address: '123 Lagos St',
    note: null,
    consentGivenAt: null,
    consentSource: null,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    createCustomer: vi.fn().mockResolvedValue(customer),
    listCustomers: vi
      .fn()
      .mockResolvedValue({ items: [customer], total: 1, page: 1, limit: 20, totalPages: 1 }),
    getCustomer: vi.fn().mockResolvedValue(customer),
    updateCustomer: vi.fn().mockResolvedValue({ ...customer, firstName: 'Jane' }),
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

describe('Customers API', () => {
  describe('POST /v1/customers', () => {
    it('creates a customer', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: { firstName: 'John', email: 'john@example.com' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.firstName).toBe('John');
    });

    it('requires firstName', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/customers',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: { email: 'john@example.com' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /v1/customers', () => {
    it('lists customers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/customers',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
    });
  });

  describe('GET /v1/customers/:id', () => {
    it('gets a customer by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/customers/cust-1',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('cust-1');
    });
  });

  describe('PATCH /v1/customers/:id', () => {
    it('updates a customer', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/customers/cust-1',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: { firstName: 'Jane' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
    });
  });
});
