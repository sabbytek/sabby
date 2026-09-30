/**
 * Orders controller — orchestrates HTTP concerns, delegates business logic to service.
 */

import type { RequestContext } from '../../shared/types/controller.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
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

export async function create(ctx: RequestContext, input: CreateOrderInput) {
  const order = await createOrder(ctx.schema, ctx.userId, input);
  await auditUserAction(ctx, {
    action: 'order.created',
    targetType: 'order',
    targetId: order.id,
    metadata: { orderNumber: order.orderNumber, channel: order.channel },
  });
  return order;
}

export async function list(ctx: RequestContext, query: OrderListQuery) {
  return listOrders(ctx.schema, parseOrderQuery(query));
}

export async function get(ctx: RequestContext, orderId: string) {
  return getOrder(ctx.schema, orderId);
}

export async function confirm(ctx: RequestContext, orderId: string) {
  const order = await confirmOrder(ctx.schema, ctx.tenantId, orderId, ctx.userId);
  await auditUserAction(ctx, { action: 'order.confirmed', targetType: 'order', targetId: orderId });
  return order;
}

export async function process(ctx: RequestContext, orderId: string) {
  const order = await processOrder(ctx.schema, orderId);
  await auditUserAction(ctx, {
    action: 'order.processing',
    targetType: 'order',
    targetId: orderId,
  });
  return order;
}

export async function fulfil(ctx: RequestContext, orderId: string) {
  const order = await fulfillOrder(ctx.schema, orderId);
  await auditUserAction(ctx, { action: 'order.fulfilled', targetType: 'order', targetId: orderId });
  return order;
}

export async function cancel(ctx: RequestContext, orderId: string) {
  const order = await cancelOrder(ctx.schema, orderId, ctx.userId);
  await auditUserAction(ctx, { action: 'order.cancelled', targetType: 'order', targetId: orderId });
  return order;
}
