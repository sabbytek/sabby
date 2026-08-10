// ─── Dispatch gateway abstraction ─────────────────────────────────────────────
// Same pattern as src/shared/payments/gateway.ts.
// Each logistics provider implements DispatchGateway and registers with getDispatchGateway().

export interface QuoteInput {
  pickupAddress: string;
  deliveryAddress: string;
  weightKg: number;
}

export interface QuoteResult {
  feeKobo: number;
  estimatedMinutes: number;
  providerReference: string;
}

export interface ShipmentInput {
  orderId: string;
  pickupAddress: string;
  deliveryAddress: string;
  recipientName: string;
  recipientPhone: string;
  weightKg: number;
  metadata: Record<string, string>; // must include tenantId for webhook routing
}

export interface ShipmentResult {
  trackingNumber: string;
  logisticsReference: string;
  estimatedDeliveryAt: Date;
}

export interface NormalizedWebhookEvent {
  eventType: string;
  trackingNumber: string;
  orderId: string;
  eventId: string;
  timestamp: Date;
  rawData?: unknown;
}

export interface DispatchGateway {
  name: string;
  getQuote(input: QuoteInput, apiKey: string): Promise<QuoteResult>;
  createShipment(input: ShipmentInput, apiKey: string): Promise<ShipmentResult>;
  cancelShipment(reference: string, apiKey: string): Promise<void>;
  trackShipment(reference: string, apiKey: string): Promise<{ status: string; location?: string }>;
  validateWebhookSignature(rawBody: Buffer, signature: string, webhookSecret: string): boolean;
  normalizeWebhookEvent(payload: unknown): NormalizedWebhookEvent;
}

// ─── Generic HTTP-based gateway (follows the provider spec documented in the plan) ──

// Resolves dispatch_status from provider event type
export function eventTypeToDispatchStatus(
  eventType: string,
): 'dispatched' | 'in_transit' | 'delivered' | 'failed' | 'returned' | null {
  switch (eventType) {
    case 'shipment.created':
    case 'shipment.picked_up':
      return 'dispatched';
    case 'shipment.in_transit':
    case 'shipment.out_for_delivery':
      return 'in_transit';
    case 'shipment.delivered':
      return 'delivered';
    case 'shipment.failed':
    case 'shipment.exception':
      return 'failed';
    case 'shipment.returned':
      return 'returned';
    default:
      return null;
  }
}

const SUPPORTED_PROVIDERS = ['sendstack', 'gig', 'dhl', 'kwik'] as const;
export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number] | string;
