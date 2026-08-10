import crypto from 'crypto';
import { eq, and } from 'drizzle-orm';
import { db } from '../../shared/db/client.js';
import { withTenantSchema } from '../../shared/db/tenant.js';
import { tenantIntegrations, tenants } from '../../shared/db/schema/public.js';
import { orders, logisticsEvents } from '../../shared/db/schema/tenant.js';
import { encrypt, decrypt } from '../../shared/crypto/encrypt.js';
import { logisticsQueue } from '../../shared/queue/client.js';
import { NotFoundError, ValidationError, ExternalServiceError } from '../../shared/errors/types.js';
import { type DispatchGateway, type ProviderName, eventTypeToDispatchStatus } from './gateway.js';
import { genericDispatchGateway } from './providers/generic.js';
import { trakaGateway } from './providers/traka.js';

// ─── Gateway registry ─────────────────────────────────────────────────────────

function getGateway(providerName: ProviderName): DispatchGateway {
  if (providerName === 'traka') return trakaGateway;
  return genericDispatchGateway;
}

// ─── Integration config ───────────────────────────────────────────────────────

export interface LogisticsConfig {
  baseUrl?: string;
  webhookSecret: string;
}

export async function configureLogistics(
  tenantId: string,
  providerName: string,
  apiKey: string,
  config: LogisticsConfig,
): Promise<void> {
  const apiKeyEncrypted = encrypt(apiKey);

  await db
    .insert(tenantIntegrations)
    .values({
      id: crypto.randomUUID(),
      tenantId,
      integrationType: 'logistics',
      providerName,
      apiKeyEncrypted,
      config: config as unknown as Record<string, unknown>,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [tenantIntegrations.tenantId, tenantIntegrations.integrationType],
      set: {
        providerName,
        apiKeyEncrypted,
        config: config as unknown as Record<string, unknown>,
        isActive: true,
        updatedAt: new Date(),
      },
    });
}

export async function getDispatchConfig(tenantId: string) {
  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(
      and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.integrationType, 'logistics'),
        eq(tenantIntegrations.isActive, true),
      ),
    )
    .limit(1);

  if (!integration) return null;

  return {
    providerName: integration.providerName,
    config: integration.config,
    apiKey: '****', // never expose decrypted key via API
  };
}

// ─── Quote ────────────────────────────────────────────────────────────────────

export async function getQuote(
  tenantId: string,
  pickupAddress: string,
  deliveryAddress: string,
  weightKg: number,
) {
  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(
      and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.integrationType, 'logistics'),
        eq(tenantIntegrations.isActive, true),
      ),
    )
    .limit(1);

  if (!integration) {
    throw new ValidationError('No active logistics provider configured. Call POST /v1/dispatch/configure first.');
  }

  const apiKey = decrypt(integration.apiKeyEncrypted);
  const gateway = getGateway(integration.providerName);

  return gateway.getQuote({ pickupAddress, deliveryAddress, weightKg }, apiKey);
}

// ─── Dispatch order ───────────────────────────────────────────────────────────

