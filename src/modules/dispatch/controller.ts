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

export async function configure(ctx: RequestContext, input: ConfigureInput) {
  await configureLogistics(ctx.tenantId, input.provider, input.apiKey, {
    webhookSecret: input.webhookSecret,
    ...(input.baseUrl ? { baseUrl: input.baseUrl } : {}),
  });
  const webhookUrl = `${process.env['PLATFORM_BASE_URL'] ?? ''}/v1/dispatch/webhook/${input.provider}/${ctx.tenantId}`;
  return { provider: input.provider, webhookUrl };
}

export async function getConfig(ctx: RequestContext) {
  return getDispatchConfig(ctx.tenantId);
}

export async function quote(ctx: RequestContext, input: QuoteInput) {
  return getQuote(ctx.tenantId, input.pickupAddress, input.deliveryAddress, input.weightKg);
}

export async function dispatch(ctx: RequestContext, orderId: string, input: DispatchInput) {
  return dispatchOrder(
    ctx.tenantId,
    ctx.schema,
    orderId,
    input.pickupAddress,
    input.recipientName,
    input.recipientPhone,
    input.weightKg,
  );
}

export async function track(ctx: RequestContext, orderId: string) {
  return trackShipment(ctx.tenantId, ctx.schema, orderId);
}

export async function handleWebhook(
  rawBody: Buffer,
  signature: string,
  provider: string,
  tenantId: string,
  payload: LogisticsWebhookPayload,
) {
  if (!payload.metadata) payload.metadata = {};
  if (!payload.metadata.tenantId) payload.metadata.tenantId = tenantId;
  return handleLogisticsWebhook(rawBody, signature, provider, payload);
}
