import type { RequestContext } from '../../shared/types/controller.js';
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
  return createLocation(ctx.schema, input);
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
  return updateLocation(ctx.schema, id, input);
}

export async function deactivate(ctx: RequestContext, id: string) {
  return deactivateLocation(ctx.schema, id);
}
