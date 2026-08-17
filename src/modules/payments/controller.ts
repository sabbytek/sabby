/**
 * Payments controller — orchestrates HTTP concerns for payment initiation.
 * Webhook routes remain in routes.ts due to raw body parsing requirements.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import { initiatePayment, handlePaystackWebhook } from './service.js';
import type { PaystackWebhookData } from './service.js';

export interface InitiatePaymentInput {
  orderId: string;
  email: string;
}

export async function initiate(ctx: RequestContext, input: InitiatePaymentInput): Promise<unknown> {
  const result = await initiatePayment(ctx.schema, input.orderId, ctx.userId, input.email);
  return result;
}

/**
 * Routes webhook event to the appropriate handler based on metadata type.
 * Returns a result indicating whether the event was processed.
 */
export async function handleWebhook(
  tenantId: string,
  schemaName: string,
  eventType: string,
  data: PaystackWebhookData,
  meta: Record<string, unknown>,
): Promise<void> {
  if (meta['type'] === 'subscription') {
    // Import here to avoid circular dependency
    const { handleSubscriptionBillingWebhook } = await import(
      '../subscriptions/service.js'
    );
    const planTier = (meta['planTier'] as string) ?? '';
    const rawData = data as unknown as Record<string, unknown>;
    const authorization = rawData['authorization'] as Record<string, unknown> | undefined;
    const customer = rawData['customer'] as Record<string, unknown> | undefined;

    await handleSubscriptionBillingWebhook(
      eventType,
      tenantId,
      schemaName,
      planTier as 'entry' | 'growth' | 'enterprise',
      (authorization?.['authorization_code'] as string) ?? '',
      (customer?.['customer_code'] as string) ?? '',
    ).catch(() => {});
  } else {
    await handlePaystackWebhook(tenantId, schemaName, eventType, data);
  }
}
