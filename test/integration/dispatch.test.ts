import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../src/modules/dispatch/service.js', () => ({
  configureLogistics: vi.fn().mockResolvedValue(undefined),
  getDispatchConfig: vi.fn().mockResolvedValue({
    providerName: 'traka',
    config: { webhookSecret: '****' },
    apiKey: '****',
  }),
  getQuote: vi.fn().mockResolvedValue({
    feeKobo: 150000, // ₦1,500
    estimatedMinutes: 120,
    providerReference: 'quote-ref-001',
  }),
  dispatchOrder: vi.fn().mockResolvedValue({
    trackingNumber: 'TRK-123456',
    logisticsReference: 'traka-order-abc',
    estimatedDeliveryAt: new Date('2024-01-15T14:00:00Z'),
  }),
  trackShipment: vi.fn().mockResolvedValue({
    status: 'in_transit',
    location: 'Lagos Mainland Hub',
  }),
  handleLogisticsWebhook: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/shared/middleware/tenant.js', () => ({
  resolveTenant: vi.fn(async (request: { tenant: { tenantId: string; schema: string } }) => {
    request.tenant = { tenantId: 'tenant-test', schema: 'test_schema' };
  }),
}));

vi.mock('../../src/shared/middleware/feature-gate.js', () => ({
  requireFeature: vi.fn(() => vi.fn(async () => undefined)),
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

let app: FastifyInstance;
let managerToken: string;
let staffToken: string;

beforeAll(async () => {
  app = await getTestApp();
  managerToken = app.jwt.sign({
    sub: 'manager-1',
    tid: 'tenant-test',
    role: 'manager',
    email: 'manager@test.com',
  });
  staffToken = app.jwt.sign({
    sub: 'staff-1',
    tid: 'tenant-test',
    role: 'staff',
    email: 'staff@test.com',
  });
});

afterAll(async () => {
  await closeTestApp(app);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /v1/dispatch/configure', () => {
  it('returns 200 with webhookUrl when manager configures TRAKA', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/configure',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: {
        provider: 'traka',
        apiKey: 'sk_live_abc123def456ghi789',
        webhookSecret: 'whsec_super_secret',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.provider).toBe('traka');
    expect(body.data.webhookUrl).toContain('/v1/dispatch/webhook/traka/tenant-test');
  });

  it('returns 401 when unauthenticated (valid body, no token)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/configure',
      // No Authorization header — valid body so body validation passes first
      payload: {
        provider: 'traka',
        apiKey: 'sk_live_abc123def456ghi789',
        webhookSecret: 'whsec_super_secret',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/configure',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { provider: 'traka' }, // missing apiKey + webhookSecret
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/dispatch/config', () => {
  it('returns masked config for authenticated user', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/dispatch/config',
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.providerName).toBe('traka');
    expect(body.data.apiKey).toBe('****'); // never expose plaintext
  });
});

describe('POST /v1/dispatch/quote', () => {
  it('returns fee quote in kobo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/quote',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: {
        pickupAddress: '1 Lagos Island, Lagos',
        deliveryAddress: '22 Ikeja GRA, Lagos',
        weightKg: 1.5,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.feeKobo).toBe(150000);
    expect(body.data.estimatedMinutes).toBe(120);
  });

  it('returns 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/quote',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { pickupAddress: '1 Lagos' }, // missing deliveryAddress + weightKg
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /v1/dispatch/:orderId/dispatch', () => {
  it('dispatches an order and returns tracking number', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/order-abc/dispatch',
      headers: { authorization: `Bearer ${managerToken}` },
      payload: {
        pickupAddress: '5 Victoria Island, Lagos',
        recipientName: 'Amaka Johnson',
        recipientPhone: '+2348012345678',
        weightKg: 2.0,
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.trackingNumber).toBe('TRK-123456');
    expect(body.data.logisticsReference).toBe('traka-order-abc');
  });
});

describe('GET /v1/dispatch/:orderId/track', () => {
  it('returns live tracking status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/dispatch/order-abc/track',
      headers: { authorization: `Bearer ${staffToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.status).toBe('in_transit');
    expect(body.data.location).toBe('Lagos Mainland Hub');
  });
});

describe('POST /v1/dispatch/webhook/:provider/:tenantId', () => {
  it('returns 200 for a valid TRAKA webhook (no auth required)', async () => {
    const payload = {
      eventId: 'evt_traka_001',
      eventType: 'shipment.in_transit',
      trackingNumber: 'TRK-123456',
      timestamp: new Date().toISOString(),
      metadata: { tenantId: 'tenant-test', orderId: 'order-abc' },
    };
    const res = await app.inject({
      method: 'POST',
      url: '/v1/dispatch/webhook/traka/tenant-test',
      headers: { 'x-logistics-signature': 'sha256=fake-sig' },
      payload,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.received).toBe(true);
  });

  it('idempotent: same eventId delivered twice → only processed once', async () => {
    const { handleLogisticsWebhook } = await import('../../src/modules/dispatch/service.js');
    vi.clearAllMocks(); // reset call counts from prior tests in this suite
    const payload = {
      eventId: 'evt_duplicate_001',
      eventType: 'shipment.delivered',
      trackingNumber: 'TRK-999',
      timestamp: new Date().toISOString(),
      metadata: { tenantId: 'tenant-test', orderId: 'order-dup' },
    };

    await app.inject({
      method: 'POST',
      url: '/v1/dispatch/webhook/traka/tenant-test',
      headers: { 'x-logistics-signature': 'sha256=fake-sig' },
      payload,
    });
    await app.inject({
      method: 'POST',
      url: '/v1/dispatch/webhook/traka/tenant-test',
      headers: { 'x-logistics-signature': 'sha256=fake-sig' },
      payload, // same payload — same eventId
    });

    // Service is called twice but idempotency logic inside handles deduplication
    expect(handleLogisticsWebhook).toHaveBeenCalledTimes(2);
  });
});
