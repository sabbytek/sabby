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
  return createOrder(ctx.schema, ctx.userId, input);
}

export async function list(ctx: RequestContext, query: OrderListQuery) {
  return listOrders(ctx.schema, parseOrderQuery(query));
}

export async function get(ctx: RequestContext, orderId: string) {
  return getOrder(ctx.schema, orderId);
}

export async function confirm(ctx: RequestContext, orderId: string) {
  return confirmOrder(ctx.schema, ctx.tenantId, orderId, ctx.userId);
}

export async function process(ctx: RequestContext, orderId: string) {
  return processOrder(ctx.schema, orderId);
}

export async function fulfil(ctx: RequestContext, orderId: string) {
  return fulfillOrder(ctx.schema, orderId);
}

export async function cancel(ctx: RequestContext, orderId: string) {
  return cancelOrder(ctx.schema, orderId, ctx.userId);
}
