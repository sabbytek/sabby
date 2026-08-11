import type { RequestContext } from '../../shared/types/controller.js';
import {
  listInventory,
  receiveStock,
  adjustStock,
  listMovements,
  getLowStock,
  getAvailability,
  transferStock,
} from './service.js';

export function list(
  ctx: RequestContext,
  query: { locationId?: string; variantId?: string },
): Promise<unknown> {
  return listInventory(ctx.schema, query);
}

export function receive(
  ctx: RequestContext,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
): Promise<unknown> {
  return receiveStock(ctx.schema, ctx.userId, input);
}

export function adjust(
  ctx: RequestContext,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
): Promise<unknown> {
  return adjustStock(ctx.schema, ctx.userId, input);
}

export function movements(
  ctx: RequestContext,
  query: {
    variantId?: string;
    from?: string;
    to?: string;
    page?: string;
    limit?: string;
  },
): Promise<unknown> {
  return listMovements(ctx.schema, {
    ...(query.variantId && { variantId: query.variantId }),
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
  });
}

export function lowStock(ctx: RequestContext, locationId?: string): Promise<unknown> {
  return getLowStock(ctx.schema, locationId);
}

export function availability(
  ctx: RequestContext,
  query: { sku?: string; variantId?: string },
): Promise<unknown> {
  return getAvailability(ctx.schema, query);
}

export function transfer(
  ctx: RequestContext,
  input: {
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    note?: string;
  },
): Promise<unknown> {
  return transferStock(ctx.schema, ctx.userId, input);
}
