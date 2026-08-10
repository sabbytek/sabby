import crypto from 'crypto';
import type { DispatchGateway } from '../gateway.js';

// Generic provider that follows the BPOS-defined logistics API contract.
// Any logistics partner that implements the spec documented in the platform
// integration guide can use this adapter without code changes.
export const genericDispatchGateway: DispatchGateway = {
  name: 'generic',

  async getQuote(input, apiKey) {
    const url = 'https://api.logistics-provider.example.com/v1/quote';
    const res = await fetch(
      `${url}?pickup=${encodeURIComponent(input.pickupAddress)}&delivery=${encodeURIComponent(input.deliveryAddress)}&weightKg=${input.weightKg}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    if (!res.ok) throw new Error(`Provider quote failed: ${res.status}`);
    const body = await res.json() as { fee_ngn: number; estimated_minutes: number; reference: string };
    return {
      feeKobo: Math.round(body.fee_ngn * 100),
      estimatedMinutes: body.estimated_minutes,
      providerReference: body.reference,
    };
  },

  async createShipment(input, apiKey) {
    const url = 'https://api.logistics-provider.example.com/v1/shipments';
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pickup_address: input.pickupAddress,
        delivery_address: input.deliveryAddress,
        recipient_name: input.recipientName,
        recipient_phone: input.recipientPhone,
        weight_kg: input.weightKg,
        metadata: input.metadata,
      }),
    });
    if (!res.ok) throw new Error(`Provider shipment creation failed: ${res.status}`);
    const body = await res.json() as {
      tracking_number: string;
      logistics_reference: string;
      estimated_delivery_at: string;
    };
    return {
      trackingNumber: body.tracking_number,
      logisticsReference: body.logistics_reference,
      estimatedDeliveryAt: new Date(body.estimated_delivery_at),
    };
  },

  async cancelShipment(reference, apiKey) {
    const url = `https://api.logistics-provider.example.com/v1/shipments/${reference}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Provider cancellation failed: ${res.status}`);
  },

  async trackShipment(reference, apiKey) {
    const url = `https://api.logistics-provider.example.com/v1/shipments/${reference}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) throw new Error(`Provider tracking failed: ${res.status}`);
    const body = await res.json() as { status: string; location?: string };
    return { status: body.status, ...(body.location !== undefined ? { location: body.location } : {}) };
  },

  validateWebhookSignature(rawBody, signature, webhookSecret) {
    const expected = `sha256=${crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex')}`;
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  },

  normalizeWebhookEvent(payload) {
    const p = payload as {
      eventId: string;
      eventType: string;
      trackingNumber: string;
      timestamp: string;
      metadata?: { orderId?: string };
      data?: unknown;
    };
    return {
      eventType: p.eventType,
      trackingNumber: p.trackingNumber,
      orderId: p.metadata?.orderId ?? '',
      eventId: p.eventId,
      timestamp: new Date(p.timestamp),
      rawData: p.data,
    };
  },
};
