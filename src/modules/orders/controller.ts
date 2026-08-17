/**
 * Orders controller — orchestrates HTTP concerns, delegates business logic to service.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import type { CreateOrderInput } from './service.js';
import {
  createOrder,
  listOrders,
  getOrder,
  confirmOrder,
  processOrder,
  fulfillOrder,
  cancelOrder,
} from './service.js';
import { sendPosReceipt } from './receipt.service.js';
import { db } from '../../shared/db/client.js';
import { tenants } from '../../shared/db/schema/public.js';
import { eq } from 'drizzle-orm';

export interface OrderListQuery {
  page?: string;
  limit?: string;
  status?: string;
  channel?: string;
  from?: string;
  to?: string;
}

function parseOrderQuery(raw: OrderListQuery) {
  return {
    ...(raw.page && { page: parseInt(raw.page) }),
    ...(raw.limit && { limit: parseInt(raw.limit) }),
    ...(raw.status && { status: raw.status }),
    ...(raw.channel && { channel: raw.channel }),
    ...(raw.from && { from: raw.from }),
    ...(raw.to && { to: raw.to }),
  };
}

export async function create(ctx: RequestContext, input: CreateOrderInput): Promise<unknown> {
  const result = await createOrder(ctx.schema, ctx.userId, input);
  return result;
}

export async function list(ctx: RequestContext, query: OrderListQuery): Promise<unknown> {
  const result = await listOrders(ctx.schema, parseOrderQuery(query));
  return result;
}

export async function get(ctx: RequestContext, orderId: string): Promise<unknown> {
  const result = await getOrder(ctx.schema, orderId);
  return result;
}

export async function confirm(ctx: RequestContext, orderId: string): Promise<unknown> {
  const result = await confirmOrder(ctx.schema, ctx.tenantId, orderId, ctx.userId);
  return result;
}

export async function process(ctx: RequestContext, orderId: string): Promise<unknown> {
  const result = await processOrder(ctx.schema, orderId);
  return result;
}

export async function fulfil(ctx: RequestContext, orderId: string): Promise<unknown> {
  const result = await fulfillOrder(ctx.schema, orderId);
  return result;
}

export async function cancel(ctx: RequestContext, orderId: string): Promise<unknown> {
  const result = await cancelOrder(ctx.schema, orderId, ctx.userId);
  return result;
}

export async function receipt(
  ctx: RequestContext,
  orderId: string,
  channels: Array<'print' | 'whatsapp' | 'email'>,
): Promise<unknown> {
  const [tenant] = await db
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, ctx.tenantId))
    .limit(1);

  return sendPosReceipt(
    ctx.tenantId,
    ctx.schema,
    orderId,
    tenant?.name ?? '',
    channels,
  );
}
