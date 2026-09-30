import type { RequestContext } from '../../shared/types/controller.js';
import { auditUserAction } from '../../shared/audit/tenant-audit.js';
import {
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deactivateLocation,
} from './service.js';

export async function list(ctx: RequestContext) {
  return listLocations(ctx.schema);
}

export async function get(ctx: RequestContext, id: string) {
  return getLocation(ctx.schema, id);
}

export async function create(
  ctx: RequestContext,
  input: {
    name: string;
    address?: string;
    phone?: string;
    isDefault?: boolean;
  },
) {
  const location = await createLocation(ctx.schema, input);
  await auditUserAction(ctx, {
    action: 'location.created',
    targetType: 'location',
    targetId: location.id,
    metadata: { name: input.name },
  });
  return location;
}

export async function update(
  ctx: RequestContext,
  id: string,
  input: Partial<{
    name: string;
    address: string | null;
    phone: string | null;
    isDefault: boolean;
    isActive: boolean;
  }>,
) {
  const location = await updateLocation(ctx.schema, id, input);
  await auditUserAction(ctx, {
    action: 'location.updated',
    targetType: 'location',
    targetId: id,
    metadata: { fields: Object.keys(input) },
  });
  return location;
}

export async function deactivate(ctx: RequestContext, id: string) {
  const result = await deactivateLocation(ctx.schema, id);
  await auditUserAction(ctx, {
    action: 'location.deactivated',
    targetType: 'location',
    targetId: id,
  });
  return result;
}
