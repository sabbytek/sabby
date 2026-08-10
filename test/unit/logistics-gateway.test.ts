import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ─── Encryption round-trip ─────────────────────────────────────────────────

describe('AES-256-GCM encryption', () => {
  const TEST_KEY = 'a'.repeat(64); // 32 bytes hex

  beforeEach(() => {
    vi.stubEnv('PLATFORM_ENCRYPTION_KEY', TEST_KEY);
    vi.resetModules(); // clear module cache so env is re-read
  });

  it('round-trips a plaintext value', async () => {
    const { encrypt, decrypt } = await import('../../src/shared/crypto/encrypt.js');
    const plain = 'sk_live_super_secret_api_key_1234567890';
    const blob = encrypt(plain);
    expect(blob).not.toBe(plain);
    expect(decrypt(blob)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', async () => {
    const { encrypt } = await import('../../src/shared/crypto/encrypt.js');
    const a = encrypt('same plaintext');
    const b = encrypt('same plaintext');
    expect(a).not.toBe(b); // different IV each time
  });

  it('decrypted value matches original after encryption', async () => {
    const { encrypt, decrypt } = await import('../../src/shared/crypto/encrypt.js');
    const secrets = ['sk_live_abc', '₦ unicode safe ₦', 'a'.repeat(500)];
    for (const s of secrets) {
      expect(decrypt(encrypt(s))).toBe(s);
    }
  });
});

// ─── Generic gateway webhook signature ────────────────────────────────────

describe('genericDispatchGateway.validateWebhookSignature', () => {
  const secret = 'whsec_test_secret_value';
  const body = Buffer.from(JSON.stringify({ eventType: 'shipment.delivered' }));

  function makeSignature(b: Buffer, s: string) {
    return `sha256=${crypto.createHmac('sha256', s).update(b).digest('hex')}`;
  }

  it('returns true for a valid HMAC signature', async () => {
    const { genericDispatchGateway } = await import(
      '../../src/modules/dispatch/providers/generic.js'
    );
    const sig = makeSignature(body, secret);
    expect(genericDispatchGateway.validateWebhookSignature(body, sig, secret)).toBe(true);
  });

  it('returns false for a tampered body', async () => {
    const { genericDispatchGateway } = await import(
      '../../src/modules/dispatch/providers/generic.js'
    );
    const sig = makeSignature(body, secret);
    const tamperedBody = Buffer.from(JSON.stringify({ eventType: 'shipment.cancelled' }));
    expect(genericDispatchGateway.validateWebhookSignature(tamperedBody, sig, secret)).toBe(false);
  });

  it('returns false for a wrong secret', async () => {
    const { genericDispatchGateway } = await import(
      '../../src/modules/dispatch/providers/generic.js'
    );
    const sig = makeSignature(body, 'wrong_secret');
    expect(genericDispatchGateway.validateWebhookSignature(body, sig, secret)).toBe(false);
  });

  it('returns false for a mismatched length signature (no panic)', async () => {
    const { genericDispatchGateway } = await import(
      '../../src/modules/dispatch/providers/generic.js'
    );
    expect(genericDispatchGateway.validateWebhookSignature(body, 'short', secret)).toBe(false);
  });
});

// ─── TRAKA gateway webhook event normalization ────────────────────────────

describe('trakaGateway.normalizeWebhookEvent', () => {
  it('maps order.delivered → shipment.delivered', async () => {
    const { trakaGateway } = await import('../../src/modules/dispatch/providers/traka.js');
    const result = trakaGateway.normalizeWebhookEvent({
      event_id: 'evt_001',
      event: 'order.delivered',
      tracking_number: 'TRK-999',
      timestamp: '2024-01-15T12:00:00Z',
      metadata: { bpos_order_id: 'order_abc', bpos_tenant_id: 'tenant_xyz' },
    });
    expect(result.eventType).toBe('shipment.delivered');
    expect(result.orderId).toBe('order_abc');
    expect(result.eventId).toBe('evt_001');
    expect(result.trackingNumber).toBe('TRK-999');
  });

  it('maps order.in_transit → shipment.in_transit', async () => {
    const { trakaGateway } = await import('../../src/modules/dispatch/providers/traka.js');
    const result = trakaGateway.normalizeWebhookEvent({
      event_id: 'evt_002',
      event: 'order.in_transit',
      tracking_number: 'TRK-888',
      timestamp: '2024-01-15T10:00:00Z',
      metadata: { bpos_order_id: 'order_xyz' },
    });
    expect(result.eventType).toBe('shipment.in_transit');
  });

  it('passes through unknown event types unchanged', async () => {
    const { trakaGateway } = await import('../../src/modules/dispatch/providers/traka.js');
    const result = trakaGateway.normalizeWebhookEvent({
      event_id: 'evt_003',
      event: 'order.custom_event',
      tracking_number: 'TRK-777',
      timestamp: '2024-01-15T09:00:00Z',
      metadata: {},
    });
    expect(result.eventType).toBe('order.custom_event');
  });
});

// ─── eventTypeToDispatchStatus mapping ────────────────────────────────────

describe('eventTypeToDispatchStatus', () => {
  it('maps all terminal events correctly', async () => {
    const { eventTypeToDispatchStatus } = await import('../../src/modules/dispatch/gateway.js');

    expect(eventTypeToDispatchStatus('shipment.created')).toBe('dispatched');
    expect(eventTypeToDispatchStatus('shipment.picked_up')).toBe('dispatched');
    expect(eventTypeToDispatchStatus('shipment.in_transit')).toBe('in_transit');
    expect(eventTypeToDispatchStatus('shipment.out_for_delivery')).toBe('in_transit');
    expect(eventTypeToDispatchStatus('shipment.delivered')).toBe('delivered');
    expect(eventTypeToDispatchStatus('shipment.failed')).toBe('failed');
    expect(eventTypeToDispatchStatus('shipment.exception')).toBe('failed');
    expect(eventTypeToDispatchStatus('shipment.returned')).toBe('returned');
    expect(eventTypeToDispatchStatus('shipment.cancelled')).toBe(null);
    expect(eventTypeToDispatchStatus('unknown.event')).toBe(null);
  });
});

// ─── Ledger templates: delivery fee + logistics cost ─────────────────────

describe('deliveryFeeCollectedTemplate', () => {
  it('debits Cash and credits Revenue', async () => {
    const { deliveryFeeCollectedTemplate } = await import(
      '../../src/modules/ledger/templates.js'
    );
    const draft = deliveryFeeCollectedTemplate('order-1', 50000);
    const debit = draft.lines.find((l) => l.type === 'debit');
    const credit = draft.lines.find((l) => l.type === 'credit');
    expect(debit?.accountCode).toBe('1000');
    expect(credit?.accountCode).toBe('4000');
    expect(debit?.amountKobo).toBe(50000);
  });

  it('produces a balanced entry', async () => {
    const { deliveryFeeCollectedTemplate } = await import(
      '../../src/modules/ledger/templates.js'
    );
    const { lines } = deliveryFeeCollectedTemplate('order-1', 30000);
    const debits = lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
    const credits = lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
    expect(debits).toBe(credits);
  });
});

describe('logisticsCostTemplate', () => {
  it('debits Logistics Costs (5400) and credits Cash', async () => {
    const { logisticsCostTemplate } = await import('../../src/modules/ledger/templates.js');
    const draft = logisticsCostTemplate('order-1', 75000);
    const debit = draft.lines.find((l) => l.type === 'debit');
    const credit = draft.lines.find((l) => l.type === 'credit');
    expect(debit?.accountCode).toBe('5400');
    expect(credit?.accountCode).toBe('1000');
    expect(draft.referenceType).toBe('logistics_cost');
  });

  it('produces a balanced entry', async () => {
    const { logisticsCostTemplate } = await import('../../src/modules/ledger/templates.js');
    const { lines } = logisticsCostTemplate('order-1', 75000);
    const debits = lines.filter((l) => l.type === 'debit').reduce((s, l) => s + l.amountKobo, 0);
    const credits = lines.filter((l) => l.type === 'credit').reduce((s, l) => s + l.amountKobo, 0);
    expect(debits).toBe(credits);
  });
});