export async function dispatchOrder(
  tenantId: string,
  schemaName: string,
  orderId: string,
  pickupAddress: string,
  recipientName: string,
  recipientPhone: string,
  weightKg: number,
) {
  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(
      and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.integrationType, 'logistics'),
        eq(tenantIntegrations.isActive, true),
      ),
    )
    .limit(1);

  if (!integration) {
    throw new ValidationError('No active logistics provider configured.');
  }

  const order = await withTenantSchema(schemaName, async (db) => {
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return o;
  });

  if (!order) throw new NotFoundError('Order', orderId);
  if (!order.deliveryAddress) {
    throw new ValidationError('Order has no delivery address. Set deliveryAddress on the order before dispatching.');
  }
  if (order.status !== 'processing') {
    throw new ValidationError(`Order must be in 'processing' status to dispatch. Current: '${order.status}'`);
  }

  const apiKey = decrypt(integration.apiKeyEncrypted);
  const gateway = getGateway(integration.providerName);

  let result;
  try {
    result = await gateway.createShipment(
      {
        orderId,
        pickupAddress,
        deliveryAddress: order.deliveryAddress ?? '',
        recipientName,
        recipientPhone,
        weightKg,
        metadata: { tenantId, orderId },
      },
      apiKey,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExternalServiceError(integration.providerName, msg);
  }

  // Update order: transition to dispatched, record tracking info
  await withTenantSchema(schemaName, async (tenantDb) => {
    await tenantDb
      .update(orders)
      .set({
        status: 'dispatched',
        logisticsProvider: integration.providerName,
        logisticsReference: result.logisticsReference,
        trackingNumber: result.trackingNumber,
        estimatedDeliveryAt: result.estimatedDeliveryAt,
        dispatchedAt: new Date(),
        dispatchStatus: 'dispatched',
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  });

  // Enqueue customer notification
  await logisticsQueue.add('notify-customer-dispatched', {
    tenantId,
    schemaName,
    orderId,
    trackingNumber: result.trackingNumber,
    providerName: integration.providerName,
  });

  return result;
}

// ─── Track shipment ───────────────────────────────────────────────────────────

export async function trackShipment(tenantId: string, schemaName: string, orderId: string) {
  const order = await withTenantSchema(schemaName, async (tenantDb) => {
    const [o] = await tenantDb.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    return o;
  });

  if (!order) throw new NotFoundError('Order', orderId);
  if (!order.logisticsReference || !order.logisticsProvider) {
    throw new ValidationError('Order has not been dispatched yet.');
  }

  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(
      and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.integrationType, 'logistics'),
        eq(tenantIntegrations.isActive, true),
      ),
    )
    .limit(1);

  if (!integration) throw new ValidationError('No active logistics provider configured.');

  const apiKey = decrypt(integration.apiKeyEncrypted);
  const gateway = getGateway(order.logisticsProvider);
  return gateway.trackShipment(order.logisticsReference, apiKey);
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

export interface LogisticsWebhookPayload {
  eventId: string;
  eventType: string;
  trackingNumber: string;
  timestamp: string;
  metadata?: { tenantId?: string; orderId?: string };
  data?: unknown;
}

export async function handleLogisticsWebhook(
  rawBody: Buffer,
  signature: string,
  providerName: string,
  payload: LogisticsWebhookPayload,
): Promise<void> {
  const tenantId = payload.metadata?.tenantId;
  const orderId = payload.metadata?.orderId;

  if (!tenantId || !orderId) {
    throw new ValidationError('Webhook payload missing metadata.tenantId or metadata.orderId');
  }

  // Load integration to get webhookSecret and schemaName
  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(
      and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.integrationType, 'logistics'),
        eq(tenantIntegrations.isActive, true),
      ),
    )
    .limit(1);

  if (!integration) return; // silently ignore if tenant no longer has integration

  const config = integration.config as LogisticsConfig | null;
  const webhookSecret = config?.webhookSecret;
  if (!webhookSecret) return;

  const gateway = getGateway(providerName);
  if (!gateway.validateWebhookSignature(rawBody, signature, webhookSecret)) {
    throw new ValidationError('Invalid webhook signature');
  }

  // Replay attack prevention: reject events older than 5 minutes
  const eventTime = new Date(payload.timestamp).getTime();
  if (Math.abs(Date.now() - eventTime) > 5 * 60 * 1000) {
    throw new ValidationError('Webhook timestamp is outside the 5-minute replay window');
  }

  // Load tenant schema name
  const tenantRow = await db
    .select({ schemaName: tenants.schemaName })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  const schemaName = tenantRow[0]?.schemaName;
  if (!schemaName) return;

  await withTenantSchema(schemaName, async (tenantDb) => {
    // Idempotency: check if eventId already processed
    const existing = await tenantDb
      .select({ id: logisticsEvents.id })
      .from(logisticsEvents)
      .where(eq(logisticsEvents.eventId, payload.eventId))
      .limit(1);

    if (existing.length > 0) return; // duplicate — silently ignore

    // Insert event record
    await tenantDb.insert(logisticsEvents).values({
      id: crypto.randomUUID(),
      orderId,
      eventType: payload.eventType,
      eventData: payload.data ?? null,
      eventId: payload.eventId,
      occurredAt: new Date(payload.timestamp),
    });

    // Map event type to dispatch status
    const newDispatchStatus = eventTypeToDispatchStatus(payload.eventType);
    if (newDispatchStatus) {
      const orderStatus = newDispatchStatus === 'delivered' ? 'fulfilled' : undefined;

      await tenantDb
        .update(orders)
        .set({
          dispatchStatus: newDispatchStatus,
          ...(orderStatus ? { status: orderStatus, fulfilledAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));
    }

    // Enqueue appropriate notification job
    const jobName =
      payload.eventType === 'shipment.delivered'
        ? 'notify-customer-delivered'
        : payload.eventType === 'shipment.failed'
          ? 'notify-merchant-failed'
          : null;

    if (jobName) {
      await logisticsQueue.add(jobName, {
        tenantId,
        schemaName,
        orderId,
        eventType: payload.eventType,
        trackingNumber: payload.trackingNumber,
      });
    }
  });
}
