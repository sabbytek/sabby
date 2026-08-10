import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';
import crypto from 'crypto';

// ─── Mock service and middleware ──────────────────────────────────────────────

vi.mock('../../src/modules/subscriptions/service.js', () => ({
  getSubscription: vi.fn().mockResolvedValue({
    id: 'sub-1',
    planTier: 'trial',
    status: 'trial',
    currentPeriodStart: null,
    currentPeriodEnd: null,
    trialEndsAt: null,
    cancelledAt: null,
    paystackAuthorizationCode: null,
    paystackCustomerCode: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  initiateSubscription: vi.fn().mockResolvedValue({
    authorizationUrl: 'https://checkout.paystack.com/sub-test',
    reference: 'bpos-sub-test-ref',
  }),
  cancelSubscription: vi.fn().mockResolvedValue(undefined),
  handleSubscriptionBillingWebhook: vi.fn().mockResolvedValue(undefined),
  activateSubscription: vi.fn().mockResolvedValue(undefined),
  startGracePeriod: vi.fn().mockResolvedValue(undefined),
  lapseSubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/modules/payments/service.js', () => ({
  initiatePayment: vi.fn(),
  handlePaystackWebhook: vi.fn().mockResolvedValue({ processed: true }),
}));

vi.mock('../../src/shared/db/client.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([{ businessEmail: 'owner@test.com' }]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  },
}));

vi.mock('../../src/shared/payments/paystack.js', () => ({
  paystackGateway: {
    name: 'paystack',
    initiatePayment: vi.fn(),
    verifyPayment: vi.fn(),
    validateWebhookSignature: vi.fn((rawBody: string, sig: string) => {
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
      // no-op: all features allowed in tests
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
    role: 'owner',
    email: 'owner@test.com',
    type: 'access',
  });
});

afterAll(async () => {
  await closeTestApp();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Subscriptions API', () => {
  it('GET /v1/subscriptions returns current subscription', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/subscriptions',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { status: string; planTier: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('trial');
    expect(body.data.planTier).toBe('trial');
  });

  it('GET /v1/subscriptions requires authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/subscriptions',
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /v1/subscriptions/initiate returns authorization URL', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/initiate',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { planTier: 'entry' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean; data: { authorizationUrl: string; reference: string } }>();
    expect(body.success).toBe(true);
    expect(body.data.authorizationUrl).toBe('https://checkout.paystack.com/sub-test');
    expect(body.data.reference).toBe('bpos-sub-test-ref');
  });

  it('POST /v1/subscriptions/initiate returns 400 for missing planTier', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/initiate',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/subscriptions/initiate returns 400 for invalid planTier', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/initiate',
      headers: { Authorization: `Bearer ${bearerToken}` },
      payload: { planTier: 'basic' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('POST /v1/subscriptions/cancel returns 200', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/subscriptions/cancel',
      headers: { Authorization: `Bearer ${bearerToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ success: boolean }>();
    expect(body.success).toBe(true);
  });

  it('POST /v1/payments/webhook/paystack routes subscription event to subscription handler', async () => {
    const payload = JSON.stringify({
      event: 'charge.success',
      data: {
        id: 'evt-sub-001',
        reference: 'bpos-sub-test-ref',
        amount: 350000,
        fees: 5000,
        status: 'success',
        authorization: {
          authorization_code: 'AUTH_abc123',
        },
        customer: {
          customer_code: 'CUS_xyz456',
        },
        metadata: {
          type: 'subscription',
          tenantId: 'tenant-test',
          schemaName: 'test_schema',
          planTier: 'entry',
        },
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
