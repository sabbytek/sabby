import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service ─────────────────────────────────────────────────────────────

vi.mock('../../src/modules/invoicing/service.js', () => {
  const invoice = {
    id: 'inv-1',
    tenantId: 'tenant-test',
    orderId: 'order-1',
    invoiceNumber: 'INV-000001',
    status: 'draft',
    subtotalKobo: 100000,
    taxKobo: 7500,
    totalKobo: 107500,
    dueDate: new Date().toISOString(),
    paidAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    generateInvoice: vi.fn().mockResolvedValue(invoice),
    listInvoices: vi
      .fn()
      .mockResolvedValue({ items: [invoice], total: 1, page: 1, limit: 20, totalPages: 1 }),
    getInvoice: vi.fn().mockResolvedValue(invoice),
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

describe('Invoicing API', () => {
  describe('POST /v1/invoices', () => {
    it('creates an invoice', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/invoices',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: { orderId: 'order-1' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.invoiceNumber).toBe('INV-000001');
    });
  });

  describe('GET /v1/invoices', () => {
    it('lists invoices', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/invoices',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
    });
  });

  describe('GET /v1/invoices/:id', () => {
    it('gets an invoice by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/invoices/inv-1',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('inv-1');
    });
  });
});
