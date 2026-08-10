import crypto from 'crypto';
import type { DispatchGateway } from '../gateway.js';

// TRAKA Logistics API provider.
//
// Authentication: Bearer sk_live_... API key
// Tenant isolation: TRAKA scopes all data by API key — the `tenant_id` is
// implicit in the key, so no explicit tenant param is needed per-request.
//
// Fee formula (returned in pricing_breakdown on every order):
//   base_fee(₦500) + distance_fee(km × ₦100) + size_fee + speed_fee
//   + fuel_adjustment + platform_fee(subtotal × 15%)
//
// Webhook: each BPOS business registers a unique URL with TRAKA.
// BPOS uses /v1/dispatch/webhook/traka/:tenantId so the inbound route
// can resolve the tenant without needing metadata in the payload.

const TRAKA_BASE = 'https://api.traka.ng/v1';

// TRAKA package size enum
type TrakaSize = 'SMALL' | 'MEDIUM' | 'LARGE';
// TRAKA speed enum
type TrakaSpeed = 'STANDARD' | 'SAME_DAY' | 'EXPRESS';

interface TrakaOrderResponse {
  id: string;
  tracking_number: string;
  status: string;
  pricing_breakdown: {
    base_fee: number;
    distance_fee: number;
    size_fee: number;
    speed_fee: number;
    fuel_adjustment: number;
    subtotal: number;
    platform_fee: number;
    total_amount: number;
  };
  estimated_delivery_at: string;
  created_at: string;
}

interface TrakaTrackResponse {
  tracking_number: string;
  status: string;
  current_location?: string;
  events: Array<{ status: string; timestamp: string; location?: string }>;
}

async function trakaRequest<T>(path: string, apiKey: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${TRAKA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`TRAKA ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const trakaGateway: DispatchGateway = {
  name: 'traka',

  async getQuote(input, apiKey) {
    // TRAKA quotes are returned inline on order creation. For a standalone quote
    // we create a dry-run order or use the pricing endpoint if available.
    // Distance-based fee: call the pricing endpoint.
    const res = await trakaRequest<{
      total_amount: number;
      estimated_minutes: number;
      reference: string;
    }>(
      `/pricing?pickup=${encodeURIComponent(input.pickupAddress)}&delivery=${encodeURIComponent(input.deliveryAddress)}&weight_kg=${input.weightKg}`,
      apiKey,
    );
    return {
      feeKobo: Math.round(res.total_amount * 100),
      estimatedMinutes: res.estimated_minutes,
      providerReference: res.reference,
    };
  },

  async createShipment(input, apiKey) {
    // Derive size from weight (BPOS convention: <1 kg → SMALL, 1–5 kg → MEDIUM, >5 kg → LARGE)
    const size: TrakaSize =
      input.weightKg < 1 ? 'SMALL' : input.weightKg <= 5 ? 'MEDIUM' : 'LARGE';
    const speed: TrakaSpeed = 'STANDARD';

    const res = await trakaRequest<TrakaOrderResponse>('/orders', apiKey, {
      method: 'POST',
      body: JSON.stringify({
        pickup_address: input.pickupAddress,
        delivery_address: input.deliveryAddress,
        recipient: {
          name: input.recipientName,
          phone: input.recipientPhone,
        },
        package: {
          weight_kg: input.weightKg,
          size,
        },
        speed,
        metadata: {
          bpos_order_id: input.orderId,
          bpos_tenant_id: input.metadata['tenantId'] ?? '',
        },
      }),
    });

    return {
      trackingNumber: res.tracking_number,
      logisticsReference: res.id,
      estimatedDeliveryAt: new Date(res.estimated_delivery_at),
    };
  },

  async cancelShipment(reference, apiKey) {
    await trakaRequest<unknown>(`/orders/${reference}/cancel`, apiKey, { method: 'POST' });
  },

  async trackShipment(reference, apiKey) {
    const res = await trakaRequest<TrakaTrackResponse>(
      `/external/orders/${reference}`,
      apiKey,
    );
    return {
      status: res.status,
      ...(res.current_location !== undefined ? { location: res.current_location } : {}),
    };
  },

  validateWebhookSignature(rawBody, signature, webhookSecret) {
    // TRAKA signs webhooks with HMAC-SHA256 using the business webhook secret.
    // Header: X-Logistics-Signature: sha256=<hex>
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
    // TRAKA webhook shape
    const p = payload as {
      event_id: string;
      event: string;
      tracking_number: string;
      timestamp: string;
      metadata?: { bpos_order_id?: string; bpos_tenant_id?: string };
      data?: unknown;
    };

    // Map TRAKA event names to BPOS canonical event names
    const eventTypeMap: Record<string, string> = {
      'order.created': 'shipment.created',
      'order.picked_up': 'shipment.picked_up',
      'order.in_transit': 'shipment.in_transit',
      'order.out_for_delivery': 'shipment.out_for_delivery',
      'order.delivered': 'shipment.delivered',
      'order.failed': 'shipment.failed',
      'order.returned': 'shipment.returned',
      'order.cancelled': 'shipment.cancelled',
      'order.exception': 'shipment.exception',
    };

    return {
      eventType: eventTypeMap[p.event] ?? p.event,
      trackingNumber: p.tracking_number,
      orderId: p.metadata?.bpos_order_id ?? '',
      eventId: p.event_id,
      timestamp: new Date(p.timestamp),
      rawData: p.data,
    };
  },
};
