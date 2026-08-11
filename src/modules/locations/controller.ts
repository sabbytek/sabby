import type { RequestContext } from '../../shared/types/controller.js';
import {
  listLocations,
  getLocation,
  createLocation,
  updateLocation,
  deactivateLocation,
} from './service.js';

export async function list(ctx: RequestContext): Promise<unknown> {
  const result = await listLocations(ctx.schema);
  return result;
}

export async function get(ctx: RequestContext, id: string): Promise<unknown> {
  const result = await getLocation(ctx.schema, id);
  return result;
}

export async function create(
  ctx: RequestContext,
  input: {
    name: string;
    address?: string;
    phone?: string;
    isDefault?: boolean;
  },
): Promise<unknown> {
  const result = await createLocation(ctx.schema, input);
  return result;
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
): Promise<unknown> {
  const result = await updateLocation(ctx.schema, id, input);
  return result;
}

export async function deactivate(ctx: RequestContext, id: string): Promise<unknown> {
  const result = await deactivateLocation(ctx.schema, id);
  return result;
}
