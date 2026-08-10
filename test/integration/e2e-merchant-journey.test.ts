/**
 * End-to-end merchant journey test.
 * Verifies the critical path: onboarding → product → order → payment → P&L.
 * All external deps (DB, queue, cache) are mocked; this tests the route + service
 * wiring, not persistence. Each step asserts the HTTP contract.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../src/modules/onboarding/service.js', () => ({
  getOnboardingStatus: vi.fn().mockResolvedValue({
    tenantId: 'tenant-e2e',
    tenantName: 'E2E Merchant',
    planTier: 'growth',
    completedSteps: ['Add your first location'],
    pendingSteps: [
      'Invite at least one staff member',
      'Add your first product',
      'Receive your first payment',
      'Activate a subscription plan',
    ],
    percentComplete: 20,
    isComplete: false,
  }),
}));

vi.mock('../../src/modules/products/service.js', () => ({
  createCategory: vi.fn().mockResolvedValue({ id: 'cat-e2e', name: 'Electronics' }),
  createProduct: vi.fn().mockResolvedValue({
    id: 'prod-e2e',
    name: 'Test Phone',
    categoryId: 'cat-e2e',
    isActive: true,
  }),
  createVariant: vi.fn().mockResolvedValue({
    id: 'var-e2e',
    productId: 'prod-e2e',
    name: '128GB Black',
    sku: 'TP-128-BLK',
    priceKobo: 25000000,
    isActive: true,
  }),
  listProducts: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
  getProduct: vi.fn().mockResolvedValue(null),
  listCategories: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn(),
  updateVariant: vi.fn(),
}));

vi.mock('../../src/modules/orders/service.js', () => {
  const draft = {
    id: 'order-e2e',
    orderNumber: 'ORD-000001',
    status: 'draft',
    channel: 'pos',
    subtotalKobo: 25000000,
    discountKobo: 0,
    taxKobo: 1875000,
    totalKobo: 26875000,
    paymentStatus: 'pending',
    items: [
      {
        id: 'item-e2e',
        orderId: 'order-e2e',
        variantId: 'var-e2e',
        quantity: 1,
        unitPriceKobo: 25000000,
        taxKobo: 1875000,
        lineTotalKobo: 26875000,
      },
    ],
  };
  return {
    createOrder: vi.fn().mockResolvedValue(draft),
    confirmOrder: vi.fn().mockResolvedValue({ ...draft, status: 'confirmed', paymentStatus: 'pending' }),
    getOrder: vi.fn().mockResolvedValue(draft),
    listOrders: vi.fn().mockResolvedValue({ items: [draft], total: 1, page: 1, limit: 20, totalPages: 1 }),
    processOrder: vi.fn(),
    fulfillOrder: vi.fn(),
    cancelOrder: vi.fn(),
    calculateOrderTotals: vi.fn(),
  };
});

vi.mock('../../src/modules/payments/service.js', () => ({
  initiatePayment: vi.fn().mockResolvedValue({
    authorizationUrl: 'https://checkout.paystack.com/test-ref',
    reference: 'bpos-test-ref',
  }),
  handlePaystackWebhook: vi.fn().mockResolvedValue({ processed: true }),
}));

vi.mock('../../src/modules/reporting/service.js', () => ({
  getPLReport: vi.fn().mockResolvedValue({
    from: '2025-01-01',
    to: '2025-01-31',
    revenueKobo: 26875000,
    cogsKobo: 0,
    grossProfitKobo: 26875000,
    feesKobo: 750000,
    opexKobo: 0,
    refundsKobo: 0,
    netProfitKobo: 26125000,
  }),
  getBestSellers: vi.fn().mockResolvedValue([]),
  getRevenueByLocation: vi.fn().mockResolvedValue([]),
  getStaffSalesReport: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/shared/middleware/tenant.js', () => ({
  resolveTenant: vi.fn(async (request: { tenant: { tenantId: string; schema: string } }) => {
    request.tenant = { tenantId: 'tenant-e2e', schema: 'e2e_schema' };
  }),
}));

vi.mock('../../src/shared/middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() => vi.fn(async () => {})),
}));

// ─── Setup ───────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let ownerToken: string;
let managerToken: string;

beforeAll(async () => {
  app = await getTestApp();
  ownerToken = app.jwt.sign({
    sub: 'owner-e2e',
    tid: 'tenant-e2e',
    role: 'owner',
    email: 'owner@e2e.test',
    type: 'access',
  });
  managerToken = app.jwt.sign({
    sub: 'manager-e2e',
    tid: 'tenant-e2e',
    role: 'manager',
    email: 'manager@e2e.test',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Journey ─────────────────────────────────────────────────────────────────

describe('Merchant Journey: onboarding → product → order → payment → reporting', () => {
  it('Step 1 — GET /onboarding shows incomplete setup', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/onboarding',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: { percentComplete: number; isComplete: boolean; pendingSteps: string[] } }>();
    expect(data.isComplete).toBe(false);
    expect(data.percentComplete).toBe(20);
    expect(data.pendingSteps.length).toBeGreaterThan(0);
  });

  it('Step 2 — POST /products/categories creates a category', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/categories',
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { name: 'Electronics' },
    });

    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { id: string; name: string } }>();
    expect(data.name).toBe('Electronics');
  });

  it('Step 3 — POST /products creates a product', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products',
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: {
        name: 'Test Phone',
        categoryId: 'cat-e2e',
      },
    });

    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { id: string; name: string } }>();
    expect(data.name).toBe('Test Phone');
  });

  it('Step 4 — POST /products/:id/variants adds a variant with price', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/products/prod-e2e/variants',
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: {
        name: '128GB Black',
        sku: 'TP-128-BLK',
        priceKobo: 25000000,
      },
    });

    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { id: string; priceKobo: number } }>();
    expect(data.priceKobo).toBe(25000000);
  });

  it('Step 5 — POST /orders creates a DRAFT order with VAT applied', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: {
        channel: 'pos',
        items: [{ variantId: 'var-e2e', quantity: 1, unitPriceKobo: 25000000 }],
      },
    });

    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { orderNumber: string; totalKobo: number; status: string } }>();
    expect(data.orderNumber).toBe('ORD-000001');
    expect(data.status).toBe('draft');
    expect(data.totalKobo).toBe(26875000); // 250,000 + 7.5% VAT = 268,750
  });

  it('Step 6 — POST /orders/:id/confirm transitions to confirmed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/orders/order-e2e/confirm',
      headers: { Authorization: `Bearer ${managerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json<{ data: { status: string } }>();
    expect(data.status).toBe('confirmed');
  });

  it('Step 7 — POST /payments/initiate returns Paystack checkout URL', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/payments/initiate',
      headers: { Authorization: `Bearer ${managerToken}` },
      payload: { orderId: 'order-e2e', email: 'customer@test.com' },
    });

    expect(res.statusCode).toBe(201);
    const { data } = res.json<{ data: { authorizationUrl: string; reference: string } }>();
    expect(data.authorizationUrl).toContain('checkout.paystack.com');
    expect(data.reference).toBeTruthy();
  });

  it('Step 8 — GET /reports/pl returns accurate P&L from ledger', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/reports/pl?from=2025-01-01T00:00:00.000Z&to=2025-01-31T23:59:59.999Z',
      headers: { Authorization: `Bearer ${ownerToken}` },
    });

    expect(res.statusCode).toBe(200);
    const { data } = res.json<{
      data: {
        revenueKobo: number;
        netProfitKobo: number;
        feesKobo: number;
      };
    }>();
    expect(data.revenueKobo).toBe(26875000);
    expect(data.feesKobo).toBe(750000);
    expect(data.netProfitKobo).toBe(26125000);
  });

  it('Step 9 — GET /health returns 200 at all times', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string }>();
    expect(body.status).toBe('ok');
  });

  it('Step 10 — Unauthenticated requests to protected routes return 401', async () => {
    const protectedRoutes = [
      { method: 'GET' as const, url: '/v1/onboarding' },
      { method: 'GET' as const, url: '/v1/orders' },
      { method: 'GET' as const, url: '/v1/products' },
    ];

    for (const route of protectedRoutes) {
      const res = await app.inject({ method: route.method, url: route.url });
      expect(res.statusCode, `${route.method} ${route.url} should return 401`).toBe(401);
    }
  });
});
