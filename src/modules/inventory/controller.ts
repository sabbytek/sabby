import type { RequestContext } from '../../shared/types/controller.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
import { listInventory, receiveStock, adjustStock, listMovements, getLowStock } from './service.js';

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
  const result = await receiveStock(ctx.schema, ctx.userId, input);
  await auditUserAction(ctx, {
    action: 'inventory.stock_received',
    targetType: 'variant',
    targetId: input.variantId,
    metadata: { locationId: input.locationId, quantity: input.quantity },
  });
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
) {
  const result = await adjustStock(ctx.schema, ctx.userId, input);
  await auditUserAction(ctx, {
    action: 'inventory.stock_adjusted',
    targetType: 'variant',
    targetId: input.variantId,
    metadata: { locationId: input.locationId, quantity: input.quantity },
    ...(input.note && { reason: input.note }),
  });
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
