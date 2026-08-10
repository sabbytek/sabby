import type { RequestContext } from '../../shared/types/controller.js';
import {
  listInventory,
  receiveStock,
  adjustStock,
  listMovements,
  getLowStock,
} from './service.js';

export async function list(
  ctx: RequestContext,
  query: { locationId?: string; variantId?: string },
) {
  return listInventory(ctx.schema, query);
}

export async function receive(
  ctx: RequestContext,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
) {
  return receiveStock(ctx.schema, ctx.userId, input);
}

export async function adjust(
  ctx: RequestContext,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
) {
  return adjustStock(ctx.schema, ctx.userId, input);
}

export async function movements(
  ctx: RequestContext,
  query: {
    variantId?: string;
    from?: string;
    to?: string;
    page?: string;
    limit?: string;
  },
) {
  return listMovements(ctx.schema, {
    ...(query.variantId && { variantId: query.variantId }),
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
  });
}

export async function lowStock(ctx: RequestContext, locationId?: string) {
  return getLowStock(ctx.schema, locationId);
}
