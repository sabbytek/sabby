import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

// ─── Mock service and dependencies ───────────────────────────────────────────

vi.mock('../../src/modules/payments/service.js', () => ({
  initiatePayment: vi.fn().mockResolvedValue({
    authorizationUrl: 'https://checkout.paystack.com/testref',
    reference: 'bpos-test-ref-001',
  }),
  handlePaystackWebhook: vi.fn().mockResolvedValue({ processed: true }),
}));

vi.mock('../../src/shared/payments/paystack.js', () => ({
  paystackGateway: {
    name: 'paystack',
    initiatePayment: vi.fn(),
    verifyPayment: vi.fn(),
    validateWebhookSignature: vi.fn((rawBody: string, sig: string) => {
      // In tests, accept the correct test HMAC
      const expected = crypto
        .createHmac('sha512', 'sk_test_placeholder')
        .update(rawBody)
        .digest('hex');
      return expected === sig;
    }),
  },
}));

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

beforeAll(async () => {
  app = await getTestApp();
  bearerToken = app.jwt.sign({
    sub: 'user-test',
    tid: 'tenant-test',
    role: 'staff',
    email: 'staff@test.com',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Payments API', () => {
  it('POST /v1/payments/initiate creates a payment and returns authorization URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/initiate',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: {
        orderId: 'order-1',
        email: 'customer@example.com',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json<{
      success: boolean;
      data: { authorizationUrl: string; reference: string };
    }>();
    expect(body.success).toBe(true);
    expect(body.data.authorizationUrl).toBe('https://checkout.paystack.com/testref');
    expect(body.data.reference).toBe('bpos-test-ref-001');
  });

  it('POST /v1/payments/initiate returns 400 when email is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/initiate',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { orderId: 'order-1' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/payments/initiate returns 400 when orderId is missing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/initiate',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { email: 'customer@example.com' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/payments/initiate requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/initiate',
      payload: { orderId: 'order-1', email: 'customer@example.com' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /v1/payments/webhook/paystack returns 200 for valid signature', async () => {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: {
        id: 'evt-001',
        reference: 'bpos-test-ref-001',
        amount: 100000,
        fees: 1500,
        status: 'success',
        metadata: { orderId: 'order-1', schemaName: 'test_schema' },
      },
    });

    const signature = crypto
      .createHmac('sha512', 'sk_test_placeholder')
      .update(payload)
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/webhook/paystack',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean }>();
    expect(body.success).toBe(true);
  });

  it('POST /v1/payments/webhook/paystack returns 200 for invalid signature (webhook best practice)', async () => {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: { id: 'evt-002', reference: 'bpos-ref-002', amount: 50000 },
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/webhook/paystack',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': 'invalid-signature-hex',
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ received: boolean }>();
    expect(body.received).toBe(true);
  });

  it('POST /v1/payments/webhook/paystack handles charge.failed event', async () => {
    const payload = JSON.stringify({
      event: 'charge.failed',
      data: {
        id: 'evt-003',
        reference: 'bpos-failed-ref',
        amount: 100000,
        status: 'failed',
        metadata: { orderId: 'order-2', schemaName: 'test_schema' },
      },
    });

    const signature = crypto
      .createHmac('sha512', 'sk_test_placeholder')
      .update(payload)
      .digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/payments/webhook/paystack',
      headers: {
        'Content-Type': 'application/json',
        'x-paystack-signature': signature,
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean }>();
    expect(body.success).toBe(true);
  });
});
