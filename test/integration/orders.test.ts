import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import { ValidationError } from '../../src/shared/errors/types.js';
import type { FastifyInstance } from 'fastify';

// ─── Mock service and middleware ──────────────────────────────────────────────

// Note: vi.mock is hoisted to the top of the file by Vitest.
// All mock data must be defined INSIDE the factory, not as outer variables.
vi.mock('../../src/modules/orders/service.js', () => {
  const draft = {
    id: 'order-1',
    orderNumber: 'ORD-000001',
    status: 'draft',
    channel: 'manual',
    subtotalKobo: 50000,
    discountKobo: 0,
    taxKobo: 0,
    totalKobo: 50000,
    customerId: null,
    locationId: 'loc-1',
    assignedTo: null,
    note: null,
    paymentStatus: 'pending',
    fulfilledAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    items: [
      {
        id: 'item-1',
        orderId: 'order-1',
        variantId: 'var-1',
        quantity: 1,
        unitPriceKobo: 50000,
        discountKobo: 0,
        taxKobo: 0,
        lineTotalKobo: 50000,
        createdAt: new Date().toISOString(),
      },
    ],
  };

  return {
    createOrder: vi.fn().mockResolvedValue(draft),
    listOrders: vi.fn().mockResolvedValue({ items: [draft], total: 1, page: 1, limit: 20, totalPages: 1 }),
    getOrder: vi.fn().mockResolvedValue(draft),
    confirmOrder: vi.fn().mockResolvedValue({ ...draft, status: 'confirmed' }),
    processOrder: vi.fn().mockResolvedValue({ ...draft, status: 'processing' }),
    fulfillOrder: vi.fn().mockResolvedValue({ ...draft, status: 'fulfilled' }),
    cancelOrder: vi.fn().mockResolvedValue({ ...draft, status: 'cancelled' }),
    calculateOrderTotals: vi.fn(),
  };
});

vi.mock('../../src/shared/middleware/tenant.js', () => ({
  resolveTenant: vi.fn(async (request: { tenant: { tenantId: string; schema: string } }) => {
    request.tenant = { tenantId: 'tenant-test', schema: 'test_schema' };
  }),
}));

vi.mock('../../src/shared/middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() =>
    vi.fn(async () => {
      // no-op
    }),
  ),
}));

// ─── Test helpers ─────────────────────────────────────────────────────────────

let app: FastifyInstance;
let bearerToken: string;
let managerToken: string;

beforeAll(async () => {
  app = await getTestApp();
  bearerToken = app.jwt.sign({
    sub: 'user-test',
    tid: 'tenant-test',
    role: 'staff',
    email: 'staff@test.com',
    type: 'access',
  });
  managerToken = app.jwt.sign({
    sub: 'manager-test',
    tid: 'tenant-test',
    role: 'manager',
    email: 'manager@test.com',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Orders API', () => {
  it('POST /v1/orders creates a DRAFT order', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: {
        locationId: 'loc-1',
        items: [{ variantId: 'var-1', quantity: 1, unitPriceKobo: 50000 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{ success: boolean; data: { status: string; orderNumber: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('draft');
    expect(body.data.orderNumber).toBe('ORD-000001');
  });

  it('POST /v1/orders returns 400 when items array is empty', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { items: [] },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/orders returns 400 when items is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { locationId: 'loc-1' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('GET /v1/orders returns paginated list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/orders',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { total: number } }>();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
  });

  it('GET /v1/orders/:id returns single order with items', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/orders/order-1',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { id: string; items: unknown[] } }>();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe('order-1');
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it('POST /v1/orders/:id/confirm transitions to confirmed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders/order-1/confirm',
      headers: { Authorization: `Bearer ${managerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { status: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('confirmed');
  });

  it('POST /v1/orders/:id/cancel transitions to cancelled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders/order-1/cancel',
      headers: { Authorization: `Bearer ${managerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { status: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('cancelled');
  });

  it('POST /v1/orders requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders',
      payload: { items: [{ variantId: 'v', quantity: 1, unitPriceKobo: 1000 }] },
    });

    expect(response.statusCode).toBe(401);
  });

  it('invalid state transition returns 400 with VALIDATION_ERROR', async () => {
    const { confirmOrder } = await import('../../src/modules/orders/service.js');
    vi.mocked(confirmOrder).mockRejectedValueOnce(
      new ValidationError("Cannot transition order from 'fulfilled' to 'confirmed'"),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/v1/orders/order-fulfilled/confirm',
      headers: { Authorization: `Bearer ${managerToken}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
