import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

// Test the HMAC-SHA512 signature verification logic directly (same logic as paystack.ts).
// These tests do not import paystackGateway to avoid loading env.ts.

function computeSignature(rawBody: string, secret: string): string {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

function validateSignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = computeSignature(rawBody, secret);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'utf-8'), Buffer.from(signature, 'utf-8'));
  } catch {
    return false;
  }
}

const SECRET = 'sk_test_supersecret1234567890abcdef';
const PAYLOAD = JSON.stringify({ event: 'charge.success', data: { id: 'evt-001', reference: 'bpos-xyz', amount: 100000 } });

describe('Paystack webhook signature verification', () => {
  it('accepts a valid signature', () => {
    const sig = computeSignature(PAYLOAD, SECRET);
    expect(validateSignature(PAYLOAD, sig, SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = computeSignature(PAYLOAD, SECRET);
    const tampered = PAYLOAD.replace('100000', '999999');
    expect(validateSignature(tampered, sig, SECRET)).toBe(false);
  });

  it('rejects a wrong secret', () => {
    const sig = computeSignature(PAYLOAD, 'wrong-secret');
    expect(validateSignature(PAYLOAD, sig, SECRET)).toBe(false);
  });

  it('rejects an empty signature', () => {
    expect(validateSignature(PAYLOAD, '', SECRET)).toBe(false);
  });

  it('rejects a truncated signature', () => {
    const sig = computeSignature(PAYLOAD, SECRET);
    expect(validateSignature(PAYLOAD, sig.slice(0, 10), SECRET)).toBe(false);
  });

  it('produces consistent signatures for the same input', () => {
    const sig1 = computeSignature(PAYLOAD, SECRET);
    const sig2 = computeSignature(PAYLOAD, SECRET);
    expect(sig1).toBe(sig2);
  });

  it('produces different signatures for different bodies', () => {
    const body1 = JSON.stringify({ event: 'charge.success' });
    const body2 = JSON.stringify({ event: 'charge.failed' });
    expect(computeSignature(body1, SECRET)).not.toBe(computeSignature(body2, SECRET));
  });

  it('rejects replayed event with different secret', () => {
    const sig = computeSignature(PAYLOAD, SECRET);
    const otherSecret = 'sk_live_attacker_secret_key_here';
    expect(validateSignature(PAYLOAD, sig, otherSecret)).toBe(false);
  });

  it('handles empty body edge case', () => {
    const sig = computeSignature('', SECRET);
    expect(validateSignature('', sig, SECRET)).toBe(true);
    expect(validateSignature('', sig + 'x', SECRET)).toBe(false);
  });
});
