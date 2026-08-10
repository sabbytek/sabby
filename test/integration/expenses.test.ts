import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service ─────────────────────────────────────────────────────────────

vi.mock('../../src/modules/expenses/service.js', () => {
  const expense = {
    id: 'exp-1',
    tenantId: 'tenant-test',
    category: 'rent',
    description: 'Office rent',
    amountKobo: 500000,
    date: new Date().toISOString(),
    receiptUrl: null,
    createdBy: 'user-test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    createExpense: vi.fn().mockResolvedValue(expense),
    listExpenses: vi.fn().mockResolvedValue({ items: [expense], total: 1, page: 1, limit: 20, totalPages: 1 }),
    getExpense: vi.fn().mockResolvedValue(expense),
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

describe('Expenses API', () => {
  describe('POST /v1/expenses', () => {
    it('creates an expense', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/expenses',
        headers: { authorization: `Bearer ${bearerToken}` },
        payload: {
          category: 'rent',
          description: 'Office rent',
          amountKobo: 500000,
          expenseDate: new Date().toISOString(),
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.category).toBe('rent');
    });
  });

  describe('GET /v1/expenses', () => {
    it('lists expenses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/expenses',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(1);
    });
  });

  describe('GET /v1/expenses/:id', () => {
    it('gets an expense by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/expenses/exp-1',
        headers: { authorization: `Bearer ${bearerToken}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('exp-1');
    });
  });
});
