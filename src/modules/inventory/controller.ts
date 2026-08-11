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

export async function list(
  ctx: RequestContext,
  query: { locationId?: string; variantId?: string },
): Promise<unknown> {
  const result = await listInventory(ctx.schema, query);
  return result;
}

export async function receive(
  ctx: RequestContext,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
): Promise<unknown> {
  const result = await receiveStock(ctx.schema, ctx.userId, input);
  return result;
}

export async function adjust(
  ctx: RequestContext,
  input: {
    variantId: string;
    locationId: string;
    quantity: number;
    note?: string;
  },
): Promise<unknown> {
  const result = await adjustStock(ctx.schema, ctx.userId, input);
  return result;
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
): Promise<unknown> {
  const result = await listMovements(ctx.schema, {
    ...(query.variantId && { variantId: query.variantId }),
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
    ...(query.page && { page: parseInt(query.page) }),
    ...(query.limit && { limit: parseInt(query.limit) }),
  });
  return result;
}

export async function lowStock(ctx: RequestContext, locationId?: string): Promise<unknown> {
  const result = await getLowStock(ctx.schema, locationId);
  return result;
}

export async function availability(
  ctx: RequestContext,
  query: { sku?: string; variantId?: string },
): Promise<unknown> {
  const result = await getAvailability(ctx.schema, query);
  return result;
}

export async function transfer(
  ctx: RequestContext,
  input: {
    variantId: string;
    fromLocationId: string;
    toLocationId: string;
    quantity: number;
    note?: string;
  },
): Promise<unknown> {
  const result = await transferStock(ctx.schema, ctx.userId, input);
  return result;
}
