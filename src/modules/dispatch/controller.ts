/**
 * Dispatch controller — orchestrates HTTP concerns for logistics integration.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import {
  configureLogistics,
  getDispatchConfig,
  getQuote,
  dispatchOrder,
  trackShipment,
  handleLogisticsWebhook,
} from './service.js';
import type { LogisticsWebhookPayload } from './service.js';

export interface ConfigureInput {
  provider: string;
  apiKey: string;
  webhookSecret: string;
  baseUrl?: string;
}

export interface QuoteInput {
  pickupAddress: string;
  deliveryAddress: string;
  weightKg: number;
}

export interface DispatchInput {
  pickupAddress: string;
  recipientName: string;
  recipientPhone: string;
  weightKg: number;
}

export async function configure(ctx: RequestContext, input: ConfigureInput): Promise<unknown> {
  await configureLogistics(ctx.tenantId, input.provider, input.apiKey, {
    webhookSecret: input.webhookSecret,
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  });
  const webhookUrl = `${process.env['PLATFORM_BASE_URL'] ?? ''}/v1/dispatch/webhook/${input.provider}/${ctx.tenantId}`;
  return { provider: input.provider, webhookUrl };
}

export async function getConfig(ctx: RequestContext): Promise<unknown> {
  const result = await getDispatchConfig(ctx.tenantId);
  return result;
}

export async function quote(ctx: RequestContext, input: QuoteInput): Promise<unknown> {
  const result = await getQuote(ctx.tenantId, input.pickupAddress, input.deliveryAddress, input.weightKg);
  return result;
}

export async function dispatch(ctx: RequestContext, orderId: string, input: DispatchInput): Promise<unknown> {
  const result = await dispatchOrder(
    ctx.tenantId,
    ctx.schema,
    orderId,
    input.pickupAddress,
    input.recipientName,
    input.recipientPhone,
    input.weightKg,
  );
  return result;
}

export async function track(ctx: RequestContext, orderId: string): Promise<unknown> {
  const result = await trackShipment(ctx.tenantId, ctx.schema, orderId);
  return result;
}

export async function handleWebhook(
  rawBody: Buffer,
  signature: string,
  provider: string,
  tenantId: string,
  payload: LogisticsWebhookPayload,
): Promise<unknown> {
  if (!payload.metadata) payload.metadata = {};
  if (!payload.metadata.tenantId) payload.metadata.tenantId = tenantId;
  const result = await handleLogisticsWebhook(rawBody, signature, provider, payload);
  return result;
}
